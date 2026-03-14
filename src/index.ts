import readline from 'readline';
import { loadConfig, validateConfig } from './config.js';
import { ExcelReader } from './excel-reader.js';
import { HttpClient } from './http-client.js';
import { Searcher } from './searcher.js';
import { Downloader } from './downloader.js';
import { logger } from './logger.js';
import { acquireLock, releaseLock } from './lock.js';
import { BookInfo, SearchResult } from './types.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function promptUser(message: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(message, answer => {
      resolve(answer.trim());
    });
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  backoff: number[]
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = backoff[i] || backoff[backoff.length - 1];
        logger.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

async function main(): Promise<void> {
  logger.info('Starting Anna\'s Archive Book Downloader');

  // Load and validate config
  const config = loadConfig();
  validateConfig(config);

  // Acquire lock
  if (!acquireLock()) {
    process.exit(1);
  }

  // Setup graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...');
    releaseLock();
    rl.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Initialize components
  const excelReader = new ExcelReader(config.excelFile);
  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);
  const downloader = new Downloader(config, httpClient);

  // Read books
  const books = excelReader.readBooks();

  let processed = 0;
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const book of books) {
    processed++;
    logger.info(`Processing ${processed}/${books.length}: ${book.chineseTitle || book.englishTitle}`);

    try {
      // Check if already processed successfully (downloaded or not found)
      const skipStatuses = ['已下载', '未找到'];
      if (skipStatuses.includes(book.downloadStatus)) {
        logger.info(`Skipping - status: ${book.downloadStatus}`);
        skipped++;
        continue;
      }

      // Determine search method
      let searchResult: SearchResult | null = null;

      if (book.bookLink) {
        // Use existing MD5 from book link
        const md5 = downloader.extractMd5FromUrl(book.bookLink);
        if (md5) {
          searchResult = {
            md5,
            title: book.chineseTitle || book.englishTitle,
            author: book.chineseAuthor || book.englishAuthor,
            format: 'pdf',
            language: '',
            size: '',
            sizeBytes: 0,
            year: '',
            publisher: '',
          };
        } else {
          logger.warn(`Invalid book link: ${book.bookLink}`);
        }
      }

      // Search if no direct link
      if (!searchResult) {
        const results = await searcher.search(book);
        const searchTitle = book.language === 'en' ? book.englishTitle : book.chineseTitle;
        const searchAuthor = book.language === 'en' ? book.englishAuthor : book.chineseAuthor;
        searchResult = searcher.selectBestResult(results, searchTitle, searchAuthor);
      }

      if (!searchResult) {
        logger.warn(`Not found: ${book.chineseTitle || book.englishTitle}`);
        excelReader.updateStatus(book.rowIndex, '未找到');
        failed++;
        continue;
      }

      // Download with retry
      const result = await withRetry(
        () => downloader.download(book, searchResult!),
        config.maxRetries,
        [1000, 2000, 4000]
      );

      if (result.success) {
        excelReader.updateStatus(book.rowIndex, '已下载', `https://annas-archive.gl/md5/${searchResult.md5}`);
        downloaded++;
      } else {
        excelReader.updateStatus(book.rowIndex, `下载失败: ${result.error}`);
        failed++;
      }

      // Save Excel progress
      excelReader.save();

      // Rate limiting
      await sleep(config.rateLimitMs);

    } catch (error) {
      const errorMsg = (error as Error).message;

      if (errorMsg === 'CAPTCHA_DETECTED') {
        logger.warn('CAPTCHA detected. Please solve it and update cookies.json.');
        const answer = await promptUser('Press Enter to continue or type "quit" to abort: ');
        if (answer.toLowerCase() === 'quit') {
          break;
        }
        // Reload cookies after user updates cookies.json
        httpClient.reloadCookies();
        continue;
      }

      if (errorMsg === 'RATE_LIMITED') {
        await sleep(60000);
        continue;
      }

      if (errorMsg === 'CONSECUTIVE_FAILURES') {
        const answer = await promptUser('Press Enter to continue or type "quit" to abort: ');
        if (answer.toLowerCase() === 'quit') {
          break;
        }
        continue;
      }

      logger.error(`Unexpected error: ${errorMsg}`);
      excelReader.updateStatus(book.rowIndex, `错误: ${errorMsg}`);
      failed++;
    }
  }

  // Final save
  excelReader.save();

  // Summary
  logger.info('='.repeat(50));
  logger.info(`Completed: ${processed} processed, ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
  logger.info('='.repeat(50));

  releaseLock();
  rl.close();
}

main().catch(error => {
  logger.error(`Fatal error: ${error.message}`);
  releaseLock();
  process.exit(1);
});
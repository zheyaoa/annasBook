import readline from 'readline';
import { loadConfig, validateConfig } from './config.js';
import { ExcelReader } from './excel-reader.js';
import { HttpClient } from './http-client.js';
import { Searcher } from './searcher.js';
import { Downloader } from './downloader.js';
import { logger } from './logger.js';
import { acquireLock, releaseLock } from './lock.js';
import { BookInfo, SearchResult } from './types.js';

interface CliArgs {
  title: string;
  author?: string;
}

function parseCliArgs(): CliArgs | null {
  const args = process.argv.slice(2);
  const result: CliArgs = { title: '' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      result.title = args[i + 1];
      i++;
    } else if (args[i] === '--author' && args[i + 1]) {
      result.author = args[i + 1];
      i++;
    }
  }

  return result.title ? result : null;
}

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

async function runCliMode(cliArgs: CliArgs): Promise<void> {
  logger.info('Starting CLI download mode');

  // Load config without Excel requirement
  const config = loadConfig('./config.json', { skipExcelCheck: true });
  validateConfig(config, { skipExcelCheck: true });

  // Initialize components
  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);
  const downloader = new Downloader(config, httpClient);

  // Build BookInfo from CLI args
  const book: BookInfo = {
    rowIndex: 0,
    language: 'en',
    chineseTitle: '',
    englishTitle: cliArgs.title,
    chineseAuthor: '',
    englishAuthor: cliArgs.author || '',
    confidence: '',
    downloadStatus: '',
    bookLink: '',
  };

  try {
    // Search
    const results = await searcher.search(book);

    if (results.length === 0) {
      logger.error('Book not found');
      process.exit(1);
    }

    logger.info(`Found ${results.length} results`);

    // Select best match
    const bestMatch = searcher.selectBestResult(results, cliArgs.title);

    if (!bestMatch) {
      logger.error('No suitable match found');
      process.exit(1);
    }

    logger.info(`Best match: ${bestMatch.title} (${bestMatch.format}, ${bestMatch.size || 'unknown size'})`);

    // Download
    const downloadResult = await downloader.download(book, bestMatch);

    if (downloadResult.success) {
      logger.info(`Downloaded to: ${downloadResult.filePath}`);
    } else {
      logger.error(`Download failed: ${downloadResult.error}`);
      process.exit(1);
    }

  } catch (error) {
    const errorMsg = (error as Error).message;

    if (errorMsg === 'CAPTCHA_DETECTED') {
      logger.error('CAPTCHA detected. Please use Excel mode with interactive CAPTCHA handling.');
      process.exit(1);
    }

    logger.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  // Check for CLI mode
  const cliArgs = parseCliArgs();
  if (cliArgs) {
    await runCliMode(cliArgs);
    return;
  }

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
      // Check if already downloaded
      if (book.downloadStatus && book.downloadStatus !== '') {
        logger.info(`Skipping - already marked as ${book.downloadStatus}`);
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
          };
        } else {
          logger.warn(`Invalid book link: ${book.bookLink}`);
        }
      }

      // Search if no direct link
      if (!searchResult) {
        const results = await searcher.search(book);
        searchResult = searcher.selectBestResult(results, book.language === 'en' ? book.englishTitle : book.chineseTitle);
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
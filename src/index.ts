import readline from 'readline';
import { loadConfig, validateConfig } from './config.js';
import { ExcelReader } from './excel-reader.js';
import { HttpClient } from './http-client.js';
import { Searcher } from './searcher.js';
import { Downloader } from './downloader.js';
import { logger } from './logger.js';
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

  const config = loadConfig();
  validateConfig(config);

  const shutdown = () => {
    logger.info('Shutting down...');
    rl.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const excelReader = new ExcelReader(config.excelFile);
  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);
  const downloader = new Downloader(config, httpClient);

  const books = excelReader.readBooks();

  let processed = 0;
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const book of books) {
    processed++;
    logger.info(`Processing ${processed}/${books.length}: ${book.chineseTitle || book.englishTitle}`);

    try {
      const skipStatuses = ['已下载', '未找到'];
      if (skipStatuses.includes(book.downloadStatus)) {
        skipped++;
        continue;
      }

      const results = await searcher.search(book);
      const searchTitle = book.language === 'en' ? book.englishTitle : book.chineseTitle;
      const searchAuthor = book.language === 'en' ? book.englishAuthor : book.chineseAuthor;
      const searchResult = await searcher.selectBestResult(results, searchTitle, searchAuthor, book.language);

      if (!searchResult) {
        excelReader.updateStatus(book.rowIndex, '未找到');
        failed++;
        continue;
      }

      const details = await searcher.fetchBookDetails(searchResult.md5);
      searchResult.year = details.year;
      searchResult.publisher = details.publisher;

      const result = await withRetry(
        () => downloader.download(book, searchResult!),
        config.maxRetries,
        [1000, 2000, 4000]
      );

      if (result.success) {
        excelReader.updateStatus(book.rowIndex, '已下载', `https://annas-archive.gl/md5/${searchResult.md5}`);
        if (result.downloadUrl) {
          excelReader.updateDownloadUrl(book.rowIndex, result.downloadUrl);
        }
        downloaded++;

        if (config.downloadLimit && config.downloadLimit > 0 && downloaded >= config.downloadLimit) {
          logger.info(`Reached download limit: ${config.downloadLimit}`);
          excelReader.save();
          break;
        }
      } else {
        const isTimeout = result.error?.includes('timeout') || result.error?.includes('ETIMEDOUT');
        if (isTimeout) {
          logger.warn(`Download timeout, skipping: ${book.chineseTitle || book.englishTitle}`);
          excelReader.updateStatus(book.rowIndex, '下载超时');
        } else {
          excelReader.updateStatus(book.rowIndex, `下载失败: ${result.error}`);
          failed++;
        }
        // 无论成功失败，都记录下载链接
        if (result.downloadUrl) {
          excelReader.updateDownloadUrl(book.rowIndex, result.downloadUrl);
        }
      }

      excelReader.save();

      await sleep(config.rateLimitMs);

    } catch (error) {
      const errorMsg = (error as Error).message;

      // RATE_LIMITED: wait 60s and continue
      if (errorMsg === 'RATE_LIMITED') {
        await sleep(60000);
        continue;
      }

      // Fatal errors: stop immediately
      const fatalErrors = ['CAPTCHA_DETECTED', 'CONSECUTIVE_FAILURES', 'NO_DOWNLOADS_LEFT'];
      if (fatalErrors.includes(errorMsg)) {
        logger.error(`Fatal error: ${errorMsg}. Stopping.`);
        break;
      }

      logger.error(`Unexpected error: ${errorMsg}`);
      excelReader.updateStatus(book.rowIndex, `错误: ${errorMsg}`);
      failed++;
    }
  }

  excelReader.save();

  logger.info('='.repeat(50));
  logger.info(`Completed: ${processed} processed, ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
  logger.info('='.repeat(50));

  rl.close();
}

main().catch(error => {
  logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
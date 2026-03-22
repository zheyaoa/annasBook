import { loadConfig, validateConfig } from '../src/config.js';
import { ExcelReader } from '../src/excel-reader.js';
import { HttpClient } from '../src/http-client.js';
import { Searcher } from '../src/searcher.js';
import { Downloader } from '../src/downloader.js';
import { logger, setQuiet } from '../src/logger.js';
import { FATAL_ERRORS } from '../src/types.js';
import { sleep, withRetry } from '../src/utils.js';

interface BatchArgs {
  excel?: string;
  output?: string;
  json?: boolean;
  limit?: number;
}

interface BatchResult {
  row: number;
  title: string;
  success: boolean;
  filePath?: string;
  error?: string;
  md5?: string;
}

function parseArgs(): BatchArgs {
  const args = process.argv.slice(2);
  const result: BatchArgs = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--excel' && args[i + 1]) {
      result.excel = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    } else if (args[i] === '--json') {
      result.json = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      const limit = parseInt(args[i + 1]);
      if (!isNaN(limit) && limit > 0) {
        result.limit = limit;
      }
      i++;
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
Usage: npm run batch -- [options]

Options:
  --excel <file>   Path to Excel file with book list (required)
  --output <dir>   Output directory for downloads
  --limit <n>      Maximum number of downloads
  --json           Output results as JSON

Examples:
  npm run batch -- --excel ./books.xlsx
  npm run batch -- --excel ./books.xlsx --output ./downloads
  npm run batch -- --excel ./books.xlsx --json
`);
}

async function main(): Promise<void> {
  const args = parseArgs();

  // Enable quiet mode for JSON output
  if (args.json) {
    setQuiet(true);
  }

  if (!args.excel) {
    if (args.json) {
      console.log(JSON.stringify({
        success: false,
        error: 'MISSING_ARGS',
        message: '--excel is required'
      }));
    } else {
      console.error('Error: --excel is required\n');
      printUsage();
    }
    process.exit(1);
  }

  // Load config
  const config = loadConfig('./config.json', { excelFile: args.excel });
  validateConfig(config);

  // Override output dir if specified
  if (args.output) {
    config.downloadDir = args.output;
  }

  // Override download limit if specified
  if (args.limit) {
    config.downloadLimit = args.limit;
  }

  const excelReader = new ExcelReader(config.excelFile);
  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);
  const downloader = new Downloader(config, httpClient);

  const books = excelReader.readBooks();
  const results: BatchResult[] = [];

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const book of books) {
    const title = book.chineseTitle || book.englishTitle;

    if (!args.json) {
      logger.info(`Processing: ${title}`);
    }

    try {
      const skipStatuses = ['已下载', '未找到'];
      if (skipStatuses.includes(book.downloadStatus)) {
        skipped++;
        results.push({
          row: book.rowIndex,
          title,
          success: true,
          error: 'Skipped (already processed)'
        });
        continue;
      }

      const searchResults = await searcher.search(book);
      const searchTitle = book.language === 'en' ? book.englishTitle : book.chineseTitle;
      const searchAuthor = book.language === 'en' ? book.englishAuthor : book.chineseAuthor;
      const searchResult = await searcher.selectBestResult(searchResults, searchTitle, searchAuthor, book.language);

      if (!searchResult) {
        excelReader.updateStatus(book.rowIndex, '未找到');
        failed++;
        results.push({
          row: book.rowIndex,
          title,
          success: false,
          error: 'No match found'
        });
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
        results.push({
          row: book.rowIndex,
          title,
          success: true,
          filePath: result.filePath,
          md5: searchResult.md5
        });

        if (config.downloadLimit && config.downloadLimit > 0 && downloaded >= config.downloadLimit) {
          if (!args.json) {
            logger.info(`Reached download limit: ${config.downloadLimit}`);
          }
          excelReader.save();
          break;
        }
      } else {
        const isTimeout = result.error?.includes('timeout') || result.error?.includes('ETIMEDOUT');
        const errorMsg = isTimeout ? '下载超时' : result.error;
        excelReader.updateStatus(book.rowIndex, `下载失败: ${errorMsg}`);
        failed++;
        results.push({
          row: book.rowIndex,
          title,
          success: false,
          error: result.error
        });
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
      if (FATAL_ERRORS.includes(errorMsg as any)) {
        excelReader.save();

        if (args.json) {
          console.log(JSON.stringify({
            success: false,
            error: errorMsg,
            message: errorMsg === 'CAPTCHA_DETECTED'
              ? 'CAPTCHA detected. Please update cookies.json'
              : errorMsg === 'NO_DOWNLOADS_LEFT'
                ? 'No downloads left on this account'
                : 'Too many consecutive failures',
            total: books.length,
            downloaded,
            skipped,
            failed,
            results
          }));
        } else {
          logger.error(`Fatal error: ${errorMsg}. Stopping.`);
        }

        process.exit(errorMsg === 'NO_DOWNLOADS_LEFT' ? 3 : errorMsg === 'CAPTCHA_DETECTED' ? 2 : 1);
      }

      logger.error(`Unexpected error: ${errorMsg}`);
      excelReader.updateStatus(book.rowIndex, `错误: ${errorMsg}`);
      failed++;
      results.push({
        row: book.rowIndex,
        title,
        success: false,
        error: errorMsg
      });
    }
  }

  excelReader.save();

  if (args.json) {
    console.log(JSON.stringify({
      success: true,
      total: books.length,
      downloaded,
      skipped,
      failed,
      results
    }, null, 2));
  } else {
    logger.info('='.repeat(50));
    logger.info(`Completed: ${books.length} total, ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
    logger.info('='.repeat(50));
  }
}

main().catch(error => {
  console.log(JSON.stringify({
    success: false,
    error: 'UNEXPECTED_ERROR',
    message: error.message
  }));
  process.exit(1);
});
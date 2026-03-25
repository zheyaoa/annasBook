import { ExcelReader } from '../src/excel-reader.js';
import { HttpClient } from '../src/http-client.js';
import { Searcher } from '../src/searcher.js';
import { Downloader } from '../src/downloader.js';
import { logger, setQuiet } from '../src/logger.js';
import { Config, FATAL_ERRORS, SheetResult, BatchResult } from '../src/types.js';
import { sleep, withRetry, sanitizeFolderName } from '../src/utils.js';
import path from 'path';
import fs from 'fs';

interface BatchArgs {
  excel?: string;
  output?: string;
  json?: boolean;
  limit?: number;
}

export async function runBatch(args: BatchArgs, config: Config): Promise<void> {
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
      console.error('Error: --excel is required');
    }
    process.exit(1);
  }

  if (args.output) {
    config.downloadDir = args.output;
  }

  if (args.limit) {
    config.downloadLimit = args.limit;
  }

  const excelReader = new ExcelReader(args.excel);
  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);
  const downloader = new Downloader(config, httpClient);

  const sheetNames = excelReader.getAllSheetNames();
  const sheetResults: SheetResult[] = [];

  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let globalDownloadCount = 0;

  for (const sheetName of sheetNames) {
    // Create safe folder name for this sheet
    const safeFolderName = sanitizeFolderName(sheetName);
    const sheetOutputDir = path.join(config.downloadDir, safeFolderName);

    if (!args.json) {
      logger.info('='.repeat(50));
      logger.info(`Processing sheet: ${sheetName}`);
      logger.info(`Output directory: ${sheetOutputDir}`);
      logger.info('='.repeat(50));
    }

    // Ensure output directory exists
    fs.mkdirSync(sheetOutputDir, { recursive: true });

    // Switch to current sheet
    excelReader.selectSheet(sheetName);
    excelReader.ensureStatusColumn();

    // Temporarily override download directory for this sheet
    const originalDownloadDir = config.downloadDir;
    config.downloadDir = sheetOutputDir;

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
          globalDownloadCount++;
          results.push({
            row: book.rowIndex,
            title,
            success: true,
            filePath: result.filePath,
            md5: searchResult.md5
          });

          if (config.downloadLimit && config.downloadLimit > 0 && globalDownloadCount >= config.downloadLimit) {
            if (!args.json) {
              logger.info(`Reached download limit: ${config.downloadLimit}`);
            }
            config.downloadDir = originalDownloadDir;
            excelReader.save();
            sheetResults.push({
              name: sheetName,
              total: books.length,
              downloaded,
              skipped,
              failed,
              results
            });
            totalDownloaded += downloaded;
            totalSkipped += skipped;
            totalFailed += failed;

            // Output final results and exit
            if (args.json) {
              console.log(JSON.stringify({
                success: true,
                sheets: sheetResults,
                totalDownloaded,
                totalSkipped,
                totalFailed
              }, null, 2));
            } else {
              logger.info('='.repeat(50));
              logger.info(`All sheets completed: ${totalDownloaded} downloaded, ${totalSkipped} skipped, ${totalFailed} failed`);
              logger.info('='.repeat(50));
            }
            return;
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

        if (errorMsg === 'RATE_LIMITED') {
          await sleep(60000);
          continue;
        }

        if (FATAL_ERRORS.includes(errorMsg as any)) {
          config.downloadDir = originalDownloadDir;
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
              sheets: sheetResults,
              currentSheet: {
                name: sheetName,
                total: books.length,
                downloaded,
                skipped,
                failed,
                results
              },
              totalDownloaded,
              totalSkipped,
              totalFailed
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

    // Restore original download directory
    config.downloadDir = originalDownloadDir;
    excelReader.save();

    sheetResults.push({
      name: sheetName,
      total: books.length,
      downloaded,
      skipped,
      failed,
      results
    });

    totalDownloaded += downloaded;
    totalSkipped += skipped;
    totalFailed += failed;

    if (!args.json) {
      logger.info(`Sheet "${sheetName}" completed: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
    }
  }

  if (args.json) {
    console.log(JSON.stringify({
      success: true,
      sheets: sheetResults,
      totalDownloaded,
      totalSkipped,
      totalFailed
    }, null, 2));
  } else {
    logger.info('='.repeat(50));
    logger.info(`All sheets completed: ${totalDownloaded} downloaded, ${totalSkipped} skipped, ${totalFailed} failed`);
    logger.info('='.repeat(50));
  }
}
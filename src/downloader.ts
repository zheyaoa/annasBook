import fs from 'fs';
import path from 'path';
import { Config, SearchResult, BookInfo, DownloadResult, FastDownloadResponse, FastDownloadApiResult } from './types.js';
import { HttpClient } from './http-client.js';
import { logger } from './logger.js';
import { sleep } from './utils.js';
import { Converter } from './converter.js';

const INVALID_CHARS_REGEX = /[/\\:*?"<>|]/g;

export class Downloader {
  private config: Config;
  private httpClient: HttpClient;
  private consecutiveFailures: number = 0;

  constructor(config: Config, httpClient: HttpClient) {
    this.config = config;
    this.httpClient = httpClient;
  }

  private generateFilename(book: BookInfo, result: SearchResult): string {
    let chineseTitle: string;
    let englishTitle: string;

    if (book.language === 'zh') {
      chineseTitle = (result.title || '').replace(INVALID_CHARS_REGEX, '_').trim();
      englishTitle = (book.englishTitle || '').replace(INVALID_CHARS_REGEX, '_').trim();
    } else {
      englishTitle = (result.title || '').replace(INVALID_CHARS_REGEX, '_').trim();
      chineseTitle = (book.chineseTitle || '').replace(INVALID_CHARS_REGEX, '_').trim();
    }

    const author = (result.author || '').replace(INVALID_CHARS_REGEX, '_').trim();
    const year = result.year || '';
    const publisher = (result.publisher || '').replace(INVALID_CHARS_REGEX, '_').trim();

    const parts = [chineseTitle, englishTitle, author, year, publisher].filter(p => p);
    let filename = parts.join('_');

    while (filename.length > 200 && parts.length > 2) {
      parts.pop();
      filename = parts.join('_');
    }

    if (!filename) {
      filename = `Unknown-Book-${book.rowIndex}`;
    }

    return `${filename}.${result.format}`;
  }

  private async tryFastDownloadApi(md5: string): Promise<FastDownloadApiResult> {
    const url = `${this.config.baseUrl}/dyn/api/fast_download.json?md5=${md5}&key=${this.config.apiKey}`;

    try {
      logger.info(`[API] Trying JSON API: ${url.replace(this.config.apiKey, '***')}`);
      const response = await this.httpClient.getJson<FastDownloadResponse>(url);

      if (this.httpClient.isCaptchaResponse(response.body, response.status)) {
        logger.error('[API] CAPTCHA detected');
        return { success: false, error: 'CAPTCHA detected' };
      }

      const data = response.body;

      if (data.download_url) {
        logger.info('[API] Got download URL from API');
        return { success: true, downloadUrl: data.download_url };
      }

      const error = data.error || 'Unknown error';
      logger.error(`[API] API error: ${error}`);

      if (error === 'No downloads left') {
        throw new Error('NO_DOWNLOADS_LEFT');
      }

      return { success: false, error };
    } catch (error) {
      const errorMsg = (error as Error).message;

      if (errorMsg === 'NO_DOWNLOADS_LEFT') {
        throw error;  // Re-throw to propagate to main loop
      }

      logger.error(`[API] API request failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async download(book: BookInfo, result: SearchResult): Promise<DownloadResult> {
    const filename = this.generateFilename(book, result);
    const destPath = path.join(this.config.downloadDir, filename);

    // 检查文件是否已存在（包括转换后的 PDF）
    if (fs.existsSync(destPath)) {
      logger.info(`File already exists: ${filename}`);
      this.consecutiveFailures = 0;
      return { success: true, filePath: destPath };
    }

    // 如果是 EPUB，检查是否已有对应的 PDF
    if (result.format === 'epub') {
      const pdfPath = destPath.replace(/\.epub$/i, '.pdf');
      if (fs.existsSync(pdfPath)) {
        logger.info(`PDF already exists: ${path.basename(pdfPath)}`);
        this.consecutiveFailures = 0;
        return { success: true, filePath: pdfPath };
      }
    }

    logger.info(`Downloading: ${filename}`);

    // 优先使用 Excel 中已有的下载链接
    let downloadUrl = book.downloadUrl;

    if (!downloadUrl) {
      // 没有现成链接，调用 API 获取
      const apiResult = await this.tryFastDownloadApi(result.md5);
      if (!apiResult.success || !apiResult.downloadUrl) {
        this.consecutiveFailures++;
        return { success: false, error: apiResult.error || 'API download failed' };
      }
      downloadUrl = apiResult.downloadUrl;
    } else {
      logger.info(`Using cached download URL from Excel`);
    }

    // 重试下载逻辑
    const maxRetries = 3;
    let lastError: string = '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.httpClient.download(downloadUrl, destPath);

        // 验证文件
        const validationResult = this.validateDownloadedFile(destPath, result.format);
        if (!validationResult.valid) {
          fs.unlinkSync(destPath);
          return { success: false, error: validationResult.error, downloadUrl };
        }

        // 处理格式修正
        const actualFormat = validationResult.actualFormat || result.format;
        let finalPath = destPath;

        if (actualFormat !== result.format) {
          const newPath = destPath.replace(/\.[^.]+$/, `.${actualFormat}`);
          if (!fs.existsSync(newPath)) {
            fs.renameSync(destPath, newPath);
            logger.info(`Format corrected: ${result.format} -> ${actualFormat}`);
          }
          finalPath = newPath;
        }

        // EPUB 转 PDF
        if (actualFormat === 'epub') {
          finalPath = await this.convertEpubToPdf(finalPath);
        }

        this.consecutiveFailures = 0;
        const actualSize = fs.statSync(finalPath).size;
        logger.info(`Downloaded: ${path.basename(finalPath)} (${actualSize} bytes)`);
        return { success: true, filePath: finalPath, downloadUrl };

      } catch (error) {
        const errorMsg = (error as Error).message;
        const isTimeout = errorMsg.toLowerCase().includes('timeout');

        if (isTimeout && attempt < maxRetries) {
          logger.warn(`Download timeout, retrying in 10s (attempt ${attempt}/${maxRetries})`);
          await sleep(10000);
          continue;
        }

        lastError = errorMsg;
        break;  // 非超时错误，不重试
      }
    }

    // 下载失败
    this.consecutiveFailures++;
    logger.error(`Download failed: ${lastError}`);

    if (this.consecutiveFailures >= 5) {
      logger.error('5 consecutive download failures. Please check network, API key, or cookies.');
      throw new Error('CONSECUTIVE_FAILURES');
    }

    return { success: false, error: lastError, downloadUrl };
  }

  extractMd5FromUrl(url: string): string | null {
    const match = url.match(/\/md5\/([a-fA-F0-9]+)/);
    return match ? match[1] : null;
  }

  private detectFormatFromUrl(url: string): 'pdf' | 'epub' | null {
    const match = url.match(/\.([a-z]+)(?:\?|$)/i);
    const ext = match ? match[1].toLowerCase() : null;
    if (ext === 'pdf' || ext === 'epub') {
      return ext;
    }
    return null;
  }

  private validateDownloadedFile(filePath: string, expectedFormat: string): { valid: boolean; actualFormat?: 'pdf' | 'epub'; error?: string } {
    try {
      const buffer = fs.readFileSync(filePath);

      const header = buffer.subarray(0, 100).toString('utf8').toLowerCase();
      if (header.includes('<!doctype html') || header.includes('<html')) {
        logger.error('Downloaded file is HTML, not the expected format');
        return { valid: false, error: 'Download returned HTML page instead of book file. The book may not be available or cookies may be expired.' };
      }

      const fileHeader = buffer.subarray(0, 4);
      const isPdf = fileHeader.toString('ascii') === '%PDF';
      const isEpub = fileHeader[0] === 0x50 && fileHeader[1] === 0x4B;

      if (expectedFormat === 'pdf') {
        if (isPdf) {
          return { valid: true, actualFormat: 'pdf' };
        } else if (isEpub) {
          logger.info('File is actually EPUB, not PDF');
          return { valid: true, actualFormat: 'epub' };
        } else {
          logger.error(`Invalid PDF file: expected %PDF header, got ${JSON.stringify(fileHeader.toString('ascii'))}`);
          return { valid: false, error: 'Downloaded file is not a valid PDF or EPUB' };
        }
      }

      if (expectedFormat === 'epub') {
        if (isEpub) {
          return { valid: true, actualFormat: 'epub' };
        } else if (isPdf) {
          logger.info('File is actually PDF, not EPUB');
          return { valid: true, actualFormat: 'pdf' };
        } else {
          logger.error('Invalid EPUB file: expected ZIP/EPUB signature');
          return { valid: false, error: 'Downloaded file is not a valid EPUB or PDF' };
        }
      }

      return { valid: true };
    } catch (error) {
      logger.error(`Failed to validate downloaded file: ${(error as Error).message}`);
      return { valid: false, error: `Validation failed: ${(error as Error).message}` };
    }
  }

  private async convertEpubToPdf(filePath: string): Promise<string> {
    const converter = new Converter();
    const result = await converter.convert(filePath);

    if (result.success && result.outputPath) {
      fs.unlinkSync(filePath);
      logger.info(`Converted to PDF: ${result.outputPath}`);
      return result.outputPath;
    } else {
      logger.warn(`Conversion failed, keeping EPUB: ${result.error}`);
      return filePath;
    }
  }
}
import fs from 'fs';
import path from 'path';
import { Config, SearchResult, BookInfo, DownloadResult, ApiErrorResponse } from './types.js';
import { HttpClient } from './http-client.js';
import { logger } from './logger.js';

// Invalid filesystem characters
const INVALID_CHARS_REGEX = /[/\\:*?"<>|]/g;

export class Downloader {
  private config: Config;
  private httpClient: HttpClient;
  private consecutiveFailures: number = 0;

  constructor(config: Config, httpClient: HttpClient) {
    this.config = config;
    this.httpClient = httpClient;
  }

  private sanitizeFilename(name: string): string {
    return name.replace(INVALID_CHARS_REGEX, '_');
  }

  private generateFilename(book: BookInfo, format: string): string {
    let baseName: string;

    if (book.chineseTitle && book.englishTitle) {
      baseName = `${book.chineseTitle} - ${book.englishTitle}`;
    } else if (book.chineseTitle) {
      baseName = book.chineseTitle;
    } else if (book.englishTitle) {
      baseName = book.englishTitle;
    } else {
      baseName = `Unknown-Book-${book.rowIndex}`;
    }

    // Sanitize and truncate
    let filename = this.sanitizeFilename(baseName);
    if (filename.length > 250) {
      filename = filename.substring(0, 250);
    }

    return `${filename}.${format}`;
  }

  private checkDiskSpace(): boolean {
    // Simple check - warn if downloads directory is getting full
    // In production, would use proper disk space check
    try {
      const stats = fs.statSync(this.config.downloadDir);
      return true;
    } catch {
      return false;
    }
  }

  async download(book: BookInfo, result: SearchResult): Promise<DownloadResult> {
    const url = `${this.config.baseUrl}/fast_download.json?md5=${result.md5}&key=${this.config.apiKey}`;

    try {
      // Get download URL from API
      const { status, body } = await this.httpClient.get(url);

      if (status !== 200) {
        return this.handleApiError(body, result.md5);
      }

      let data: { url?: string; download_url?: string; error?: string };
      try {
        data = JSON.parse(body);
      } catch {
        return { success: false, error: 'Invalid API response' };
      }

      if (data.error) {
        return this.handleApiError(JSON.stringify(data), result.md5);
      }

      const downloadUrl = data.url || data.download_url;
      if (!downloadUrl) {
        return { success: false, error: 'No download URL in response' };
      }

      // Generate filename
      const filename = this.generateFilename(book, result.format);
      const destPath = path.join(this.config.downloadDir, filename);

      // Check if file already exists
      if (fs.existsSync(destPath)) {
        logger.info(`File already exists: ${filename}`);
        this.consecutiveFailures = 0;
        return { success: true, filePath: destPath };
      }

      // Download file
      logger.info(`Downloading: ${filename}`);
      await this.httpClient.download(downloadUrl, destPath);

      // Verify file size
      const actualSize = fs.statSync(destPath).size;
      if (result.sizeBytes > 0 && Math.abs(actualSize - result.sizeBytes) > 1024) {
        fs.unlinkSync(destPath);
        return { success: false, error: `Size mismatch: expected ~${result.sizeBytes}, got ${actualSize}` };
      }

      this.consecutiveFailures = 0;
      logger.info(`Downloaded: ${filename} (${actualSize} bytes)`);

      return { success: true, filePath: destPath };
    } catch (error) {
      this.consecutiveFailures++;
      const errorMsg = (error as Error).message;
      logger.error(`Download failed: ${errorMsg}`);

      if (this.consecutiveFailures >= 5) {
        logger.error('5 consecutive download failures. Please check network, API key, or cookies.');
        throw new Error('CONSECUTIVE_FAILURES');
      }

      return { success: false, error: errorMsg };
    }
  }

  private handleApiError(body: string, md5: string): DownloadResult {
    try {
      const data: ApiErrorResponse = JSON.parse(body);

      switch (data.error) {
        case 'invalid_md5':
          return { success: false, error: 'Invalid MD5' };
        case 'not_found':
          return { success: false, error: 'Book not found' };
        case 'invalid_key':
          throw new Error('Invalid API key. Please check config.json.');
        case 'rate_limit':
          logger.warn('Rate limited. Waiting 60 seconds...');
          throw new Error('RATE_LIMITED');
        case 'membership_required':
          return { success: false, error: 'Membership required' };
        default:
          return { success: false, error: data.error };
      }
    } catch (error) {
      if ((error as Error).message.includes('Invalid API key')) {
        throw error;
      }
      return { success: false, error: 'Unknown API error' };
    }
  }

  extractMd5FromUrl(url: string): string | null {
    const match = url.match(/\/md5\/([a-fA-F0-9]+)/);
    return match ? match[1] : null;
  }
}
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

  private generateFilename(book: BookInfo, result: SearchResult): string {
    const chinese = (book.chineseTitle || '').replace(INVALID_CHARS_REGEX, '_').trim();
    const english = (book.englishTitle || '').replace(INVALID_CHARS_REGEX, '_').trim();
    const author = (book.englishAuthor || book.chineseAuthor || '').replace(INVALID_CHARS_REGEX, '_').trim();
    const year = result.year || '';
    const publisher = (result.publisher || '').replace(INVALID_CHARS_REGEX, '_').trim();

    // Build filename, progressively truncate long parts
    let parts = [chinese, english, author, year, publisher].filter(p => p);
    let filename = parts.join('_');

    // Limit length
    while (filename.length > 200 && parts.length > 2) {
      parts = parts.slice(0, -1);  // Remove last part (publisher)
      filename = parts.join('_');
    }

    // Fallback if still empty
    if (!filename) {
      filename = `Unknown-Book-${book.rowIndex}`;
    }

    return `${filename}.${result.format}`;
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
    // New API endpoint: fast_download/{md5}/0/0 (requires login cookies)
    const url = `${this.config.baseUrl}/fast_download/${result.md5}/0/0`;

    try {
      // Generate filename first
      const filename = this.generateFilename(book, result);
      const destPath = path.join(this.config.downloadDir, filename);

      // Check if file already exists
      if (fs.existsSync(destPath)) {
        logger.info(`File already exists: ${filename}`);
        this.consecutiveFailures = 0;
        return { success: true, filePath: destPath };
      }

      // Download file directly (endpoint redirects to actual download URL)
      logger.info(`Downloading: ${filename}`);
      const finalUrl = await this.httpClient.download(url, destPath);

      // Verify the downloaded file is valid (not an HTML error page)
      const validationResult = this.validateDownloadedFile(destPath, result.format);
      if (!validationResult.valid) {
        // Delete the invalid file
        fs.unlinkSync(destPath);
        return { success: false, error: validationResult.error };
      }

      // Handle format correction if actual format differs from expected
      const actualFormat = validationResult.actualFormat || result.format;
      if (actualFormat !== result.format) {
        const newPath = destPath.replace(/\.[^.]+$/, `.${actualFormat}`);
        if (!fs.existsSync(newPath)) {
          fs.renameSync(destPath, newPath);
          logger.info(`Format corrected: ${result.format} -> ${actualFormat}`);
        }
        this.consecutiveFailures = 0;
        const actualSize = fs.statSync(newPath).size;
        logger.info(`Downloaded: ${path.basename(newPath)} (${actualSize} bytes)`);
        return { success: true, filePath: newPath };
      }

      this.consecutiveFailures = 0;
      const actualSize = fs.statSync(destPath).size;
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

      // Check for HTML content (error page)
      const header = buffer.subarray(0, 100).toString('utf8').toLowerCase();
      if (header.includes('<!doctype html') || header.includes('<html')) {
        logger.error('Downloaded file is HTML, not the expected format');
        return { valid: false, error: 'Download returned HTML page instead of book file. The book may not be available or cookies may be expired.' };
      }

      // Check actual file format by magic number
      const fileHeader = buffer.subarray(0, 4);
      const isPdf = fileHeader.toString('ascii') === '%PDF';
      const isEpub = fileHeader[0] === 0x50 && fileHeader[1] === 0x4B; // PK signature (ZIP/EPUB)

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
}
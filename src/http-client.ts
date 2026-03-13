import fs from 'fs';
import { Config, CookieData } from './types.js';
import { logger } from './logger.js';

export class HttpClient {
  private config: Config;
  private cookies: string;

  constructor(config: Config) {
    this.config = config;
    this.cookies = this.loadCookies();
  }

  // Method to reload cookies (e.g., after user solves CAPTCHA)
  reloadCookies(): void {
    this.cookies = this.loadCookies();
    logger.info('Cookies reloaded from cookies.json');
  }

  private loadCookies(): string {
    const cookiePath = './cookies.json';
    if (!fs.existsSync(cookiePath)) {
      return '';
    }

    try {
      const content = fs.readFileSync(cookiePath, 'utf-8');
      const data = JSON.parse(content);

      // Handle different cookie formats
      if (typeof data === 'string') {
        return data;
      }

      if (Array.isArray(data)) {
        return data.map(c => `${c.name}=${c.value}`).join('; ');
      }

      if (typeof data === 'object') {
        return Object.entries(data).map(([k, v]) => `${k}=${v}`).join('; ');
      }

      return '';
    } catch (error) {
      logger.warn(`Failed to load cookies: ${(error as Error).message}`);
      // Delete corrupted file
      try {
        fs.unlinkSync(cookiePath);
        logger.info('Deleted corrupted cookies.json');
      } catch {}
      return '';
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    };

    if (this.cookies) {
      headers['Cookie'] = this.cookies;
    }

    return headers;
  }

  async get(url: string, timeoutMs?: number): Promise<{ status: number; body: string }> {
    const timeout = timeoutMs || this.config.requestTimeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const body = await response.text();
      return { status: response.status, body };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async download(url: string, destPath: string): Promise<void> {
    const timeout = this.config.downloadTimeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const expectedSize = contentLength ? parseInt(contentLength, 10) : 0;

      const buffer = await response.arrayBuffer();
      const tempPath = `${destPath}.tmp`;

      fs.writeFileSync(tempPath, Buffer.from(buffer));

      // Verify size
      const actualSize = fs.statSync(tempPath).size;
      if (expectedSize > 0 && actualSize !== expectedSize) {
        fs.unlinkSync(tempPath);
        throw new Error(`Size mismatch: expected ${expectedSize}, got ${actualSize}`);
      }

      // Rename to final path
      fs.renameSync(tempPath, destPath);
    } catch (error) {
      clearTimeout(timeoutId);
      // Cleanup temp file
      const tempPath = `${destPath}.tmp`;
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }

  isCaptchaResponse(body: string, status: number): boolean {
    // Check for CAPTCHA patterns regardless of status code
    // (CAPTCHA can be returned with various status codes including 200)
    if (
      body.includes('challenge-running') ||
      body.includes('cf-turnstile') ||
      body.includes('g-recaptcha') ||
      body.includes('h-captcha')
    ) {
      return true;
    }
    return false;
  }
}
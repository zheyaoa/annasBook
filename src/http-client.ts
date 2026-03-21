import fs from 'fs';
import axios, { AxiosInstance } from 'axios';
import { Config } from './types.js';
import { logger } from './logger.js';

export class HttpClient {
  private config: Config;
  private cookies: string;
  private axiosInstance: AxiosInstance;

  constructor(config: Config) {
    this.config = config;
    this.cookies = this.loadCookies();
    this.axiosInstance = this.createAxiosInstance();
  }

  private createAxiosInstance(): AxiosInstance {
    const instance = axios.create({
      timeout: this.config.requestTimeoutMs,
      headers: this.getHeaders(),
    });

    // Configure proxy if specified
    if (this.config.proxy) {
      try {
        const proxyUrl = new URL(this.config.proxy);
        instance.defaults.proxy = {
          host: proxyUrl.hostname,
          port: parseInt(proxyUrl.port, 10) || (proxyUrl.protocol === 'https:' ? 443 : 80),
          protocol: proxyUrl.protocol.replace(':', ''),
        };
      } catch (error) {
        logger.warn(`Invalid proxy URL: ${this.config.proxy}`);
      }
    }

    return instance;
  }

  // Method to reload cookies (e.g., after user solves CAPTCHA)
  reloadCookies(): void {
    this.cookies = this.loadCookies();
    this.axiosInstance.defaults.headers = this.getHeaders() as unknown as typeof this.axiosInstance.defaults.headers;
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

    try {
      const response = await this.axiosInstance.get(url, {
        timeout,
        headers: this.getHeaders(),
      });

      return { status: response.status, body: response.data };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          return { status: error.response.status, body: error.response.data };
        }
        throw new Error(`Network error: ${error.message}`);
      }
      throw error;
    }
  }

  async download(url: string, destPath: string): Promise<string> {
    const timeout = this.config.downloadTimeoutMs;

    try {
      const response = await this.axiosInstance.get(url, {
        responseType: 'arraybuffer',
        timeout,
        headers: this.getHeaders(),
        maxRedirects: 5,
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentLength = response.headers['content-length'];
      const expectedSize = contentLength ? parseInt(contentLength, 10) : 0;

      const tempPath = `${destPath}.tmp`;
      fs.writeFileSync(tempPath, response.data);

      // Rename to final path
      fs.renameSync(tempPath, destPath);

      // Return final URL (after redirects) for format detection
      return response.request?.res?.responseUrl || url;
    } catch (error) {
      // Cleanup temp file
      const tempPath = `${destPath}.tmp`;
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      if (axios.isAxiosError(error)) {
        throw new Error(`Download failed: ${error.message}`);
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
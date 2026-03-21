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
      try {
        fs.unlinkSync(cookiePath);
        logger.info('Deleted corrupted cookies.json');
      } catch {}
      return '';
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7',
      'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
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

  async getJson<T>(url: string, timeoutMs?: number): Promise<{ status: number; body: T }> {
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      logger.warn(`[Download] Timeout after ${timeout / 1000}s, aborting`);
    }, timeout);

    const startTime = Date.now();
    logger.info(`[Download] Starting download, timeout: ${timeout / 1000}s`);

    try {
      const response = await this.axiosInstance.get(url, {
        responseType: 'arraybuffer',
        timeout,
        headers: this.getHeaders(),
        maxRedirects: 5,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      const dataSize = response.data?.byteLength || 0;
      logger.info(`[Download] Received ${dataSize} bytes in ${elapsed / 1000}s`);

      const tempPath = `${destPath}.tmp`;
      fs.writeFileSync(tempPath, response.data);
      fs.renameSync(tempPath, destPath);

      return response.request?.res?.responseUrl || url;
    } catch (error) {
      clearTimeout(timeoutId);
      const tempPath = `${destPath}.tmp`;
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      if (axios.isAxiosError(error)) {
        if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
          throw new Error(`Download timeout (${timeout / 1000}s exceeded)`);
        }
        throw new Error(`Download failed: ${error.message}`);
      }
      throw error;
    }
  }

  isCaptchaResponse(body: string | object, status: number): boolean {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

    if (
      bodyStr.includes('challenge-running') ||
      bodyStr.includes('cf-turnstile') ||
      bodyStr.includes('g-recaptcha') ||
      bodyStr.includes('h-captcha')
    ) {
      return true;
    }
    return false;
  }
}
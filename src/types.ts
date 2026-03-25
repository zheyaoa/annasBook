export type ErrorCode =
  | 'CAPTCHA_DETECTED'
  | 'NO_DOWNLOADS_LEFT'
  | 'RATE_LIMITED'
  | 'CONSECUTIVE_FAILURES';

export const FATAL_ERRORS: ErrorCode[] = ['CAPTCHA_DETECTED', 'CONSECUTIVE_FAILURES', 'NO_DOWNLOADS_LEFT'];

export interface Config {
  apiKey: string;
  baseUrl: string;
  excelFile: string;
  downloadDir: string;
  rateLimitMs: number;
  requestTimeoutMs: number;
  downloadTimeoutMs: number;
  maxRetries: number;
  proxy?: string; // Optional proxy URL, e.g., "http://127.0.0.1:7892"
  downloadLimit?: number; // Maximum downloads per run, 0 or undefined = unlimited
  openai?: {
    enable?: boolean;    // Default: true if apiKey is set
    apiKey: string;
    baseUrl?: string;    // Default: https://api.openai.com/v1
    model?: string;      // Default: gpt-4o-mini
  };
}

export interface BookInfo {
  rowIndex: number;       // Excel row number (1-based, for updates)
  language: string;       // "en" uses englishTitle, else uses chineseTitle
  chineseTitle: string;
  englishTitle: string;
  chineseAuthor: string;
  englishAuthor: string;
  confidence: string;
  downloadStatus: string;
  bookLink: string;
  downloadUrl?: string;   // Excel 中已有的下载链接
}

export interface SearchResult {
  md5: string;
  title: string;
  author: string;
  format: 'pdf' | 'epub';
  language: string;
  size: string;
  sizeBytes: number;
  year: string;
  publisher: string;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  downloadUrl?: string;  // API 返回的下载链接
}

export interface ApiErrorResponse {
  error: string;
}

export interface CookieData {
  [key: string]: string;
}

export interface FastDownloadResponse {
  download_url: string | null;
  error?: string;
  account_fast_download_info?: Record<string, unknown>;
}

export interface FastDownloadApiResult {
  success: boolean;
  downloadUrl?: string;
  error?: string;
}

export interface BookDetailsExtended {
  title: string;
  author: string;
  format: 'pdf' | 'epub';
  year: string;
  publisher: string;
  language: string;
  size: string;
}

export interface ConvertResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export interface SheetResult {
  name: string;
  total: number;
  downloaded: number;
  skipped: number;
  failed: number;
  results: BatchResult[];
}

export interface BatchResult {
  row: number;
  title: string;
  success: boolean;
  filePath?: string;
  error?: string;
  md5?: string;
}
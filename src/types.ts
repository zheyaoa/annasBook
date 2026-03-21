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
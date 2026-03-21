// Configuration interface
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

// Book information from Excel
export interface BookInfo {
  rowIndex: number;       // Excel row number (1-based, for updates)
  language: string;       // 语言 - determines search title: "en" = use englishTitle, else use chineseTitle
  chineseTitle: string;   // 书名
  englishTitle: string;   // Book title
  chineseAuthor: string;  // 作者
  englishAuthor: string;  // Author
  confidence: string;     // 置信度
  downloadStatus: string; // 下载状态
  bookLink: string;       // 书籍链接
}

// Search result from Anna's Archive
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

// Download result
export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

// API error response
export interface ApiErrorResponse {
  error: string;
}

// Cookie format
export interface CookieData {
  [key: string]: string;
}
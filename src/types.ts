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
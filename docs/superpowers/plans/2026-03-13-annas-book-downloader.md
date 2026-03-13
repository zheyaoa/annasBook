# Anna's Archive Book Downloader Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript CLI tool to download books from Anna's Archive based on an Excel book list.

**Architecture:** Modular design with separate components for config, Excel parsing, HTTP search, download API, and main orchestration. Uses cheerio for HTML parsing and xlsx for Excel handling.

**Tech Stack:** TypeScript, Node.js, tsx, cheerio, xlsx, native fetch

---

## Chunk 1: Project Initialization

### Task 1: Initialize Node.js Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `config.example.json`

- [ ] **Step 1: Create package.json**

```bash
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install xlsx cheerio
npm install -D typescript tsx @types/node
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Update package.json with scripts**

```json
{
  "name": "annas-book-downloader",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "build": "tsc"
  }
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
downloads/
logs/
config.json
cookies.json
.lock
*.log
```

- [ ] **Step 6: Create config.example.json**

```json
{
  "apiKey": "YOUR_API_KEY_HERE",
  "baseUrl": "https://annas-archive.gl",
  "excelFile": "./src/assets/海外中国.xlsx",
  "downloadDir": "./downloads",
  "rateLimitMs": 2000,
  "requestTimeoutMs": 30000,
  "downloadTimeoutMs": 300000,
  "maxRetries": 3
}
```

- [ ] **Step 7: Create directory structure**

```bash
mkdir -p src/assets downloads logs
```

- [ ] **Step 8: Commit initialization**

```bash
git init
git add .
git commit -m "chore: initialize project with TypeScript, tsx, cheerio, xlsx"
```

---

## Chunk 2: Core Types and Configuration

### Task 2: Define TypeScript Interfaces

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
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
```

- [ ] **Step 2: Commit types**

```bash
git add src/types.ts
git commit -m "feat: add TypeScript interfaces for config, book info, and search results"
```

### Task 3: Configuration Module

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: Create src/config.ts**

```typescript
import fs from 'fs';
import path from 'path';
import { Config } from './types.js';

const DEFAULT_CONFIG: Config = {
  apiKey: '',
  baseUrl: 'https://annas-archive.gl',
  excelFile: './src/assets/海外中国.xlsx',
  downloadDir: './downloads',
  rateLimitMs: 2000,
  requestTimeoutMs: 30000,
  downloadTimeoutMs: 300000,
  maxRetries: 3,
};

export function loadConfig(configPath: string = './config.json'): Config {
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Config file not found at ${configPath}`);
    console.error('Please copy config.example.json to config.json and fill in your API key.');
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    // Validate required fields
    if (!config.apiKey) {
      console.error('Error: apiKey is required in config.json');
      process.exit(1);
    }
    if (!config.baseUrl) {
      console.error('Error: baseUrl is required in config.json');
      process.exit(1);
    }
    if (!config.excelFile) {
      console.error('Error: excelFile is required in config.json');
      process.exit(1);
    }

    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.error(`Error parsing config.json: ${(error as Error).message}`);
    process.exit(1);
  }
}

export function validateConfig(config: Config): void {
  // Check Excel file exists
  if (!fs.existsSync(config.excelFile)) {
    console.error(`Error: Excel file not found at ${config.excelFile}`);
    process.exit(1);
  }

  // Create download directory if not exists
  if (!fs.existsSync(config.downloadDir)) {
    fs.mkdirSync(config.downloadDir, { recursive: true });
  }

  // Create logs directory if not exists
  if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs', { recursive: true });
  }
}
```

- [ ] **Step 2: Commit config module**

```bash
git add src/config.ts
git commit -m "feat: add configuration module with validation"
```

---

## Chunk 3: Logger Module

### Task 4: Logger Module

**Files:**
- Create: `src/logger.ts`

- [ ] **Step 1: Create src/logger.ts**

```typescript
import fs from 'fs';
import path from 'path';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const LOG_FILE = './logs/download.log';

function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function log(level: LogLevel, message: string): void {
  const timestamp = formatTimestamp();
  const logLine = `[${timestamp}] [${level}] ${message}`;

  // Console output
  if (level === 'ERROR') {
    console.error(logLine);
  } else if (level === 'WARN') {
    console.warn(logLine);
  } else {
    console.log(logLine);
  }

  // File output
  try {
    fs.appendFileSync(LOG_FILE, logLine + '\n');
  } catch (error) {
    console.error(`Failed to write to log file: ${(error as Error).message}`);
  }
}

export const logger = {
  info: (message: string) => log('INFO', message),
  warn: (message: string) => log('WARN', message),
  error: (message: string) => log('ERROR', message),
};
```

- [ ] **Step 2: Commit logger module**

```bash
git add src/logger.ts
git commit -m "feat: add logger module with file and console output"
```

---

## Chunk 4: Lock File Management

### Task 5: Lock File Module

**Files:**
- Create: `src/lock.ts`

- [ ] **Step 1: Create src/lock.ts**

```typescript
import fs from 'fs';
import { logger } from './logger.js';

const LOCK_FILE = '.lock';

export function acquireLock(): boolean {
  if (fs.existsSync(LOCK_FILE)) {
    logger.error('Another instance is already running. If this is incorrect, delete .lock file.');
    return false;
  }

  try {
    fs.writeFileSync(LOCK_FILE, `${process.pid}\n${new Date().toISOString()}`);
    return true;
  } catch (error) {
    logger.error(`Failed to create lock file: ${(error as Error).message}`);
    return false;
  }
}

export function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (error) {
    logger.warn(`Failed to remove lock file: ${(error as Error).message}`);
  }
}
```

- [ ] **Step 2: Commit lock module**

```bash
git add src/lock.ts
git commit -m "feat: add lock file module for concurrent execution prevention"
```

---

## Chunk 5: Excel Reader Module

### Task 6: Excel Reader Module

**Files:**
- Create: `src/excel-reader.ts`

- [ ] **Step 1: Create src/excel-reader.ts**

```typescript
import fs from 'fs';
import * as XLSX from 'xlsx';
import { BookInfo } from './types.js';
import { logger } from './logger.js';

const REQUIRED_COLUMNS = ['语言', '书名', 'Book title'];

export class ExcelReader {
  private workbook: XLSX.WorkBook;
  private sheet: XLSX.WorkSheet;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.workbook = XLSX.readFile(filePath);
    const sheetName = this.workbook.SheetNames[0];
    this.sheet = this.workbook.Sheets[sheetName];
    this.validateColumns();
  }

  private validateColumns(): void {
    const range = XLSX.utils.decode_range(this.sheet['!ref'] || 'A1');
    const headers: string[] = [];

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      if (cell && cell.v !== undefined) {
        headers.push(String(cell.v));
      }
    }

    for (const required of REQUIRED_COLUMNS) {
      if (!headers.includes(required)) {
        throw new Error(`Missing required column: ${required}`);
      }
    }
  }

  private getCellValue(row: number, col: string): string {
    const cell = this.sheet[`${col}${row}`];
    if (!cell) return '';

    // Handle formula cells
    if (cell.t === 'f' && cell.v === undefined) {
      return cell.w || '';
    }

    // Convert to string
    if (cell.v === null || cell.v === undefined) {
      return '';
    }

    // Handle dates
    if (cell.t === 'd') {
      return cell.v.toISOString();
    }

    return String(cell.v);
  }

  readBooks(): BookInfo[] {
    const range = XLSX.utils.decode_range(this.sheet['!ref'] || 'A1');
    const books: BookInfo[] = [];
    const seenBooks = new Set<string>();

    // Find column indices
    const colMap: Record<string, string> = {};
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      if (cell && cell.v !== undefined) {
        colMap[String(cell.v)] = XLSX.utils.encode_col(col);
      }
    }

    // Read rows (skip header)
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const book: BookInfo = {
        rowIndex: row,
        language: this.getCellValue(row, colMap['语言'] || 'A'),
        chineseTitle: this.getCellValue(row, colMap['书名'] || 'B'),
        englishTitle: this.getCellValue(row, colMap['Book title'] || 'C'),
        chineseAuthor: this.getCellValue(row, colMap['作者'] || 'D'),
        englishAuthor: this.getCellValue(row, colMap['Author'] || 'E'),
        confidence: this.getCellValue(row, colMap['置信度'] || 'I'),
        downloadStatus: this.getCellValue(row, colMap['下载状态'] || 'J'),
        bookLink: this.getCellValue(row, colMap['书籍链接'] || 'K'),
      };

      // Skip rows with missing required fields
      if (!book.chineseTitle && !book.englishTitle) {
        logger.warn(`Row ${row}: Skipping - both titles are empty`);
        continue;
      }

      // Check for duplicates
      const key = `${book.chineseTitle}|${book.englishTitle}`;
      if (seenBooks.has(key)) {
        logger.info(`Row ${row}: Skipping duplicate entry - ${book.chineseTitle || book.englishTitle}`);
        continue;
      }
      seenBooks.add(key);

      books.push(book);
    }

    logger.info(`Read ${books.length} books from Excel`);
    return books;
  }

  updateStatus(rowIndex: number, status: string, bookLink?: string): void {
    const range = XLSX.utils.decode_range(this.sheet['!ref'] || 'A1');

    // Find column indices
    const colMap: Record<string, string> = {};
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      if (cell && cell.v !== undefined) {
        colMap[String(cell.v)] = XLSX.utils.encode_col(col);
      }
    }

    // Update download status
    const statusCol = colMap['下载状态'] || 'J';
    this.sheet[`${statusCol}${rowIndex}`] = { t: 's', v: status };

    // Update book link if provided
    if (bookLink) {
      const linkCol = colMap['书籍链接'] || 'K';
      this.sheet[`${linkCol}${rowIndex}`] = { t: 's', v: bookLink };
    }
  }

  save(): void {
    XLSX.writeFile(this.workbook, this.filePath);
    logger.info(`Excel file saved: ${this.filePath}`);
  }
}
```

- [ ] **Step 2: Commit Excel reader module**

```bash
git add src/excel-reader.ts
git commit -m "feat: add Excel reader module with duplicate detection and status updates"
```

---

## Chunk 6: HTTP Client and Cookie Management

### Task 7: HTTP Client Module

**Files:**
- Create: `src/http-client.ts`

- [ ] **Step 1: Create src/http-client.ts**

```typescript
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
```

- [ ] **Step 2: Commit HTTP client module**

```bash
git add src/http-client.ts
git commit -m "feat: add HTTP client with cookie support and CAPTCHA detection"
```

---

## Chunk 7: Searcher Module

### Task 8: Searcher Module

**Files:**
- Create: `src/searcher.ts`

- [ ] **Step 1: Create src/searcher.ts**

```typescript
import * as cheerio from 'cheerio';
import { Config, BookInfo, SearchResult } from './types.js';
import { HttpClient } from './http-client.js';
import { logger } from './logger.js';

// Punctuation to ignore in title matching
const PUNCTUATION_REGEX = /[:\-—,.!?'"]/g;

export class Searcher {
  private config: Config;
  private httpClient: HttpClient;

  constructor(config: Config, httpClient: HttpClient) {
    this.config = config;
    this.httpClient = httpClient;
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^([\d.]+)\s*(KB|MB|GB)$/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
      case 'KB': return Math.round(value * 1024);
      case 'MB': return Math.round(value * 1024 * 1024);
      case 'GB': return Math.round(value * 1024 * 1024 * 1024);
      default: return 0;
    }
  }

  private parseFormatInfo(text: string): { format: 'pdf' | 'epub'; language: string; size: string; sizeBytes: number; year: string } {
    // Parse text like "English [en] · PDF · 26.8MB · 1971"
    const parts = text.split('·').map(p => p.trim());

    let format: 'pdf' | 'epub' = 'pdf';
    let language = '';
    let size = '';
    let sizeBytes = 0;
    let year = '';

    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      if (lowerPart === 'pdf' || lowerPart === 'epub') {
        format = lowerPart;
      } else if (part.match(/^\d{4}$/)) {
        year = part;
      } else if (part.match(/[\d.]+\s*(KB|MB|GB)/i)) {
        size = part;
        sizeBytes = this.parseSize(part);
      } else if (part.includes('[') && part.includes(']')) {
        language = part;
      }
    }

    return { format, language, size, sizeBytes, year };
  }

  async search(book: BookInfo): Promise<SearchResult[]> {
    // Determine search title based on language field
    let searchTitle: string;
    if (book.language === 'en') {
      searchTitle = book.englishTitle || book.chineseTitle;
    } else {
      searchTitle = book.chineseTitle || book.englishTitle;
    }

    if (!searchTitle) {
      logger.warn(`Row ${book.rowIndex}: No title available for search`);
      return [];
    }

    const encodedTitle = encodeURIComponent(searchTitle);
    const url = `${this.config.baseUrl}/search?index=&page=1&sort=&ext=pdf&ext=epub&display=&q=${encodedTitle}`;

    logger.info(`Searching for: ${searchTitle}`);

    try {
      const { status, body } = await this.httpClient.get(url);

      // Check for CAPTCHA
      if (this.httpClient.isCaptchaResponse(body, status)) {
        return this.handleCaptcha(url);
      }

      return this.parseSearchResults(body, searchTitle);
    } catch (error) {
      logger.error(`Search failed for "${searchTitle}": ${(error as Error).message}`);
      return [];
    }
  }

  private handleCaptcha(url: string): SearchResult[] {
    logger.warn('CAPTCHA detected!');
    console.log('\n' + '='.repeat(60));
    console.log('CAPTCHA detected. Please visit the URL in a browser:');
    console.log(url);
    console.log('Solve the CAPTCHA, then update cookies.json with new session cookies.');
    console.log('Press Enter to continue (or type "quit" to abort)...');
    console.log('='.repeat(60) + '\n');

    // In a real implementation, we'd wait for user input
    // For now, return empty array and let main loop handle it
    throw new Error('CAPTCHA_DETECTED');
  }

  private parseSearchResults(html: string, searchTitle: string): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // Find all MD5 links
    $('a[href^="/md5/"]').each((_, element) => {
      try {
        const $link = $(element);
        const href = $link.attr('href') || '';
        const md5 = href.replace('/md5/', '');

        if (!md5 || md5.length < 20) return; // Invalid MD5

        const title = $link.text().trim();

        // Find author link (spec: Links containing icon-[mdi--user-edit])
        const $parent = $link.closest('tr, div');
        let author = '';
        $parent.find('a[class*="icon-[mdi--user-edit]"], a:has([class*="icon-[mdi--user-edit]"])').each((_, el) => {
          const text = $(el).text().trim();
          if (text && !author) author = text;
        });

        // Find format info
        const parentText = $parent.text();
        const formatInfo = this.parseFormatInfo(parentText);

        results.push({
          md5,
          title,
          author,
          format: formatInfo.format,
          language: formatInfo.language,
          size: formatInfo.size,
          sizeBytes: formatInfo.sizeBytes,
          year: formatInfo.year,
        });
      } catch (error) {
        logger.warn(`Failed to parse search result: ${(error as Error).message}`);
      }
    });

    logger.info(`Found ${results.length} results for "${searchTitle}"`);
    return results;
  }

  selectBestResult(results: SearchResult[], searchTitle: string): SearchResult | null {
    if (results.length === 0) return null;

    // Filter by format priority: PDF > EPUB
    const pdfResults = results.filter(r => r.format === 'pdf');
    const epubResults = results.filter(r => r.format === 'epub');

    const candidates = pdfResults.length > 0 ? pdfResults : epubResults;

    if (candidates.length === 0) return null;

    // Try exact title match (case-insensitive, ignoring punctuation)
    const normalizedSearch = searchTitle.toLowerCase().replace(PUNCTUATION_REGEX, '');

    const exactMatches = candidates.filter(r => {
      const normalizedResult = r.title.toLowerCase().replace(PUNCTUATION_REGEX, '');
      return normalizedResult === normalizedSearch;
    });

    if (exactMatches.length > 0) {
      // If multiple exact matches, prefer larger file
      exactMatches.sort((a, b) => b.sizeBytes - a.sizeBytes);
      return exactMatches[0];
    }

    // No exact match, use first result (relevance sort)
    return candidates[0];
  }
}
```

- [ ] **Step 2: Commit searcher module**

```bash
git add src/searcher.ts
git commit -m "feat: add searcher module with HTML parsing and best match selection"
```

---

## Chunk 8: Downloader Module

### Task 9: Downloader Module

**Files:**
- Create: `src/downloader.ts`

- [ ] **Step 1: Create src/downloader.ts**

```typescript
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
```

- [ ] **Step 2: Commit downloader module**

```bash
git add src/downloader.ts
git commit -m "feat: add downloader module with API integration and file handling"
```

---

## Chunk 9: Main Orchestrator

### Task 10: Main Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create src/index.ts**

```typescript
import fs from 'fs';
import readline from 'readline';
import { loadConfig, validateConfig } from './config.js';
import { ExcelReader } from './excel-reader.js';
import { HttpClient } from './http-client.js';
import { Searcher } from './searcher.js';
import { Downloader } from './downloader.js';
import { logger } from './logger.js';
import { acquireLock, releaseLock } from './lock.js';
import { BookInfo, SearchResult } from './types.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function promptUser(message: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(message, answer => {
      resolve(answer.trim());
    });
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  backoff: number[]
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = backoff[i] || backoff[backoff.length - 1];
        logger.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

async function main(): Promise<void> {
  logger.info('Starting Anna\'s Archive Book Downloader');

  // Load and validate config
  const config = loadConfig();
  validateConfig(config);

  // Acquire lock
  if (!acquireLock()) {
    process.exit(1);
  }

  // Setup graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...');
    releaseLock();
    rl.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Initialize components
  const excelReader = new ExcelReader(config.excelFile);
  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);
  const downloader = new Downloader(config, httpClient);

  // Read books
  const books = excelReader.readBooks();

  let processed = 0;
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const book of books) {
    processed++;
    logger.info(`Processing ${processed}/${books.length}: ${book.chineseTitle || book.englishTitle}`);

    try {
      // Check if already downloaded
      if (book.downloadStatus && book.downloadStatus !== '') {
        logger.info(`Skipping - already marked as ${book.downloadStatus}`);
        skipped++;
        continue;
      }

      // Determine search method
      let searchResult: SearchResult | null = null;

      if (book.bookLink) {
        // Use existing MD5 from book link
        const md5 = downloader.extractMd5FromUrl(book.bookLink);
        if (md5) {
          searchResult = {
            md5,
            title: book.chineseTitle || book.englishTitle,
            author: book.chineseAuthor || book.englishAuthor,
            format: 'pdf',
            language: '',
            size: '',
            sizeBytes: 0,
            year: '',
          };
        } else {
          logger.warn(`Invalid book link: ${book.bookLink}`);
        }
      }

      // Search if no direct link
      if (!searchResult) {
        const results = await searcher.search(book);
        searchResult = searcher.selectBestResult(results, book.language === 'en' ? book.englishTitle : book.chineseTitle);
      }

      if (!searchResult) {
        logger.warn(`Not found: ${book.chineseTitle || book.englishTitle}`);
        excelReader.updateStatus(book.rowIndex, '未找到');
        failed++;
        continue;
      }

      // Download with retry
      const result = await withRetry(
        () => downloader.download(book, searchResult!),
        config.maxRetries,
        [1000, 2000, 4000]
      );

      if (result.success) {
        excelReader.updateStatus(book.rowIndex, '已下载', `https://annas-archive.gl/md5/${searchResult.md5}`);
        downloaded++;
      } else {
        excelReader.updateStatus(book.rowIndex, `下载失败: ${result.error}`);
        failed++;
      }

      // Save Excel progress
      excelReader.save();

      // Rate limiting
      await sleep(config.rateLimitMs);

    } catch (error) {
      const errorMsg = (error as Error).message;

      if (errorMsg === 'CAPTCHA_DETECTED') {
        logger.warn('CAPTCHA detected. Please solve it and update cookies.json.');
        const answer = await promptUser('Press Enter to continue or type "quit" to abort: ');
        if (answer.toLowerCase() === 'quit') {
          break;
        }
        // Reload cookies after user updates cookies.json
        httpClient.reloadCookies();
        continue;
      }

      if (errorMsg === 'RATE_LIMITED') {
        await sleep(60000);
        continue;
      }

      if (errorMsg === 'CONSECUTIVE_FAILURES') {
        const answer = await promptUser('Press Enter to continue or type "quit" to abort: ');
        if (answer.toLowerCase() === 'quit') {
          break;
        }
        continue;
      }

      logger.error(`Unexpected error: ${errorMsg}`);
      excelReader.updateStatus(book.rowIndex, `错误: ${errorMsg}`);
      failed++;
    }
  }

  // Final save
  excelReader.save();

  // Summary
  logger.info('='.repeat(50));
  logger.info(`Completed: ${processed} processed, ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
  logger.info('='.repeat(50));

  releaseLock();
  rl.close();
}

main().catch(error => {
  logger.error(`Fatal error: ${error.message}`);
  releaseLock();
  process.exit(1);
});
```

- [ ] **Step 2: Commit main entry point**

```bash
git add src/index.ts
git commit -m "feat: add main orchestrator with rate limiting, CAPTCHA handling, and graceful shutdown"
```

---

## Chunk 10: Final Setup and Testing

### Task 11: Create Default Directories and Files

**Files:**
- Create: `src/assets/.gitkeep`
- Create: `downloads/.gitkeep`
- Create: `logs/.gitkeep`

- [ ] **Step 1: Create placeholder files**

```bash
touch src/assets/.gitkeep
touch downloads/.gitkeep
touch logs/.gitkeep
```

- [ ] **Step 2: Update .gitignore to allow .gitkeep**

The .gitignore already allows specific patterns, but we need to ensure .gitkeep files are tracked:

```bash
git add -f src/assets/.gitkeep downloads/.gitkeep logs/.gitkeep
```

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "chore: add placeholder files for required directories"
```

### Task 12: Verify Project Structure

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 2: Test with example config**

```bash
cp config.example.json config.json
# User needs to fill in API key manually
```

- [ ] **Step 3: Verify all files exist**

Expected file structure:
```
annasBook/
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── excel-reader.ts
│   ├── searcher.ts
│   ├── downloader.ts
│   ├── http-client.ts
│   ├── logger.ts
│   ├── lock.ts
│   ├── types.ts
│   └── assets/.gitkeep
├── downloads/.gitkeep
├── logs/.gitkeep
├── config.example.json
├── config.json (not in git)
├── package.json
├── tsconfig.json
└── .gitignore
```

- [ ] **Step 4: Final commit message**

```bash
git log --oneline
```

---

## Summary

This plan creates a complete Anna's Archive book downloader with:

1. **Project initialization** - TypeScript, tsx, dependencies
2. **Core modules** - Types, Config, Logger, Lock
3. **Excel handling** - Read books, update status, detect duplicates
4. **HTTP client** - Cookie support, CAPTCHA detection
5. **Searcher** - HTML parsing with cheerio, best match selection
6. **Downloader** - API integration, file handling, integrity check
7. **Main orchestrator** - Rate limiting, graceful shutdown, error handling

**Total tasks:** 12
**Estimated files created:** 12 source files + config files
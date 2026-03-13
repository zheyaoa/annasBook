# Anna's Archive Book Downloader - Design Document

**Date:** 2026-03-13
**Status:** Approved for Implementation

## Overview

A TypeScript script that reads book information from an Excel file, searches for books on Anna's Archive via HTTP crawler, and downloads them using the official fast_download.json API. The script supports incremental downloads and handles CAPTCHA with manual intervention.

## Requirements

### Input
- Excel file: configurable via `config.json` (default: `src/assets/海外中国.xlsx`)
- Fields: 语言, 书名, Book title, 作者, Author, Time, 出版社, Press, 置信度, 下载状态, 书籍链接

### Output
- Downloaded files in `downloads/` directory (no language subdirectories)
- Updated Excel file with download status

### Core Features
1. Read book list from Excel
2. Search for books on Anna's Archive via web scraping
3. Download books using fast_download.json API
4. Support incremental downloads (skip already downloaded books)
5. Handle CAPTCHA with manual intervention

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Excel Reader  │────▶│   Book Searcher  │────▶│  Book Downloader│
│   (xlsx)        │     │   (HTTP Crawler) │     │  (HTTP API)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Book Data     │     │   Search Results │     │  Downloaded     │
│   (in-memory)   │     │   (MD5 + meta)   │     │  Files          │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Components

### 1. Config Module (`src/config.ts`)
- Store API key for Anna's Archive
- Store base URLs and settings
- Format: JSON config file

```typescript
interface Config {
  apiKey: string;
  baseUrl: string;
  excelFile: string;      // Path to input Excel file
  downloadDir: string;
  rateLimitMs: number;
}
```

### 2. Excel Reader (`src/excel-reader.ts`)
- Parse input Excel file using `xlsx` library
- Extract book information (Chinese title, English title, authors, language)
- Read and update download status

```typescript
interface BookInfo {
  rowIndex: number;       // Excel row number (1-based, for updates)
  language: string;       // 语言 - determines search title: "en" = use englishTitle, else use chineseTitle
  chineseTitle: string;   // 书名
  englishTitle: string;   // Book title
  chineseAuthor: string;  // 作者
  englishAuthor: string;  // Author
  confidence: string;     // 置信度 - preserved unchanged when writing back
  downloadStatus: string; // 下载状态
  bookLink: string;       // 书籍链接 - if populated, extract MD5 and skip search
}
```

### 3. Book Searcher (`src/searcher.ts`)
- Use HTTP crawler (fetch or axios) for web scraping
- Include cookies in request headers for authenticated user state
- Search URL format: `https://annas-archive.gl/search?index=&page=1&sort=&ext=pdf&ext=epub&display=&q={book_title}`
- Parse HTML response to extract MD5 and metadata
- Use HTML parser (cheerio or similar) for DOM parsing

**HTML Parsing Selectors:**
- MD5: `a[href^="/md5/"]` → extract from href attribute
- Title: Text content of the MD5 link
- Author: Links containing `icon-[mdi--user-edit]`
- Format info: Text like "English [en] · PDF · 26.8MB · 1971"

**Format Priority:** PDF > EPUB

```typescript
interface SearchResult {
  md5: string;
  title: string;
  author: string;
  format: 'pdf' | 'epub';
  language: string;
  size: string;
  year: string;
}
```

### 4. Book Downloader (`src/downloader.ts`)
- Use fast_download.json API for downloading
- API format: `GET /fast_download.json?md5={md5}&key={apiKey}`
- Handle API responses and errors
- Save files with naming convention: `中文书名 - 英文书名.扩展名`

### 5. Main Orchestrator (`src/index.ts`)
- Coordinate all components
- Handle CAPTCHA detection and pause for manual intervention
- Implement rate limiting between HTTP requests
- Support incremental downloads

## Data Flow

1. **Initialize:** Load config, load cookies
2. **Read Excel:** Parse book list into memory
3. **For each book:**
   a. Check if already downloaded (Excel status + local file existence)
   b. Skip if downloaded
   c. Search on Anna's Archive via HTTP request
   d. Parse HTML results, select best match (PDF > EPUB)
   e. Download using fast_download.json API
   f. Save file to `downloads/`
   g. Update Excel download status
4. **Cleanup:** Save Excel

## Error Handling

### Startup Validation
- Check `config.json` exists and is valid JSON before starting
- Validate required config fields: apiKey, baseUrl, excelFile
- Check Excel file (from config) exists before starting
- Validate Excel file has required columns: 语言, 书名, Book title
- Create download directory on startup if not exist
- Create logs directory on startup if not exist
- Prevent concurrent execution: check for `.lock` file, exit if exists
- Create `.lock` file on startup, remove on exit (normal or error)

### CAPTCHA Detection
- Detect CAPTCHA by checking HTTP response for specific patterns:
  - Cloudflare challenge: response contains `challenge-running` or `cf-turnstile`
  - Generic CAPTCHA indicators: `g-recaptcha`, `h-captcha` in HTML
  - HTTP status codes: 403 with CAPTCHA-related content
- When CAPTCHA detected:
  - Pause execution and print: "CAPTCHA detected. Please visit the URL in a browser, solve the CAPTCHA, then update cookies.json with new session cookies. Press Enter to continue (or type 'quit' to abort)..."
  - Display the URL that triggered CAPTCHA
  - Wait for user input: Enter = continue (with updated cookies), 'quit' = exit gracefully
  - No timeout - user has unlimited time to solve
  - No automatic CAPTCHA solving - manual intervention required

### Rate Limiting
- Configurable delay between requests via `rateLimitMs` in config
- Default: 2000ms (2 seconds) between searches
- Lower frequency to avoid triggering CAPTCHA

### Search Result Matching Algorithm
1. **Title search order (based on `语言` field):**
   - If `语言` is `en`: use English title (`Book title`) for search
   - Otherwise: use Chinese title (`书名`) for search
   - If selected title is empty: try the other title as fallback
   - If both titles are empty but `书籍链接` is populated: skip search, use MD5 from link
   - If both titles are empty and no `书籍链接`: skip book, mark as "跳过-无标题"
2. **Filter results by format priority:** PDF > EPUB
3. **Best match selection (when multiple PDFs exist):**
   - Compare `SearchResult.title` against the search title used (based on `语言` field)
   - Exact title match: case-insensitive, ignoring punctuation (`:`, `-`, `—`, `,`, `.`, `!`, `?`, `'`, `"`)
   - If multiple exact matches: prefer larger file size
   - If no exact match: use first result (Anna's Archive default relevance sort)
4. **File size comparison:**
   - Parse size strings: convert "26.8MB" → 26800000 bytes, "1.2GB" → 1200000000 bytes
   - Compare numerically after conversion
5. **Search pagination:**
   - Only search first page of results (typically 25 results)
   - If no match on first page, proceed to next book (acceptable for most use cases)
6. **If no results found:**
   - Log warning with book title
   - Mark as "未找到" (not found) in Excel
   - Continue to next book
7. **Handle malformed search HTML:**
   - If MD5 link parsing fails: log error, skip result
   - If format info parsing fails: log warning, assume PDF, proceed to download

### Network Failures
- HTTP timeout: 30 seconds for requests, 5 minutes for downloads
- Log all network errors to log file

### Retry Strategy
- Max retries: 3 attempts
- Backoff: exponential (1s, 2s, 4s delays between retries)
- Applies to: downloads, API requests, HTTP requests
- Does NOT apply to: search operations (proceed to next book on failure)

### File System Errors
- Check disk space before download (warn if < 100MB available)
- Create download directory on startup if not exist
- Handle permission denied by logging error and skipping file
- Sanitize filenames: remove/replace invalid filesystem characters (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
- Truncate filenames to 255 characters (OS limit), preserving extension
- Handle empty Chinese title: use `{englishTitle}.ext`
- Handle empty English title: use `{chineseTitle}.ext`
- Note: if both titles are empty, the book is skipped in search phase (see "Search Result Matching Algorithm")

### Excel Validation
- Validate required columns exist: 语言, 书名, Book title
- Skip rows with missing required fields, log warning
- Skip duplicate entries (same 书名 + Book title combination), log info
- Handle Excel file locked by another process: retry 3 times with 1s delay, then exit with error
- Preserve `置信度` column value unchanged when writing back to Excel
- `语言` field determines search title: "en" = use English title, otherwise use Chinese title

### Download Integrity
- Compare downloaded file size with expected size from search results
- If size mismatch: delete file, retry download
- Mark download as complete only after integrity check passes
- Cleanup partial downloads: delete incomplete files on error or interrupt
- Use temp file during download (`.tmp` suffix), rename on completion

### Cookie/Session Management
- Cookie storage location: `./cookies.json`
- Cookies format: JSON array of cookie objects or single cookie string
- Load cookies on startup, include in HTTP requests as `Cookie` header
- Handle corrupted `cookies.json`: delete file, proceed without cookies (user may need to login and export cookies)
- If session expires (detected by 401/403 response or login redirect): prompt user to re-login and update cookies.json

### Download Failures
- Log errors to `./logs/download.log` with timestamp, book title, error message
- Continue with next book on failure (after retries exhausted)
- Mark failed downloads as "下载失败" in Excel
- Consecutive failure threshold: if 5 consecutive downloads fail, pause and prompt user to check for issues (network, API key, etc.)

### Incremental Downloads
- Check Excel `下载状态` column first
- Double-check by verifying local file existence
- Skip books with both conditions met
- If Excel shows "downloaded" but file is missing: re-download the file
- If `书籍链接` already populated: skip search, extract MD5 from URL (format: `/md5/{hash}`) and download directly
- Validate `书籍链接` MD5: if download fails with "not found" error, mark as "链接失效" and continue

### API Error Handling
- `fast_download.json` possible errors:
  - `{"error": "invalid_md5"}`: MD5 format invalid, skip book
  - `{"error": "not_found"}`: Book no longer available, mark as "资源不存在"
  - `{"error": "invalid_key"}`: API key invalid/expired, exit with error
  - `{"error": "rate_limit"}`: Too many requests, wait 60s and retry
  - `{"error": "membership_required"}`: Book requires membership, verify user login
- On API error: log error details, update Excel status accordingly, continue to next book

### Excel Data Validation
- Convert all cell values to strings (handle numbers, dates)
- Skip formula cells (use cached value if available, else empty string)

### Logging
- Log file location: `./logs/download.log`
- Format: `[YYYY-MM-DD HH:mm:ss] [LEVEL] message`
- Levels: INFO, WARN, ERROR
- No log rotation (user manages manually)
- Log all operations: searches, downloads, errors, CAPTCHA events

### Graceful Shutdown
- Handle SIGINT (Ctrl+C) and SIGTERM signals
- On shutdown:
  - Save current Excel progress
  - Remove `.lock` file
  - Log shutdown event
- Resume from last position on next run (via Excel `下载状态` check)

## File Structure

```
annasBook/
├── src/
│   ├── index.ts          # Main entry point
│   ├── config.ts         # Configuration management
│   ├── excel-reader.ts   # Excel parsing
│   ├── searcher.ts       # Anna's Archive search (HTTP crawler)
│   ├── downloader.ts     # API download
│   └── types.ts          # TypeScript interfaces
├── src/assets/
│   └── 海外中国.xlsx      # Input book list (default)
├── downloads/            # All downloaded books
├── logs/
│   └── download.log      # Download log file
├── config.json           # API key and settings
├── cookies.json          # Session cookies
├── package.json
└── tsconfig.json
```

## Technology Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Runner:** tsx (TypeScript execution)
- **HTTP Client:** fetch (native) or axios
- **HTML Parser:** cheerio
- **Excel Parsing:** xlsx library

## Configuration

`config.json`:
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

## Security Considerations

- API key stored in config file (not committed to git)
- Add `config.json` and `cookies.json` to `.gitignore`
- Cookies stored locally for session persistence at `./cookies.json`

## Testing Strategy

- Unit tests for Excel parsing
- Unit tests for HTML parsing with cheerio
- Integration test with single book search
- Manual testing for CAPTCHA handling

## Limitations

- No search API available from Anna's Archive
- Web scraping may break if HTML structure changes
- CAPTCHA requires manual intervention (update cookies manually)
- Rate limiting needed to avoid blocking
- Cloudflare protection may block requests without valid session cookies
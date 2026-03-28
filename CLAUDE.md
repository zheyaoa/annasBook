# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anna's Archive Book Downloader - A TypeScript tool to search and download books from Anna's Archive. Supports batch processing from Excel files and single-book CLI mode.

## Commands

```bash
# Run in Excel batch mode (default)
npx tsx /Users/yuyuxin/code/annasBook/src/index.ts

# CLI search mode (no download, just search and display results)
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-search.ts --title "Book Title" --author "Author Name"
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-search.ts --title "Book Title" --format pdf --lang en

# CLI download mode (search and download interactively, or by MD5)
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-download.ts --title "Book Title" --author "Author"
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-download.ts --md5 <md5_hash> --filename "Output Name"

# CLI batch mode (batch download from Excel, with JSON output support)
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-batch.ts --excel ./books.xlsx
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-batch.ts --excel ./books.xlsx --output ./downloads --limit 5 --json

# Unified CLI entry point (delegates to subcommands)
npx tsx /Users/yuyuxin/code/annasBook/src/cli.ts search --title "Book Title" --json
npx tsx /Users/yuyuxin/code/annasBook/src/cli.ts download --md5 <md5> --output ./downloads
npx tsx /Users/yuyuxin/code/annasBook/src/cli.ts batch --excel ./books.xlsx --json

# Build TypeScript to JavaScript
npm run build

# Run standalone test scripts
npx tsx /Users/yuyuxin/code/annasBook/test/test-match.ts
npx tsx /Users/yuyuxin/code/annasBook/test/test-fast-download.ts
```

## Configuration

Configuration file is located at `~/.annasbook/config.json` (user-level, not in project).

**Initialize config:**
```bash
npx tsx commands/cli.ts config init    # Creates ~/.annasbook/config.json
```

**Config file search order:**
1. `$ANNASBOOK_CONFIG` env var (if set)
2. `~/.annasbook/config.json` (default)
3. `./config.json` (backward compat, deprecated)

**Config fields:**
- `apiKey`: API key for Anna's Archive (required)
- `baseUrl`: Base URL for Anna's Archive mirror
- `excelFile`: Path to Excel file with book list (Excel mode only)
- `downloadDir`: Directory for downloaded files
- `rateLimitMs`: Delay between requests (default: 2000)
- `requestTimeoutMs`: HTTP request timeout (default: 30000)
- `downloadTimeoutMs`: Download timeout (default: 300000)
- `maxRetries`: Max retry attempts (default: 3)
- `proxy`: Optional proxy URL (also reads from `HTTPS_PROXY`/`HTTP_PROXY` env vars)
- `downloadLimit`: Optional max downloads per run (0 or undefined = unlimited)
- `openai`: Optional OpenAI config for LLM-assisted title matching when traditional matching fails:
  - `apiKey`: OpenAI API key
  - `baseUrl`: Optional, defaults to `https://api.openai.com/v1`
  - `model`: Optional, defaults to `gpt-4o-mini`

Authentication requires a `cookies.json` file in the project root. The file can be:
- A string of cookie key=value pairs
- An array of `{name, value}` objects
- A key-value object

## Directory Structure Rules

| 目录 | 职责 | 可创建的文件类型 |
|------|------|----------------|
| `src/` | 核心业务逻辑库 | `.ts` 核心模块 |
| `commands/` | CLI 命令处理器 | `.ts` 命令模块 |
| `test/` | 测试脚本 | `.ts` 测试脚本 |
| `scripts/` | 临时/一次性脚本 | `.ts` 临时脚本 (标记 `_delete` 后缀，等待清理) |
| `docs/` | 文档 | `.md` 文档 |
| `bin/` | 构建产物 | (自动生成) |
| `logs/` | 日志文件 | (自动生成) |
| `downloads/` | 下载的书籍 | (自动生成) |
| `assets/` | 静态资源/Excel | `.xlsx` 等资源文件 |

### File Creation Rules

1. **禁止在根目录创建 `.ts` 文件** — 调试/临时脚本一律放 `scripts/`
2. **临时脚本命名加 `_delete` 后缀** — 如 `debug-search_delete.ts`，表示"待删除"
3. **禁止在 `src/` 和 `commands/` 创建带 `_delete` 后缀的文件**
4. **定期清理** — 项目成员发现带 `_delete` 的文件应确认后删除

## Architecture

```
src/
├── index.ts        # Entry point with CLI parsing and main loop
├── cli.ts          # Unified CLI entry point (delegates to scripts/)
├── searcher.ts     # Search Anna's Archive, parse results, select best match
├── downloader.ts   # Download books via fast_download API endpoint
├── http-client.ts  # HTTP wrapper with cookies, proxy, CAPTCHA detection
├── excel-reader.ts # Read/write Excel files, track download status
├── config.ts       # Load and validate configuration
├── types.ts        # TypeScript interfaces
├── logger.ts       # Console and file logging
└── lock.ts         # Process lock to prevent concurrent instances

scripts/
├── cli-search.ts   # CLI search script (npm run search)
├── cli-download.ts # CLI download script (npm run download)
└── cli-batch.ts    # CLI batch script (npm run batch) with JSON output
```

### Data Flow

1. **Excel Mode**: `ExcelReader` reads book list → `Searcher` searches for each book → `Downloader` downloads the best match → `ExcelReader` updates status in the same file
2. **CLI Search Mode**: Arguments parsed → `Searcher` searches → results displayed (no download)
3. **CLI Download Mode**: Arguments parsed → `Searcher` searches (or uses MD5 directly) → user selects → `Downloader` downloads
4. **CLI Batch Mode**: Excel file parsed → iterate books → search/download each → JSON output for programmatic use

### Key Classes

- **Searcher**: Scrapes search results from Anna's Archive HTML, parses format info (PDF/EPUB, size, language, year), selects best match preferring exact title match and larger file size. Falls back to LLM-assisted matching via OpenAI API when traditional matching fails.
- **Downloader**: Uses `/fast_download.json` API endpoint, auto-detects actual format from file header, supports retry on timeout
- **HttpClient**: Handles cookies (loaded from `cookies.json`), proxy configuration, CAPTCHA detection (`challenge-running`, `cf-turnstile`, `g-recaptcha`, `h-captcha`)

### Excel Format

Required columns (Chinese headers):
- `语言` (language): "en" uses English title for search, otherwise uses Chinese title
- `书名` (Chinese title)
- `Book title` (English title)
- `作者` (Chinese author)
- `Author` (English author)
- `下载状态` (download status): Updated after each download attempt
- `书籍链接` (book link): Optional MD5 link to skip search

### Error Handling

- `CAPTCHA_DETECTED`: Requires manual CAPTCHA solve and cookie update
- `RATE_LIMITED`: 60-second wait
- `CONSECUTIVE_FAILURES`: Stops after 5 consecutive failures
- `NO_DOWNLOADS_LEFT`: Account has no downloads remaining, stops immediately

### File Naming

Downloaded files are saved as: `{中文书名} - {英文书名}.{扩展名}` (sanitized for filesystem compatibility)

## Development Notes

- TypeScript ES modules (`"type": "module"`) with `.js` import extensions required
- Uses `tsx` for direct TypeScript execution
- No test framework configured - tests in `test/` are standalone scripts run via `tsx test/<name>.ts`
- Test pattern: extend classes to expose private methods for testing (e.g., `TestSearcher extends Searcher`)
- Log files written to `./logs/download-YYYY-MM-DD.log`
- Prefer Chinese responses when communicating with user

## Key Dependencies

- `axios`: HTTP client for API requests
- `cheerio`: HTML parsing for search results
- `xlsx`: Excel file reading/writing
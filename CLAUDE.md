# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anna's Archive Book Downloader - A TypeScript tool to search and download books from Anna's Archive. Supports batch processing from Excel files and single-book CLI mode.

## Commands

```bash
# Run in Excel batch mode (default)
npm start

# CLI search mode (no download, just search and display results)
npm run search -- --title "Book Title" --author "Author Name"
npm run search -- --title "Book Title" --format pdf --lang en

# Build TypeScript to JavaScript
npm run build
```

## Configuration

Create `config.json` in the project root with:
- `apiKey`: API key for Anna's Archive (required)
- `baseUrl`: Base URL for Anna's Archive mirror
- `excelFile`: Path to Excel file with book list (Excel mode only)
- `downloadDir`: Directory for downloaded files
- `proxy`: Optional proxy URL (also reads from `HTTPS_PROXY`/`HTTP_PROXY` env vars)
- `openai`: Optional OpenAI config for LLM-assisted title matching when traditional matching fails:
  - `apiKey`: OpenAI API key
  - `baseUrl`: Optional, defaults to `https://api.openai.com/v1`
  - `model`: Optional, defaults to `gpt-4o-mini`

Authentication requires a `cookies.json` file in the project root. The file can be:
- A string of cookie key=value pairs
- An array of `{name, value}` objects
- A key-value object

## Architecture

```
src/
├── index.ts        # Entry point with CLI parsing and main loop
├── searcher.ts     # Search Anna's Archive, parse results, select best match
├── downloader.ts   # Download books via fast_download API endpoint
├── http-client.ts  # HTTP wrapper with cookies, proxy, CAPTCHA detection
├── excel-reader.ts # Read/write Excel files, track download status
├── config.ts       # Load and validate configuration
├── types.ts        # TypeScript interfaces
├── logger.ts       # Console and file logging
└── lock.ts         # Process lock to prevent concurrent instances
```

### Data Flow

1. **Excel Mode**: `ExcelReader` reads book list → `Searcher` searches for each book → `Downloader` downloads the best match → `ExcelReader` updates status in the same file
2. **CLI Mode**: Arguments parsed → `Searcher` searches → `Downloader` downloads

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

## Development Notes

- 任何修改都需要遵守 superpowers 的规范进行
- TypeScript ES modules (`"type": "module"`) with `.js` import extensions required
- Uses `tsx` for direct TypeScript execution
- No test framework configured
- Log files written to `./logs/download-YYYY-MM-DD.log`
- Test files should be placed in `test/` directory
- Prefer Chinese responses when communicating with user
# npm README Design — @zheyao/annas-book-downloader

## Overview

Create an English-language README.md for publishing `@zheyao/annas-book-downloader` to npm. The README should be concise (~200 lines), visually scannable, and focused on helping users get started quickly.

## Package Info

- **Name:** `@zheyao/annas-book-downloader`
- **Tagline:** CLI tool to search and download books from Anna's Archive
- **License:** ISC

## Sections

### 1. Features (5 bullets)
- Search mode: search books without downloading
- Download mode: interactive selection or MD5-based download
- Batch mode: batch download from Excel files, with JSON output support
- Smart matching: auto-select best match, with LLM-assisted fallback
- Robust error handling: CAPTCHA detection, rate limiting, timeout retry

### 2. Requirements
- Node.js 18+
- Anna's Archive API key
- cookies.json file (for download)

### 3. Installation
```bash
npm install -g @zheyao/annas-book-downloader
```

Then use the `annas-download` CLI command.

### 4. Quick Start
- `annas-download config init` — initialize config
- `annas-download search --title "Book Title"` — search example
- `annas-download download --md5 <hash>` — download example

### 5. Usage (3 subcommands)
#### Search
```bash
annas-download search --title "The Great Gatsby" --author "Fitzgerald"
annas-download search --title "1984" --format pdf --lang en
```

#### Download
```bash
annas-download download --title "The Great Gatsby"  # interactive
annas-download download --md5 <32位MD5> --filename "Output Name"
```

#### Batch
```bash
annas-download batch --excel ./books.xlsx
annas-download batch --excel ./books.xlsx --output ./downloads --limit 10 --json
```

### 6. Configuration
All config fields in a table format:
- apiKey, baseUrl (required)
- downloadDir, rateLimitMs, requestTimeoutMs, downloadTimeoutMs, maxRetries (optional with defaults)
- proxy (optional)
- openai.apiKey, openai.model (optional, for LLM matching)

### 7. Error Handling
Table with 4 common errors:
- CAPTCHA_DETECTED → solve manually, update cookies
- NO_DOWNLOADS_LEFT → switch account
- RATE_LIMITED → auto-wait 60s
- CONSECUTIVE_FAILURES → check network/proxy

### 8. License
ISC

## Style
- Minimal design, no heavy graphics
- Emoji for visual scan (🔍 📥 📊 🔄 🛡️)
- Code blocks for all commands
- No project structure or dev docs (not relevant to end users)

## File
The README.md will replace the existing README.md at project root. Original Chinese README to be archived to `docs/README-zh.md` if user wants to preserve it.

# Anna's Archive Book Downloader

CLI tool to search and download books from Anna's Archive mirror sites.

## Features

- 🔍 **Search** — Search books without downloading
- 📥 **Download** — Interactive selection or MD5-based download
- 📊 **Batch** — Batch download from Excel files with JSON output
- 🔄 **Smart Matching** — Auto-select best match, with LLM-assisted fallback
- 🛡️ **Error Handling** — CAPTCHA detection, rate limiting, timeout retry

## Requirements

- Node.js 18+
- Anna's Archive API key
- `cookies.json` file (for downloads)

## Installation

```bash
npm install -g annas-downloader
```

**Install the Claude Code skill (optional but recommended):**

```bash
annas-download install
```

This installs the `anna-downloader` skill to `~/.claude/skills/`, enabling Claude Code to help with book searches and downloads.

## Quick Start

### 1. Initialize config

```bash
annas-download config init
```

Edit `~/.annasbook/config.json` with your API key and mirror URL.

### 2. Search for a book

```bash
annas-download search --title "The Great Gatsby"
```

### 3. Download a book

```bash
annas-download download --md5 <md5-hash>
```

## Usage

### Search

```bash
annas-download search --title "Book Title" --author "Author"
annas-download search --title "Dune" --format pdf
annas-download search --title "1984" --format epub --lang en
```

**Options:**
| Option | Description |
|--------|-------------|
| `--title <string>` | Book title keywords (required) |
| `--author <string>` | Author name |
| `--format <pdf\|epub>` | Filter by format |
| `--lang <en\|zh>` | Language preference (default: en) |
| `--limit <number>` | Max results (default: 5) |
| `--json` | JSON output |

### Download

**Interactive (search first):**
```bash
annas-download download --title "The Great Gatsby"
```

**By MD5 directly:**
```bash
annas-download download --md5 a1b2c3d4e5f6...
annas-download download --md5 a1b2c3d4e5f6... --filename "My Book"
```

**Options:**
| Option | Description |
|--------|-------------|
| `--md5 <string>` | Book MD5 hash (bypasses search) |
| `--title <string>` | Book title keywords (for search) |
| `--author <string>` | Author name |
| `--format <pdf\|epub>` | Filter by format |
| `--lang <en\|zh>` | Language preference |
| `--filename <string>` | Output filename (MD5 mode only) |
| `--output <dir>` | Output directory |
| `--json` | JSON output |

### Batch Download

```bash
annas-download batch --excel ./books.xlsx
annas-download batch --excel ./books.xlsx --output ./downloads --limit 10
annas-download batch --excel ./books.xlsx --json
```

**Options:**
| Option | Description |
|--------|-------------|
| `--excel <file>` | Excel file path (required) |
| `--output <dir>` | Output directory |
| `--limit <n>` | Max downloads |
| `--json` | JSON output |

**Excel Format:**
| Column | Description |
|--------|-------------|
| 语言 | "en" to use English title, otherwise Chinese |
| 书名 | Chinese title |
| Book title | English title |
| 作者 | Chinese author |
| Author | English author |
| 下载状态 | Status (updated automatically) |
| 书籍链接 | Optional MD5 link to skip search |

### Config Management

```bash
annas-download config list    # Show config paths and values
annas-download config path    # Show active config file path
annas-download config init    # Create default config in ~/.annasbook/
```

### Convert EPUB to PDF

```bash
annas-download convert ./book.epub
annas-download convert ./book.epub --output ./pdfs
```

### Generate PDF Preview

```bash
annas-download preview ./book.pdf
annas-download preview ./book.pdf --output ./previews
```

Requires `pdftoppm` from poppler (macOS: `brew install poppler`)

## Configuration

Edit `~/.annasbook/config.json`:

```json
{
  "apiKey": "your-api-key",
  "baseUrl": "https://annas-archive.gl",
  "downloadDir": "./downloads",
  "rateLimitMs": 10000,
  "requestTimeoutMs": 30000,
  "downloadTimeoutMs": 300000,
  "maxRetries": 3,
  "proxy": "http://127.0.0.1:7892",
  "downloadLimit": 10,
  "openai": {
    "enable": true,
    "apiKey": "sk-...",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini"
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `apiKey` | required | API key for Anna's Archive |
| `baseUrl` | required | Base URL for mirror |
| `downloadDir` | ./downloads | Download directory |
| `rateLimitMs` | 10000 | Delay between requests (ms) |
| `requestTimeoutMs` | 30000 | HTTP request timeout (ms) |
| `downloadTimeoutMs` | 300000 | Download timeout (ms) |
| `maxRetries` | 3 | Max retry attempts |
| `proxy` | - | Optional proxy URL |
| `downloadLimit` | unlimited | Max downloads per run |
| `openai.apiKey` | - | OpenAI API key for LLM matching |
| `openai.enable` | true | Enable LLM fallback |

## Error Handling

| Error | Meaning | Solution |
|-------|---------|----------|
| `CAPTCHA_DETECTED` | CAPTCHA challenge triggered | Visit search URL in browser, solve CAPTCHA, update `cookies.json` |
| `NO_DOWNLOADS_LEFT` | Account has no downloads remaining | Use a different account |
| `RATE_LIMITED` | Too many requests | Tool waits 60 seconds automatically |
| 502 Bad Gateway | Rate limit too aggressive | Increase `rateLimitMs` to 10000 or higher |

## License

ISC

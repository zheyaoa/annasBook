---
name: anna-downloader
description: |
  Download, search, batch process, convert, and preview books from Anna's Archive using the CLI tool. Use this skill whenever the user wants to search for, download, batch download from Excel, convert ebook formats, or generate PDF previews from Anna's Archive. Triggers on requests like "download a book", "find a PDF of", "search for ebook", "get a book from Anna's Archive", "batch download books from Excel", "convert epub to pdf", "generate PDF preview", or any mention of downloading books/ebooks/PDFs/EPUBs. The skill provides complete CLI commands for searching, downloading, batch processing, format conversion, and PDF preview generation.
---

# Anna's Archive Book Downloader

A CLI tool to search and download books from Anna's Archive mirror sites.

## Prerequisites

Before using this tool, you need a config file. The tool searches for config in this order:

1. `ANNASBOOK_CONFIG` environment variable
2. `~/.annasbook/config.json` (default location)

**Initialize config:**
```bash
annas-download config init
```

**Config file format:**
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

**Config fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | string | required | API key for Anna's Archive |
| `baseUrl` | string | required | Base URL for Anna's Archive mirror |
| `downloadDir` | string | ./downloads | Directory for downloaded files |
| `rateLimitMs` | number | 10000 | Delay between requests (ms) - **important: 10s default to avoid 502 errors** |
| `requestTimeoutMs` | number | 30000 | HTTP request timeout (ms) |
| `downloadTimeoutMs` | number | 300000 | Download timeout (ms) |
| `maxRetries` | number | 3 | Max retry attempts |
| `proxy` | string | - | Optional proxy URL |
| `downloadLimit` | number | - | Max downloads per run (0 = unlimited) |
| `openai.apiKey` | string | - | OpenAI API key for LLM-assisted matching |
| `openai.baseUrl` | string | https://api.openai.com/v1 | OpenAI API base URL |
| `openai.model` | string | gpt-4o-mini | OpenAI model for matching |
| `openai.enable` | boolean | true | Enable LLM fallback when traditional matching fails |
| `excelFile` | string | - | Path to Excel file for batch mode |

**Environment variables** (override config file):
- `ANNASBOOK_API_KEY` - API key
- `ANNASBOOK_BASE_URL` - Mirror URL
- `ANNASBOOK_DOWNLOAD_DIR` - Download directory
- `ANNASBOOK_PROXY` - Proxy URL

**cookies.json** (in project root or `~/.annasbook/`) - Authentication cookies:
```json
"name1=value1; name2=value2"
```

## CLI Commands

### Search for Books

```bash
annas-download search --title "Book Title"
annas-download search --title "Book Title" --author "Author Name"
annas-download search --title "Dune" --format epub
annas-download search --title "1984" --author "Orwell" --format pdf --lang en
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

### Download Books

**Method 1: Search and Download Interactively**

```bash
annas-download download --title "The Great Gatsby"
annas-download download --title "1984" --author "Orwell" --format pdf
```

**Method 2: Download by MD5 Directly**

```bash
annas-download download --md5 a1b2c3d4e5f6...
annas-download download --md5 a1b2c3d4e5f6... --filename "My Book Title"
```

**Download Options:**
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

### Batch Download from Excel

```bash
annas-download batch --excel ./books.xlsx
annas-download batch --excel ./books.xlsx --output ./downloads --limit 10
annas-download batch --excel ./books.xlsx --json
```

**Batch Options:**
| Option | Description |
|--------|-------------|
| `--excel <file>` | Excel file path (required) |
| `--output <dir>` | Output directory |
| `--limit <n>` | Max downloads |
| `--json` | JSON output |

**Excel Format Requirements:**
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
annas-download config list    # Show config paths and current values
annas-download config path    # Show active config file path
annas-download config init    # Create default config in ~/.annasbook/
```

### Convert EPUB to PDF

```bash
annas-download convert ./book.epub
annas-download convert ./book.epub --output ./pdfs
annas-download convert ./book.epub --output ./pdfs/mybook.pdf
```

**Convert Options:**
| Option | Description |
|--------|-------------|
| `<input.epub>` | Path to EPUB file (required, position arg) |
| `--output <path>` | Output path or directory for PDF |

### Generate PDF Preview

Generate a PNG preview of the first page of a PDF file.

```bash
annas-download preview ./book.pdf
annas-download preview ./book.pdf --output ./previews
annas-download preview ./book.pdf --output ./previews/cover.png
```

**Preview Options:**
| Option | Description |
|--------|-------------|
| `<input.pdf>` | Path to PDF file (required, positional arg) |
| `--input <path>` | Alternative way to specify input PDF |
| `--output <path>` | Output path or directory for PNG (default: same dir as input, .pdf → .png) |

**Requirements:** Requires `pdftoppm` from poppler (macOS: `brew install poppler`)

### Global Options

```bash
annas-download --config /path/to/config.json search --title "Book"
annas-download --output ./my-downloads download --md5 abc123
annas-download --json search --title "Book"
annas-download --help
annas-download --version
```

## Error Handling

| Error | Meaning | Solution |
|-------|---------|----------|
| `CAPTCHA_DETECTED` | CAPTCHA challenge triggered | Visit search URL in browser, solve CAPTCHA, update `cookies.json` |
| `NO_DOWNLOADS_LEFT` | Account has no downloads remaining | Use a different account |
| `RATE_LIMITED` | Too many requests | Tool waits 60 seconds automatically |
| 502 Bad Gateway | Rate limit too aggressive | Increase `rateLimitMs` to 10000 or higher (default is 10s) |

## Typical Workflow

1. **First, search to see available editions:**
   ```bash
   annas-download search --title "Book Name" --author "Author" --format pdf
   ```

2. **Review results** - Note the MD5 of desired edition

3. **Download either interactively or by MD5:**
   ```bash
   # Interactive
   annas-download download --title "Book Name" --format pdf

   # Direct by MD5
   annas-download download --md5 <the-md5-hash>
   ```

4. **Files are saved to** `downloadDir` (default: `./downloads`)

## Notes

- The tool auto-detects actual file format from download header (may differ from search result)
- Downloaded files are named: `{ChineseTitle} - {EnglishTitle}.{extension}`
- For Chinese books, set `--lang zh` to use Chinese title for search
- The tool retries on timeout (up to `maxRetries` in config)
- When traditional title matching fails, the tool can use OpenAI LLM to find the best match (requires `openai.apiKey` in config)
- EPUB files are automatically converted to PDF after download if `openai` is configured
# npm README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@zheyao/annas-book-downloader` to npm with an English README and bundled Claude Code skill.

**Architecture:** Update package.json metadata, replace Chinese README with English version, archive Chinese README, update SKILL.md to reference new package name.

**Tech Stack:** npm, TypeScript

---

## File Map

| File | Action |
|------|--------|
| `package.json` | Modify — name, files, description, keywords, author, repository |
| `README.md` | Replace — English README |
| `docs/README-zh.md` | Create — archive of existing Chinese README |
| `assets/skills/anna-downloader/SKILL.md` | Modify — update CLI command references if needed |

---

## Tasks

### Task 1: Update package.json for npm publish

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package.json fields**

Replace the entire `package.json` content with:

```json
{
  "name": "@zheyao/annas-book-downloader",
  "version": "1.0.0",
  "type": "module",
  "description": "CLI tool to search and download books from Anna's Archive",
  "bin": {
    "annas-download": "./bin/annas-download.js"
  },
  "files": [
    "bin",
    "dist",
    "assets"
  ],
  "scripts": {
    "start": "tsx commands/batch.ts",
    "clean": "node -e \"const fs=require('fs'); fs.rmSync('dist',{recursive:true,force:true})\"",
    "build": "npm run clean && tsc",
    "build:watch": "tsc --watch",
    "dev": "tsx commands/cli.ts",
    "link": "npm run build && npm link"
  },
  "keywords": [
    "annas-archive",
    "books",
    "downloader",
    "ebook",
    "cli"
  ],
  "author": "zheyao",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/zheyao/annas-book-downloader"
  },
  "dependencies": {
    "axios": "^1.13.6",
    "cheerio": "^1.2.0",
    "execa": "^9.6.1",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: Verify package.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json'))"`
Expected: No output (parses successfully)

- [ ] **Step 3: Commit**

```bash
git add package.json && git commit -m "chore: update package.json for npm publish"
```

---

### Task 2: Archive existing Chinese README

**Files:**
- Create: `docs/README-zh.md`
- Modify: `README.md` (to be replaced in next task)

- [ ] **Step 1: Copy existing README to docs/README-zh.md**

Run: `cp /Users/yuyuxin/code/annasBook/README.md /Users/yuyuxin/code/annasBook/docs/README-zh.md`

- [ ] **Step 2: Commit the archive**

```bash
git add docs/README-zh.md && git commit -m "docs: archive Chinese README"
```

---

### Task 3: Write new English README.md

**Files:**
- Replace: `README.md`

- [ ] **Step 1: Write new English README**

Replace `/Users/yuyuxin/code/annasBook/README.md` with the following content:

```markdown
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
npm install -g @zheyao/annas-book-downloader
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
```

- [ ] **Step 2: Verify README was written correctly**

Run: `head -20 /Users/yuyuxin/code/annasBook/README.md`
Expected: First 20 lines of the new English README

- [ ] **Step 3: Commit**

```bash
git add README.md && git commit -m "docs: replace with English README for npm publish"
```

---

### Task 4: Update SKILL.md references (if needed)

**Files:**
- Modify: `assets/skills/anna-downloader/SKILL.md`

- [ ] **Step 1: Check if SKILL.md references the old package name**

The SKILL.md uses `annas-download` which is the CLI bin name (unchanged). Verify this by running:

Run: `grep -n "annas-book-downloader\|annas_book" /Users/yuyuxin/code/annasBook/assets/skills/anna-downloader/SKILL.md`
Expected: No output (SKILL.md only references `annas-download` bin command, not package name)

- [ ] **Step 2: Commit (if changes made)**

```bash
git add assets/skills/anna-downloader/SKILL.md && git commit -m "chore: update skill for npm package"
```

**If no changes needed, skip commit for this task.**

---

### Task 5: Verify npm package structure

- [ ] **Step 1: Build the package**

Run: `npm run build`
Expected: Clean build with no errors

- [ ] **Step 2: Verify files field includes assets**

Run: `node -e "const p=JSON.parse(require('fs').readFileSync('package.json')); console.log(p.files)"`
Expected: `["bin", "dist", "assets"]`

- [ ] **Step 3: Verify skill files are in assets/skills**

Run: `find /Users/yuyuxin/code/annasBook/assets/skills -type f`
Expected:
```
assets/skills/anna-downloader/SKILL.md
assets/skills/anna-downloader/evals/evals.json
```

- [ ] **Step 4: Verify dist is populated**

Run: `ls /Users/yuyuxin/code/annasBook/dist/`
Expected: `commands/` and `src/` directories

---

## Spec Coverage Check

- [x] Package name `@zheyao/annas-book-downloader` → Task 1
- [x] English README with all 8 sections → Task 3
- [x] package.json files includes assets → Task 1, Task 5
- [x] Skill installation section → Task 3 (Quick Start)
- [x] Chinese README archived → Task 2
- [x] package.json keywords, author, repository → Task 1

## Placeholder Scan

No TBD/TODO placeholders found. All code is concrete.

# Anna's Archive Book Downloader Skill Design

## Overview

A Claude Code skill that enables intelligent book search and batch download from Anna's Archive. The skill provides seamless integration with the annasBook tool, supporting both single-book CLI search and Excel-based batch download modes.

## Skill Metadata

- **Name**: `annas-archive-downloader`
- **Version**: 1.0.0
- **Trigger**: User requests to search/download books, mentions ebooks, PDF, EPUB, or provides book titles with search/download intent

## Activation Conditions

The skill activates when the user:
- Asks to search for a book: "帮我搜索《三体》", "find a book titled..."
- Mentions ebook formats: "找一本 PDF", "download EPUB"
- Requests batch download: "下载 Excel 里的书", "批量下载书单"
- Provides a book list for download

## Prerequisites

### Required Configuration Files

1. **config.json** (required)
   - `apiKey`: Anna's Archive API key
   - `baseUrl`: Mirror URL (e.g., `https://annas-archive.gl`)
   - `downloadDir`: Download destination directory
   - Optional: `proxy`, `openai` settings

2. **cookies.json** (required for download operations)
   - Anna's Archive session cookies for authenticated access
   - Format: string, array of `{name, value}`, or key-value object

### Configuration Check Flow

```
User invokes skill
    ↓
Check config.json exists?
    ├─ No → Prompt user to create, provide template
    └─ Yes → Validate required fields
         ↓
Check cookies.json exists?
    ├─ No → Warn: cookies required for download
    └─ Yes → Proceed
```

## Usage Modes

### Mode 1: Single Book Search (CLI)

**Trigger**: User specifies a book title or author

**Command**:
```bash
npm run search -- --title "<title>" [--author "<author>"] [--format pdf|epub] [--lang en|zh]
```

**Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| `--title` | Yes* | Book title keywords |
| `--author` | Yes* | Author name |
| `--format` | No | Filter: `pdf` or `epub` (default: both) |
| `--lang` | No | Language: `en` or `zh` (default: en) |

*At least one of `--title` or `--author` required

**Output**:
- Up to 5 search results
- Each result includes: title, author, format, size, language, year, MD5
- MD5 list for reference

**Example Interaction**:
```
User: 帮我搜索《The Great Gatsby》
Claude: [Invokes skill, runs search]
        [Displays results with title, author, format, size, MD5]
```

### Mode 2: Batch Download (Excel)

**Trigger**: User requests batch download from Excel file

**Command**:
```bash
npm start
```

**Requirements**:
- Excel file path configured in `config.json` (`excelFile` field)
- Excel format with columns: 语言, 书名, Book title, 作者, Author, 下载状态

**Flow**:
1. Read book list from Excel
2. For each pending book:
   - Search Anna's Archive
   - Select best match (title/author/language matching)
   - Download via fast_download API
   - Update status in Excel
3. Handle errors: CAPTCHA, rate limit, no downloads left

**Example Interaction**:
```
User: 下载 Excel 里的书
Claude: [Invokes skill]
        [Checks config.json has excelFile configured]
        [Runs npm start]
        [Reports progress: X downloaded, Y failed, Z skipped]
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `CAPTCHA_DETECTED` | CAPTCHA challenge triggered | Prompt user to visit URL, solve CAPTCHA, update cookies.json |
| `NO_DOWNLOADS_LEFT` | Account download quota exhausted | Alert user, stop processing |
| `CONSECUTIVE_FAILURES` | 5+ download failures | Suggest checking network/proxy/cookies |
| `RATE_LIMITED` | Request rate limit | Wait 60 seconds, retry |
| Config missing | Required files not found | Guide user through creation |

## Skill File Structure

```
skills/
└── annas-archive-downloader/
    ├── SKILL.md                    # Main skill definition
    └── references/
        └── config-template.json    # Configuration template
```

## SKILL.md Content Outline

```markdown
---
name: annas-archive-downloader
description: Use when user asks to search for books, download ebooks,
  mentions PDF/EPUB formats, or requests batch book download.
version: 1.0.0
---

# Anna's Archive Book Downloader

## Purpose
Search and download books from Anna's Archive.

## Before Using
1. Navigate to the annasBook project directory
2. Verify config.json exists and is valid
3. Verify cookies.json exists (for downloads)

## Usage

### Single Book Search
Run: `npm run search -- --title "<title>" [options]`

### Batch Download
Run: `npm start`

## Common Errors
- CAPTCHA_DETECTED: Update cookies after solving CAPTCHA
- NO_DOWNLOADS_LEFT: Account quota exhausted
- Config errors: Check config.json format
```

## Implementation Notes

### Intent Recognition

The skill should infer user intent:
- Single title/author mentioned → CLI search mode
- Excel/batch/list mentioned → Excel download mode
- User provides MD5 directly → Skip search, go to download

### Path Handling

The skill needs to know the annasBook project path. Options:
1. Hardcode expected path in skill
2. Use environment variable `ANNAS_BOOK_PATH`
3. Search common locations

Recommended: Use environment variable with fallback to `~/code/annasBook`

### Non-Interactive Mode

For Claude Code integration, commands should run non-interactively. The current implementation already supports this:
- Search mode outputs results and exits
- Excel mode processes automatically without prompts

## Success Criteria

1. User can search for books using natural language
2. Skill automatically validates configuration before execution
3. Errors are clearly explained with actionable guidance
4. Batch mode processes Excel files and reports status
5. Downloaded files are correctly named and validated

## Future Enhancements (Out of Scope)

- Direct download by MD5 (CLI)
- Download status queries
- Configuration update commands
- Multi-language result formatting
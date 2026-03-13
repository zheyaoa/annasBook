# CLI Search Feature Design

**Date:** 2026-03-13

## Overview

Add a search-only CLI mode that queries Anna's Archive and displays top 5 results for user review. No automatic download.

## CLI Interface

```bash
npm run search -- --title "Book Title" --author "Author" --format pdf --lang en
```

### Flags

| Flag | Required | Values | Default | Description |
|------|----------|--------|---------|-------------|
| `--title` | No* | any string | - | Book title keywords |
| `--author` | No* | any string | - | Author name |
| `--format` | No | `pdf`, `epub` | both | Filter by format |
| `--lang` | No | `en`, `zh` | `en` | Language preference |

*At least one of `--title` or `--author` is required.

### Examples

```bash
# Search by title
npm run search -- --title "The Great Gatsby"

# Search by title and author
npm run search -- --title "1984" --author "Orwell"

# Filter by format
npm run search -- --title "Dune" --format epub

# Chinese title search
npm run search -- --title "三体" --lang zh
```

## Output Format

### Results Section (Detailed Cards)

Display up to 5 results in card format:

```
=== Result 1 ===
Title: Book Title Here
Author: Author Name
Format: PDF
Size: 15.2MB
Language: English [en]
Year: 2020
MD5: abc123def456789...

=== Result 2 ===
Title: Another Book
Author: Another Author
Format: EPUB
Size: 8.1MB
Language: Chinese [zh]
Year: 2019
MD5: def456ghi789abc...
```

### Copy-Friendly Section (MD5 Only)

After all results, display a clean MD5 list:

```
--- MD5 List ---
abc123def456789...
def456ghi789abc...
xyz789qwe456rty...
```

## Architecture

### New File: `src/cli-search.ts`

Entry point for search mode:
- Parse CLI arguments (`--title`, `--author`, `--format`, `--lang`)
- Validate at least one search term provided
- Load config with `skipExcelCheck: true`
- Build search query from flags
- Call `Searcher.search()` with constructed query
- Format results and display to console
- Exit with appropriate code (0 = success, 1 = no results/error)

### Modified File: `package.json`

Add new script:
```json
{
  "scripts": {
    "start": "tsx src/index.ts",
    "search": "tsx src/cli-search.ts",
    "build": "tsc"
  }
}
```

### Reused Components

No changes required to:
- `Searcher` class - existing `search()` method works for this use case
- `HttpClient` class - handles HTTP requests and CAPTCHA detection
- `Config` loading - already supports `skipExcelCheck` option
- `types.ts` - `SearchResult` interface already has all needed fields

### Error Handling

| Error | Behavior |
|-------|----------|
| No search terms | Print usage message, exit 1 |
| CAPTCHA detected | Print URL for manual solve, exit 1 |
| No results found | Print "No results found", exit 0 |
| Network error | Print error message, exit 1 |

## Search Query Construction

The `Searcher` class builds the Anna's Archive URL:
```
{baseUrl}/search?index=&page=1&sort=&ext={format}&display=&q={query}
```

Query string construction:
- If `--title` provided: include title in query
- If `--author` provided: append author to query (e.g., "title author")
- If `--format` specified: set `ext` param; otherwise include both `ext=pdf&ext=epub`

## Limitations

- Fixed limit of 5 results (no pagination support)
- No interactive result selection
- No download capability in this mode
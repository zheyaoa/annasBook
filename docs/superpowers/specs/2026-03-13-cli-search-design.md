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

### New Directory: `scripts/`

Create a `scripts/` directory for CLI entry points, separate from core library code in `src/`.

**Note:** Scripts in `scripts/` are run directly via `tsx` (not compiled via `tsc`). The `tsconfig.json` has `rootDir: "./src"`, so `scripts/` is intentionally outside the build output.

### New File: `scripts/cli-search.ts`

Entry point for search mode:
- Parse CLI arguments (`--title`, `--author`, `--format`, `--lang`)
- Validate at least one search term provided
- Load config with `skipExcelCheck: true`
- Build search query from flags
- Call `Searcher.searchByQuery()` with query string and format filter
- Format results and display to console
- Exit with appropriate code (0 = success, 1 = no results/error)

### Modified File: `src/searcher.ts`

Add new method `searchByQuery()`:
```typescript
async searchByQuery(
  query: string,
  format?: 'pdf' | 'epub'
): Promise<SearchResult[]>
```

- `query`: Direct search string (can include title, author, or both)
- `format`: Optional format filter; if omitted, searches both PDF and EPUB

This method is separate from `search(book: BookInfo)` to keep the existing Excel batch mode interface intact. Both methods share `parseSearchResults()` for HTML parsing.

### Modified File: `package.json`

Add new script:
```json
{
  "scripts": {
    "start": "tsx src/index.ts",
    "search": "tsx scripts/cli-search.ts",
    "build": "tsc"
  }
}
```

### Reused Components

No changes required to:
- `HttpClient` class - handles HTTP requests and CAPTCHA detection
- `Config` loading - already supports `skipExcelCheck` option
- `types.ts` - `SearchResult` interface already has all needed fields

### Error Handling

| Error | Behavior |
|-------|----------|
| No search terms | Print usage message, exit 1 |
| Invalid `--format` value | Print error "Invalid format. Use 'pdf' or 'epub'", exit 1 |
| Invalid `--lang` value | Print error "Invalid lang. Use 'en' or 'zh'", exit 1 |
| CAPTCHA detected | Print URL for manual solve, exit 1 |
| No results found | Print "No results found", exit 0 |
| Network error | Print error message, exit 1 |

## Search Query Construction

The CLI script builds the query string:
- Combine `--title` and `--author` into a single search query
- Example: `--title "1984" --author "Orwell"` → query = `"1984 Orwell"`

The `Searcher.searchByQuery()` method builds the Anna's Archive URL:
```
{baseUrl}/search?index=&page=1&sort=&ext={format}&display=&q={query}
```

Format parameter:
- If `--format pdf`: URL includes only `ext=pdf`
- If `--format epub`: URL includes only `ext=epub`
- If no format specified: URL includes `ext=pdf&ext=epub` (both)

**Note:** The `--lang` flag is not used in the search query. It's reserved for future use or UI purposes. Anna's Archive returns results based on the query string alone.

## Limitations

- Fixed limit of 5 results (no pagination support)
- No interactive result selection
- No download capability in this mode
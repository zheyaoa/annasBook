# CLI Search Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search-only CLI mode that queries Anna's Archive and displays top 5 results with MD5 hashes.

**Architecture:** Add `searchByQuery()` method to existing `Searcher` class, create new `scripts/cli-search.ts` entry point, and update `package.json` with new npm script.

**Tech Stack:** TypeScript, tsx runtime, axios, cheerio

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/searcher.ts` | Modify | Add `searchByQuery()` method |
| `scripts/cli-search.ts` | Create | CLI entry point for search mode |
| `package.json` | Modify | Add `search` script |

---

## Chunk 1: Add searchByQuery Method to Searcher

### Task 1: Add searchByQuery Method

**Files:**
- Modify: `src/searcher.ts:60-92` (after existing `search()` method)

- [ ] **Step 1: Add the searchByQuery method**

Add this method to the `Searcher` class after the existing `search()` method (around line 92):

```typescript
  async searchByQuery(
    query: string,
    format?: 'pdf' | 'epub'
  ): Promise<SearchResult[]> {
    if (!query || !query.trim()) {
      logger.warn('Empty search query provided');
      return [];
    }

    const encodedQuery = encodeURIComponent(query.trim());

    // Build format parameter
    let extParam: string;
    if (format === 'pdf') {
      extParam = 'ext=pdf';
    } else if (format === 'epub') {
      extParam = 'ext=epub';
    } else {
      extParam = 'ext=pdf&ext=epub';
    }

    const url = `${this.config.baseUrl}/search?index=&page=1&sort=&${extParam}&display=&q=${encodedQuery}`;

    logger.info(`Searching for: ${query}`);

    try {
      const { status, body } = await this.httpClient.get(url);

      // Check for CAPTCHA
      if (this.httpClient.isCaptchaResponse(body, status)) {
        return this.handleCaptcha(url);
      }

      return this.parseSearchResults(body, query);
    } catch (error) {
      logger.error(`Search failed for "${query}": ${(error as Error).message}`);
      return [];
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/searcher.ts
git commit -m "feat(searcher): add searchByQuery method for direct query search"
```

---

## Chunk 2: Create CLI Search Script

### Task 2: Create scripts/cli-search.ts

**Files:**
- Create: `scripts/cli-search.ts`

- [ ] **Step 1: Create the scripts directory and CLI script**

Create `scripts/cli-search.ts`:

```typescript
import { loadConfig, validateConfig } from '../src/config.js';
import { HttpClient } from '../src/http-client.js';
import { Searcher } from '../src/searcher.js';
import { logger } from '../src/logger.js';

interface SearchArgs {
  title?: string;
  author?: string;
  format?: 'pdf' | 'epub';
  lang?: 'en' | 'zh';
}

function parseArgs(): SearchArgs {
  const args = process.argv.slice(2);
  const result: SearchArgs = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      result.title = args[i + 1];
      i++;
    } else if (args[i] === '--author' && args[i + 1]) {
      result.author = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      const format = args[i + 1].toLowerCase();
      if (format !== 'pdf' && format !== 'epub') {
        console.error("Invalid format. Use 'pdf' or 'epub'");
        process.exit(1);
      }
      result.format = format;
      i++;
    } else if (args[i] === '--lang' && args[i + 1]) {
      const lang = args[i + 1].toLowerCase();
      if (lang !== 'en' && lang !== 'zh') {
        console.error("Invalid lang. Use 'en' or 'zh'");
        process.exit(1);
      }
      result.lang = lang;
      i++;
    }
  }

  return result;
}

function buildQuery(args: SearchArgs): string {
  const parts: string[] = [];
  if (args.title) parts.push(args.title);
  if (args.author) parts.push(args.author);
  return parts.join(' ');
}

function formatResults(results: ReturnType<typeof limitResults>): void {
  if (results.length === 0) {
    console.log('No results found');
    return;
  }

  // Display detailed cards
  results.forEach((result, index) => {
    console.log(`\n=== Result ${index + 1} ===`);
    console.log(`Title: ${result.title}`);
    console.log(`Author: ${result.author || 'Unknown'}`);
    console.log(`Format: ${result.format.toUpperCase()}`);
    console.log(`Size: ${result.size || 'Unknown'}`);
    console.log(`Language: ${result.language || 'Unknown'}`);
    console.log(`Year: ${result.year || 'Unknown'}`);
    console.log(`MD5: ${result.md5}`);
  });

  // Display MD5 list
  console.log('\n--- MD5 List ---');
  results.forEach(result => {
    console.log(result.md5);
  });
}

function limitResults(results: Awaited<ReturnType<Searcher['searchByQuery']>>): Awaited<ReturnType<Searcher['searchByQuery']>> {
  return results.slice(0, 5);
}

function printUsage(): void {
  console.log(`
Usage: npm run search -- [options]

Options:
  --title <string>   Book title keywords
  --author <string>  Author name
  --format <format>  Filter by format: pdf or epub (default: both)
  --lang <lang>      Language preference: en or zh (default: en)

At least one of --title or --author is required.

Examples:
  npm run search -- --title "The Great Gatsby"
  npm run search -- --title "1984" --author "Orwell"
  npm run search -- --title "Dune" --format epub
`);
}

async function main(): Promise<void> {
  const args = parseArgs();

  // Validate at least one search term
  if (!args.title && !args.author) {
    console.error('Error: At least one of --title or --author is required\n');
    printUsage();
    process.exit(1);
  }

  // Load config
  const config = loadConfig('./config.json', { skipExcelCheck: true });
  validateConfig(config, { skipExcelCheck: true });

  // Initialize components
  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);

  // Build query
  const query = buildQuery(args);

  try {
    const results = await searcher.searchByQuery(query, args.format);
    const limitedResults = limitResults(results);
    formatResults(limitedResults);

    // Exit with appropriate code
    process.exit(results.length > 0 ? 0 : 0); // Exit 0 even for no results
  } catch (error) {
    const errorMsg = (error as Error).message;

    if (errorMsg === 'CAPTCHA_DETECTED') {
      console.error('\nCAPTCHA detected. Please visit the search URL in a browser, solve it, and update cookies.json.');
      process.exit(1);
    }

    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/cli-search.ts
git commit -m "feat: add CLI search script with detailed output"
```

---

## Chunk 3: Update package.json

### Task 3: Add search script to package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add search script**

Add the `search` script to `package.json` scripts section:

```json
{
  "scripts": {
    "start": "tsx src/index.ts",
    "search": "tsx scripts/cli-search.ts",
    "build": "tsc"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "feat: add 'npm run search' script"
```

---

## Chunk 4: Manual Testing

### Task 4: Test the search feature

**Files:**
- N/A (manual testing)

- [ ] **Step 1: Test basic search**

Run:
```bash
npm run search -- --title "The Great Gatsby"
```

Expected: Up to 5 results displayed in card format with MD5 list at the end.

- [ ] **Step 2: Test search with author**

Run:
```bash
npm run search -- --title "1984" --author "Orwell"
```

Expected: Results include books matching both title and author.

- [ ] **Step 3: Test format filter**

Run:
```bash
npm run search -- --title "Dune" --format epub
```

Expected: All results are EPUB format only.

- [ ] **Step 4: Test error handling - no arguments**

Run:
```bash
npm run search
```

Expected: Usage message printed, exit code 1.

- [ ] **Step 5: Test error handling - invalid format**

Run:
```bash
npm run search -- --title "test" --format docx
```

Expected: Error message "Invalid format. Use 'pdf' or 'epub'", exit code 1.

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `src/searcher.ts` | Add `searchByQuery()` method |
| 2 | `scripts/cli-search.ts` | Create CLI entry point |
| 3 | `package.json` | Add `search` script |
| 4 | N/A | Manual testing |
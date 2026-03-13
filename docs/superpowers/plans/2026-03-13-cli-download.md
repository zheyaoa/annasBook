# CLI Download Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add command line mode to download a single book by title and optional author.

**Architecture:** Extend existing `index.ts` to detect CLI arguments and route to a new `runCliMode()` function. Modify `config.ts` to skip Excel validation in CLI mode. Reuse existing Searcher and Downloader components.

**Tech Stack:** Node.js, TypeScript, tsx

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/config.ts` | Modify | Add `skipExcelCheck` option |
| `src/index.ts` | Modify | Add CLI parsing and `runCliMode()` |

---

## Chunk 1: Config Changes

### Task 1: Modify config.ts for CLI mode

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Add `skipExcelCheck` parameter to `loadConfig()`**

Change line 17-46 from:

```typescript
export function loadConfig(configPath: string = './config.json'): Config {
```

to:

```typescript
export function loadConfig(configPath: string = './config.json', options?: { skipExcelCheck?: boolean }): Config {
```

- [ ] **Step 2: Make excelFile validation conditional**

Change lines 37-40 from:

```typescript
    if (!config.excelFile) {
      console.error('Error: excelFile is required in config.json');
      process.exit(1);
    }
```

to:

```typescript
    if (!config.excelFile && !options?.skipExcelCheck) {
      console.error('Error: excelFile is required in config.json');
      process.exit(1);
    }
```

- [ ] **Step 3: Make validateConfig Excel check conditional**

Change lines 49-54 from:

```typescript
export function validateConfig(config: Config): void {
  // Check Excel file exists
  if (!fs.existsSync(config.excelFile)) {
    console.error(`Error: Excel file not found at ${config.excelFile}`);
    process.exit(1);
  }
```

to:

```typescript
export function validateConfig(config: Config, options?: { skipExcelCheck?: boolean }): void {
  // Check Excel file exists (skip in CLI mode)
  if (!options?.skipExcelCheck && config.excelFile) {
    if (!fs.existsSync(config.excelFile)) {
      console.error(`Error: Excel file not found at ${config.excelFile}`);
      process.exit(1);
    }
  }
```

- [ ] **Step 4: Commit config changes**

```bash
git add src/config.ts
git commit -m "feat(config): add skipExcelCheck option for CLI mode"
```

---

## Chunk 2: CLI Implementation

### Task 2: Add CLI argument parsing and mode to index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add CLI argument interface and parser after imports (after line 9)**

```typescript
interface CliArgs {
  title: string;
  author?: string;
}

function parseCliArgs(): CliArgs | null {
  const args = process.argv.slice(2);
  const result: CliArgs = { title: '' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      result.title = args[i + 1];
      i++;
    } else if (args[i] === '--author' && args[i + 1]) {
      result.author = args[i + 1];
      i++;
    }
  }

  return result.title ? result : null;
}
```

- [ ] **Step 2: Add `runCliMode()` function before `main()` (before line 51)**

```typescript
async function runCliMode(cliArgs: CliArgs): Promise<void> {
  logger.info('Starting CLI download mode');

  // Load config without Excel requirement
  const config = loadConfig('./config.json', { skipExcelCheck: true });
  validateConfig(config, { skipExcelCheck: true });

  // Initialize components
  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);
  const downloader = new Downloader(config, httpClient);

  // Build BookInfo from CLI args
  const book: BookInfo = {
    rowIndex: 0,
    language: 'en',
    chineseTitle: '',
    englishTitle: cliArgs.title,
    chineseAuthor: '',
    englishAuthor: cliArgs.author || '',
    confidence: '',
    downloadStatus: '',
    bookLink: '',
  };

  try {
    // Search
    const results = await searcher.search(book);

    if (results.length === 0) {
      logger.error('Book not found');
      process.exit(1);
    }

    logger.info(`Found ${results.length} results`);

    // Select best match
    const bestMatch = searcher.selectBestResult(results, cliArgs.title);

    if (!bestMatch) {
      logger.error('No suitable match found');
      process.exit(1);
    }

    logger.info(`Best match: ${bestMatch.title} (${bestMatch.format}, ${bestMatch.size || 'unknown size'})`);

    // Download
    const downloadResult = await downloader.download(book, bestMatch);

    if (downloadResult.success) {
      logger.info(`Downloaded to: ${downloadResult.filePath}`);
    } else {
      logger.error(`Download failed: ${downloadResult.error}`);
      process.exit(1);
    }

  } catch (error) {
    const errorMsg = (error as Error).message;

    if (errorMsg === 'CAPTCHA_DETECTED') {
      logger.error('CAPTCHA detected. Please use Excel mode with interactive CAPTCHA handling.');
      process.exit(1);
    }

    logger.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Add CLI mode detection at start of `main()`**

Change line 51-56 from:

```typescript
async function main(): Promise<void> {
  logger.info('Starting Anna\'s Archive Book Downloader');

  // Load and validate config
  const config = loadConfig();
  validateConfig(config);
```

to:

```typescript
async function main(): Promise<void> {
  // Check for CLI mode
  const cliArgs = parseCliArgs();
  if (cliArgs) {
    await runCliMode(cliArgs);
    return;
  }

  logger.info('Starting Anna\'s Archive Book Downloader');

  // Load and validate config
  const config = loadConfig();
  validateConfig(config);
```

- [ ] **Step 4: Commit CLI changes**

```bash
git add src/index.ts
git commit -m "feat: add CLI download mode with --title and --author args"
```

---

## Chunk 3: Verification

### Task 3: Test CLI mode

- [ ] **Step 1: Test CLI help output (should show error for missing title)**

Run: `npx tsx src/index.ts`
Expected: Program starts in Excel mode (existing behavior)

- [ ] **Step 2: Test CLI download with valid book**

Run: `npx tsx src/index.ts --title "Trying Not to Try" --author "Edward Slingerland"`
Expected:
- Logs "Starting CLI download mode"
- Searches for the book
- Shows best match
- Downloads successfully

- [ ] **Step 3: Test CLI with non-existent book**

Run: `npx tsx src/index.ts --title "This Book Does Not Exist 12345"`
Expected:
- Logs "Book not found" or "No suitable match found"
- Exits with code 1

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete CLI download feature"
```
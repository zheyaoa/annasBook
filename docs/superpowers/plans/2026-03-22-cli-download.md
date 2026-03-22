# CLI Download 功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增命令行下载功能，支持 MD5 直接下载和搜索后交互式选择下载两种模式。

**Architecture:** 扩展 `Searcher` 类添加 `fetchBookDetailsExtended` 方法，修改 `cli-search.ts` 导出可复用函数，新建 `cli-download.ts` 实现下载逻辑。

**Tech Stack:** TypeScript, tsx, cheerio, axios

---

## 文件结构

```
src/
├── searcher.ts          # 修改：新增 fetchBookDetailsExtended
├── types.ts             # 修改：新增 BookDetailsExtended 接口
scripts/
├── cli-search.ts        # 修改：导出函数供复用
└── cli-download.ts      # 新建：下载脚本
```

---

### Task 1: 扩展类型定义

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: 添加 BookDetailsExtended 接口**

在 `src/types.ts` 末尾添加：

```typescript
export interface BookDetailsExtended {
  title: string;
  author: string;
  format: 'pdf' | 'epub';
  year: string;
  publisher: string;
  language: string;
  size: string;
}
```

- [ ] **Step 2: 验证编译通过**

Run: `npm run build`
Expected: 无错误

---

### Task 2: 新增 fetchBookDetailsExtended 方法

**Files:**
- Modify: `src/searcher.ts`

- [ ] **Step 1: 导入新类型**

在 `src/searcher.ts` 顶部导入语句中添加 `BookDetailsExtended`：

```typescript
import { Config, BookInfo, SearchResult, BookDetailsExtended } from './types.js';
```

- [ ] **Step 2: 添加 fetchBookDetailsExtended 方法**

在 `Searcher` 类中，`fetchBookDetails` 方法后添加新方法：

```typescript
  async fetchBookDetailsExtended(md5: string): Promise<BookDetailsExtended> {
    const url = `${this.config.baseUrl}/md5/${md5}`;
    try {
      const { body } = await this.httpClient.get(url);
      const $ = cheerio.load(body);

      let title = '';
      let author = '';
      let format: 'pdf' | 'epub' = 'pdf';
      let year = '';
      let publisher = '';
      let language = '';
      let size = '';

      // Extract title: usually in the first h1 or a specific element
      const titleElement = $('h1').first();
      if (titleElement.length) {
        title = titleElement.text().trim();
      }

      // Extract author: look for link with author search
      const authorLink = $('a.line-clamp-\\[2\\][href*="search?q="]').first();
      if (authorLink.length) {
        author = authorLink.text().trim();
      }

      // Extract format: look for PDF/EPUB in the page
      const bodyText = $('body').text();
      if (bodyText.includes('EPUB')) {
        format = 'epub';
      } else if (bodyText.includes('PDF')) {
        format = 'pdf';
      }

      // Extract year
      let foundYear = false;
      $('*').each((_, el) => {
        if (foundYear) return;
        if ($(el).children().length === 0) {
          const text = $(el).text().trim();
          if (text === 'Year') {
            const next = $(el).next();
            if (next.length) {
              year = next.text().trim();
              foundYear = true;
            }
          }
        }
      });

      // Extract language
      $('*').each((_, el) => {
        if (language) return;
        if ($(el).children().length === 0) {
          const text = $(el).text().trim();
          if (text === 'Language') {
            const next = $(el).next();
            if (next.length) {
              language = next.text().trim();
            }
          }
        }
      });

      // Extract size: look for file size pattern
      const sizeMatch = bodyText.match(/([\d.]+\s*(?:KB|MB|GB))/i);
      if (sizeMatch) {
        size = sizeMatch[1];
      }

      // Extract publisher (reuse existing logic)
      if (authorLink.length) {
        const parent = authorLink.parent();
        const parentText = parent.text();
        const lines = parentText.split('\n');
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line === author) {
            const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
            if (nextLine && nextLine.includes(',') && nextLine.length > 10 &&
                !nextLine.includes('http') && !nextLine.includes('function')) {
              const parts = nextLine.split(',');
              const possiblePublisher = parts[0].trim();
              if (possiblePublisher.length > 3 && possiblePublisher.length < 60) {
                publisher = possiblePublisher;
                break;
              }
            }
          }
        }
      }

      return { title, author, format, year, publisher, language, size };
    } catch (error) {
      logger.warn(`Failed to fetch extended book details for ${md5}: ${(error as Error).message}`);
      return { title: '', author: '', format: 'pdf', year: '', publisher: '', language: '', size: '' };
    }
  }
```

- [ ] **Step 3: 验证编译通过**

Run: `npm run build`
Expected: 无错误

---

### Task 3: 导出 cli-search.ts 函数

**Files:**
- Modify: `scripts/cli-search.ts`

- [ ] **Step 1: 导出 SearchArgs 接口**

将 `SearchArgs` 接口定义移到文件顶部并添加 `export`：

```typescript
export interface SearchArgs {
  title?: string;
  author?: string;
  format?: 'pdf' | 'epub';
  lang?: 'en' | 'zh';
}
```

- [ ] **Step 2: 导出 parseArgs 函数**

在 `parseArgs` 函数前添加 `export`：

```typescript
export function parseArgs(): SearchArgs {
```

- [ ] **Step 3: 导出 buildQuery 函数**

在 `buildQuery` 函数前添加 `export`：

```typescript
export function buildQuery(args: SearchArgs): string {
```

- [ ] **Step 4: 导出 limitResults 函数**

在 `limitResults` 函数前添加 `export`：

```typescript
export function limitResults(results: SearchResult[]): SearchResult[] {
```

- [ ] **Step 5: 修改 formatResults 函数并导出**

修改 `formatResults` 函数，使其同时打印和返回结果：

```typescript
export function formatResults(results: SearchResult[]): SearchResult[] {
  if (results.length === 0) {
    console.log('No results found');
    return [];
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

  return results;
}
```

- [ ] **Step 6: 导出 printUsage 函数**

在 `printUsage` 函数前添加 `export`：

```typescript
export function printUsage(): void {
```

- [ ] **Step 7: 验证编译通过**

Run: `npm run build`
Expected: 无错误

---

### Task 4: 创建 cli-download.ts

**Files:**
- Create: `scripts/cli-download.ts`

- [ ] **Step 1: 创建基础框架**

创建 `scripts/cli-download.ts`：

```typescript
import readline from 'readline';
import { loadConfig, validateConfig } from '../src/config.js';
import { HttpClient } from '../src/http-client.js';
import { Searcher } from '../src/searcher.js';
import { Downloader } from '../src/downloader.js';
import { logger } from '../src/logger.js';
import { SearchResult, BookInfo, BookDetailsExtended } from '../src/types.js';
import {
  parseArgs as parseSearchArgs,
  buildQuery,
  limitResults,
  formatResults,
  printUsage,
  SearchArgs
} from './cli-search.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

interface DownloadArgs {
  md5?: string;
  filename?: string;
  title?: string;
  author?: string;
  format?: 'pdf' | 'epub';
  lang?: 'en' | 'zh';
}

function parseDownloadArgs(): DownloadArgs {
  const args = process.argv.slice(2);
  const result: DownloadArgs = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--md5' && args[i + 1]) {
      result.md5 = args[i + 1];
      i++;
    } else if (args[i] === '--filename' && args[i + 1]) {
      result.filename = args[i + 1];
      i++;
    } else if (args[i] === '--title' && args[i + 1]) {
      result.title = args[i + 1];
      i++;
    } else if (args[i] === '--author' && args[i + 1]) {
      result.author = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      const format = args[i + 1].toLowerCase();
      if (format === 'pdf' || format === 'epub') {
        result.format = format;
      }
      i++;
    } else if (args[i] === '--lang' && args[i + 1]) {
      const lang = args[i + 1].toLowerCase();
      if (lang === 'en' || lang === 'zh') {
        result.lang = lang;
      }
      i++;
    }
  }

  return result;
}

function promptUserSelection(results: SearchResult[]): Promise<SearchResult | null> {
  return new Promise((resolve) => {
    console.log('\nEnter the number of the book to download (or "q" to quit):');

    rl.question('> ', (answer) => {
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === 'q' || trimmed === 'quit') {
        resolve(null);
        return;
      }

      const index = parseInt(trimmed) - 1;
      if (isNaN(index) || index < 0 || index >= results.length) {
        console.log('Invalid selection.');
        resolve(null);
        return;
      }

      resolve(results[index]);
    });
  });
}

function buildBookInfo(details: BookDetailsExtended, rowIndex: number = 0): BookInfo {
  return {
    rowIndex,
    language: 'en',
    chineseTitle: '',
    englishTitle: details.title,
    chineseAuthor: '',
    englishAuthor: details.author,
    confidence: '',
    downloadStatus: '',
    bookLink: '',
  };
}

function buildSearchResult(details: BookDetailsExtended, md5: string): SearchResult {
  return {
    md5,
    title: details.title,
    author: details.author,
    format: details.format,
    language: details.language,
    size: details.size,
    sizeBytes: 0,
    year: details.year,
    publisher: details.publisher,
  };
}

async function downloadByMd5(
  md5: string,
  filename: string | undefined,
  searcher: Searcher,
  downloader: Downloader
): Promise<void> {
  console.log(`Fetching book details for MD5: ${md5}...`);

  const details = await searcher.fetchBookDetailsExtended(md5);

  if (!details.title) {
    console.error('Error: Could not fetch book details. Invalid MD5?');
    rl.close();
    process.exit(1);
  }

  console.log(`\nTitle: ${details.title}`);
  console.log(`Author: ${details.author || 'Unknown'}`);
  console.log(`Format: ${details.format.toUpperCase()}`);
  console.log(`Size: ${details.size || 'Unknown'}`);

  const bookInfo = buildBookInfo(details);
  const searchResult = buildSearchResult(details, md5);

  // Override filename if specified
  if (filename) {
    searchResult.title = filename;
  }

  console.log('\nStarting download...');
  const result = await downloader.download(bookInfo, searchResult);

  if (result.success) {
    console.log(`\nDownload successful: ${result.filePath}`);
  } else {
    console.error(`\nDownload failed: ${result.error}`);
    rl.close();
    process.exit(1);
  }
}

async function downloadBySearch(
  args: DownloadArgs,
  searcher: Searcher,
  downloader: Downloader
): Promise<void> {
  const searchArgs: SearchArgs = {
    title: args.title,
    author: args.author,
    format: args.format,
    lang: args.lang,
  };

  const query = buildQuery(searchArgs);

  if (!query) {
    console.error('Error: At least one of --title or --author is required\n');
    printUsage();
    rl.close();
    process.exit(1);
  }

  console.log(`Searching for: ${query}`);

  try {
    const results = await searcher.searchByQuery(query, args.format);
    const limitedResults = limitResults(results);
    formatResults(limitedResults);

    if (limitedResults.length === 0) {
      rl.close();
      process.exit(0);
    }

    const selected = await promptUserSelection(limitedResults);

    if (!selected) {
      console.log('Download cancelled.');
      rl.close();
      process.exit(0);
    }

    console.log(`\nYou selected: ${selected.title}`);
    console.log('Starting download...');

    const bookInfo: BookInfo = {
      rowIndex: 0,
      language: args.lang || 'en',
      chineseTitle: '',
      englishTitle: selected.title,
      chineseAuthor: '',
      englishAuthor: selected.author,
      confidence: '',
      downloadStatus: '',
      bookLink: '',
    };

    // Fetch additional details
    const details = await searcher.fetchBookDetails(selected.md5);
    selected.year = details.year;
    selected.publisher = details.publisher;

    const result = await downloader.download(bookInfo, selected);

    if (result.success) {
      console.log(`\nDownload successful: ${result.filePath}`);
    } else {
      console.error(`\nDownload failed: ${result.error}`);
      rl.close();
      process.exit(1);
    }

  } catch (error) {
    const errorMsg = (error as Error).message;

    if (errorMsg === 'CAPTCHA_DETECTED') {
      console.error('\nCAPTCHA detected. Please visit the search URL in a browser, solve it, and update cookies.json.');
      rl.close();
      process.exit(1);
    }

    console.error(`Error: ${errorMsg}`);
    rl.close();
    process.exit(1);
  }
}

function printDownloadUsage(): void {
  console.log(`
Usage: npm run download -- [options]

Options:
  --md5 <string>       Book MD5 hash (use instead of search)
  --filename <string>  Output filename without extension (MD5 mode only)
  --title <string>     Book title keywords (for search)
  --author <string>    Author name
  --format <format>    Filter by format: pdf or epub
  --lang <lang>        Language preference: en or zh

Either --md5 OR --title is required.

Examples:
  npm run download -- --md5 a1b2c3d4e5f6...
  npm run download -- --md5 a1b2c3d4e5f6... --filename "My Book"
  npm run download -- --title "The Great Gatsby"
  npm run download -- --title "1984" --author "Orwell" --format pdf
`);
}

async function main(): Promise<void> {
  const args = parseDownloadArgs();

  // Validate: need either md5 or title
  if (!args.md5 && !args.title) {
    console.error('Error: Either --md5 or --title is required\n');
    printDownloadUsage();
    process.exit(1);
  }

  // Load config
  const config = loadConfig('./config.json', { skipExcelCheck: true });
  validateConfig(config, { skipExcelCheck: true });

  // Initialize components
  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);
  const downloader = new Downloader(config, httpClient);

  try {
    if (args.md5) {
      await downloadByMd5(args.md5, args.filename, searcher, downloader);
    } else {
      await downloadBySearch(args, searcher, downloader);
    }
  } catch (error) {
    const errorMsg = (error as Error).message;

    if (errorMsg === 'NO_DOWNLOADS_LEFT') {
      console.error('\nError: No downloads left on this account.');
      rl.close();
      process.exit(1);
    }

    console.error(`\nUnexpected error: ${errorMsg}`);
    rl.close();
    process.exit(1);
  }

  rl.close();
}

main();
```

- [ ] **Step 2: 验证编译通过**

Run: `npm run build`
Expected: 无错误

---

### Task 5: 更新 package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 确认 download 脚本已存在**

检查 `package.json` 中 `scripts` 部分是否已有 `download` 脚本。根据现有文件，脚本已定义为 `"download": "tsx scripts/cli-download.ts"`，无需修改。

- [ ] **Step 2: 验证**

Run: `npm run download -- --help`
Expected: 显示使用帮助

---

### Task 6: 手动测试

- [ ] **Step 1: 测试搜索下载模式**

Run: `npm run download -- --title "The Great Gatsby"`
Expected: 显示搜索结果，等待用户选择

- [ ] **Step 2: 测试 MD5 下载模式**

Run: `npm run download -- --md5 <有效的MD5值>`
Expected: 获取书籍信息并开始下载

- [ ] **Step 3: 测试错误处理**

Run: `npm run download` (无参数)
Expected: 显示错误提示和使用帮助

Run: `npm run download -- --md5 invalidmd5`
Expected: 提示无法获取书籍详情
# annas-download CLI 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 annasBook 改造为可全局安装的 CLI 工具 `annas-download`，支持多路径配置查找和环境变量覆盖。

**Architecture:** 重构 config.ts 支持多路径查找和环境变量；重构 cli.ts 为统一的子命令分发器（直接调用，不再 spawn）；创建 bin/annas-download.js 作为 npm bin 入口。

**Tech Stack:** TypeScript, Node.js, npm bin

---

## 文件变更概览

| 文件 | 操作 | 职责 |
|------|------|------|
| `package.json` | 修改 | 添加 bin 字段 |
| `bin/annas-download.js` | 新建 | CLI 入口（shebang + 转发到 dist/cli.js） |
| `src/config.ts` | 重构 | 多路径查找 + 环境变量覆盖 |
| `src/cli.ts` | 重构 | 统一子命令解析，直接调用逻辑 |
| `src/commands/search.ts` | 新建 | search 子命令实现（从 cli-search.ts 提取） |
| `src/commands/download.ts` | 新建 | download 子命令实现（从 cli-download.ts 提取） |
| `src/commands/batch.ts` | 新建 | batch 子命令实现（从 cli-batch.ts 提取） |
| `src/commands/config.ts` | 新建 | config 子命令（init/list/path） |

---

### Task 1: 更新 package.json 添加 bin 字段

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 添加 bin 字段和 files 字段**

```json
{
  "name": "annas-book-downloader",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "annas-download": "./bin/annas-download.js"
  },
  "files": [
    "bin",
    "dist"
  ],
  "scripts": {
    "start": "tsx src/index.ts",
    "build": "tsc",
    "search": "tsx scripts/cli-search.ts",
    "download": "tsx scripts/cli-download.ts",
    "batch": "tsx scripts/cli-batch.ts",
    "cli": "tsx src/cli.ts"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "axios": "^1.13.6",
    "cheerio": "^1.2.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: 验证 package.json 格式正确**

Run: `cat package.json | node -e "JSON.parse(require('fs').readFileSync(0)) && console.log('Valid JSON')"`
Expected: `Valid JSON`

- [ ] **Step 3: 提交**

```bash
git add package.json
git commit -m "feat: add bin field to package.json for global CLI installation"
```

---

### Task 2: 创建 bin/annas-download.js 入口

**Files:**
- Create: `bin/annas-download.js`

- [ ] **Step 1: 创建 bin 目录和入口文件**

```bash
mkdir -p bin
```

- [ ] **Step 2: 编写入口脚本**

```javascript
#!/usr/bin/env node
import('../dist/cli.js');
```

- [ ] **Step 3: 添加执行权限**

Run: `chmod +x bin/annas-download.js`

- [ ] **Step 4: 验证文件创建成功**

Run: `ls -la bin/annas-download.js`
Expected: 文件存在且有执行权限（-rwxr-xr-x）

- [ ] **Step 5: 提交**

```bash
git add bin/annas-download.js
git commit -m "feat: add CLI entry point bin/annas-download.js"
```

---

### Task 3: 重构 src/config.ts 支持多路径查找和环境变量

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: 添加 os 模块导入**

当前文件已有 `fs` 和 `path` 导入，只需添加 `os`：
```typescript
import os from 'os';
```

- [ ] **Step 2: 定义配置查找路径函数**

在 DEFAULT_CONFIG 之前添加：
```typescript
/**
 * Get config file search paths in priority order
 */
function getConfigSearchPaths(): string[] {
  const paths: string[] = [];

  // 1. Environment variable
  if (process.env.ANNASBOOK_CONFIG) {
    paths.push(process.env.ANNASBOOK_CONFIG);
  }

  // 2. User home directory (default)
  paths.push(path.join(os.homedir(), '.annasbook', 'config.json'));

  // 3. Current directory (backward compatibility)
  paths.push('./config.json');

  return paths;
}

/**
 * Find the first existing config file
 */
function findConfigFile(): string | null {
  for (const p of getConfigSearchPaths()) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Apply environment variable overrides to config
 */
function applyEnvOverrides(config: Config): Config {
  return {
    ...config,
    apiKey: process.env.ANNASBOOK_API_KEY || config.apiKey,
    baseUrl: process.env.ANNASBOOK_BASE_URL || config.baseUrl,
    downloadDir: process.env.ANNASBOOK_DOWNLOAD_DIR || config.downloadDir,
    proxy: process.env.ANNASBOOK_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || config.proxy,
  };
}

/**
 * Get human-readable config path descriptions for error messages
 */
function getConfigPathDescriptions(): string[] {
  return getConfigSearchPaths().map((p, i) => {
    const source = i === 0 ? '$ANNASBOOK_CONFIG' :
                   i === 1 ? '~/.annasbook/config.json' :
                   './config.json';
    const exists = fs.existsSync(p);
    return `  - ${source} (${exists ? 'found' : 'not found'})`;
  });
}
```

- [ ] **Step 3: 重构 loadConfig 函数（保留 validateConfig）**

**重要**：保留现有的 `validateConfig` 函数不变，只替换 `loadConfig` 函数。

替换 loadConfig 函数为：
```typescript
export function loadConfig(configPath?: string, options?: { skipExcelCheck?: boolean; excelFile?: string }): Config {
  const finalPath = configPath || findConfigFile();

  if (!finalPath) {
    console.error('Error: No config file found.');
    console.error('Searched paths:');
    getConfigSearchPaths().forEach(p => {
      const source = p === process.env.ANNASBOOK_CONFIG ? '$ANNASBOOK_CONFIG' :
                     p.includes('.annasbook') ? '~/.annasbook/config.json' :
                     './config.json';
      console.error(`  - ${source} (not found)`);
    });
    console.error('\nRun: annas-download config init');
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(finalPath, 'utf-8');
    const config = JSON.parse(content);

    if (!config.apiKey && !process.env.ANNASBOOK_API_KEY) {
      console.error('Error: apiKey is required in config.json or ANNASBOOK_API_KEY env var');
      process.exit(1);
    }
    if (!config.baseUrl && !process.env.ANNASBOOK_BASE_URL) {
      console.error('Error: baseUrl is required in config.json or ANNASBOOK_BASE_URL env var');
      process.exit(1);
    }
    if (!config.excelFile && !options?.excelFile && !options?.skipExcelCheck) {
      console.error('Error: excelFile is required in config.json');
      process.exit(1);
    }

    const mergedConfig: Config = {
      ...DEFAULT_CONFIG,
      ...config,
      excelFile: options?.excelFile || config.excelFile,
      openai: config.openai ? {
        apiKey: config.openai.apiKey,
        baseUrl: config.openai.baseUrl || 'https://api.openai.com/v1',
        model: config.openai.model || 'gpt-4o-mini',
      } : undefined,
    };

    // Apply environment variable overrides
    return applyEnvOverrides(mergedConfig);
  } catch (error) {
    console.error(`Error parsing config file ${finalPath}: ${(error as Error).message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: 添加导出函数供 config 子命令使用**

在文件末尾添加：
```typescript
/**
 * Get the path where config file was found
 */
export function getConfigPath(configPath?: string): string | null {
  return configPath || findConfigFile();
}

/**
 * Get all config search paths
 */
export function getAllConfigPaths(): string[] {
  return getConfigSearchPaths();
}
```

- [ ] **Step 5: 验证所有导出函数存在**

Run: `grep -E "^export" src/config.ts`
Expected: 输出应包含 `loadConfig`, `validateConfig`, `getConfigPath`, `getAllConfigPaths`

- [ ] **Step 6: 验证 TypeScript 编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 7: 提交**

```bash
git add src/config.ts
git commit -m "feat: add multi-path config lookup and env var support"
```

---

### Task 4: 创建 src/commands 目录和子命令模块

**Files:**
- Create: `src/commands/search.ts`
- Create: `src/commands/download.ts`
- Create: `src/commands/batch.ts`
- Create: `src/commands/config.ts`

- [ ] **Step 1: 创建 commands 目录**

```bash
mkdir -p src/commands
```

- [ ] **Step 2: 创建 src/commands/search.ts**

```typescript
import { loadConfig, validateConfig } from '../config.js';
import { HttpClient } from '../http-client.js';
import { Searcher } from '../searcher.js';
import { SearchResult } from '../types.js';
import { setQuiet } from '../logger.js';
import { Config } from '../types.js';

export interface SearchArgs {
  title?: string;
  author?: string;
  format?: 'pdf' | 'epub';
  lang?: 'en' | 'zh';
  json?: boolean;
  limit?: number;
}

export function buildQuery(args: SearchArgs): string {
  const parts: string[] = [];
  if (args.title) parts.push(args.title);
  if (args.author) parts.push(args.author);
  return parts.join(' ');
}

export function limitResults(results: SearchResult[], limit?: number): SearchResult[] {
  return results.slice(0, limit || 5);
}

export function formatResults(results: SearchResult[], json: boolean = false): SearchResult[] {
  if (json) {
    console.log(JSON.stringify({
      success: true,
      results: results,
      count: results.length
    }, null, 2));
    return results;
  }

  if (results.length === 0) {
    console.log('No results found');
    return [];
  }

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

  console.log('\n--- MD5 List ---');
  results.forEach(result => {
    console.log(result.md5);
  });

  return results;
}

export async function runSearch(args: SearchArgs, config: Config): Promise<void> {
  if (args.json) {
    setQuiet(true);
  }

  if (!args.title && !args.author) {
    if (args.json) {
      console.log(JSON.stringify({
        success: false,
        error: 'MISSING_ARGS',
        message: 'At least one of --title or --author is required'
      }));
    } else {
      console.error('Error: At least one of --title or --author is required');
    }
    process.exit(1);
  }

  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);
  const query = buildQuery(args);

  try {
    const results = await searcher.searchByQuery(query, args.format);
    const limitedResults = limitResults(results, args.limit);
    formatResults(limitedResults, args.json);
  } catch (error) {
    const errorMsg = (error as Error).message;

    if (args.json) {
      console.log(JSON.stringify({
        success: false,
        error: errorMsg === 'CAPTCHA_DETECTED' ? 'CAPTCHA_DETECTED' : 'SEARCH_ERROR',
        message: errorMsg
      }));
      process.exit(errorMsg === 'CAPTCHA_DETECTED' ? 2 : 1);
    }

    if (errorMsg === 'CAPTCHA_DETECTED') {
      console.error('\nCAPTCHA detected. Please visit the search URL in a browser, solve it, and update cookies.json.');
      process.exit(2);
    }

    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}
```

- [ ] **Step 3: 创建 src/commands/download.ts**

```typescript
import readline from 'readline';
import { Config, SearchResult, BookInfo, BookDetailsExtended } from '../types.js';
import { HttpClient } from '../http-client.js';
import { Searcher } from '../searcher.js';
import { Downloader } from '../downloader.js';
import { setQuiet } from '../logger.js';
import { runSearch, SearchArgs } from './search.js';

interface DownloadArgs {
  md5?: string;
  filename?: string;
  title?: string;
  author?: string;
  format?: 'pdf' | 'epub';
  lang?: 'en' | 'zh';
  json?: boolean;
  output?: string;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

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
  downloader: Downloader,
  json: boolean = false
): Promise<void> {
  if (!json) {
    console.log(`Fetching book details for MD5: ${md5}...`);
  }

  const details = await searcher.fetchBookDetailsExtended(md5);

  if (!details.title) {
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: 'INVALID_MD5',
        message: 'Could not fetch book details. Invalid MD5?',
        md5
      }));
    } else {
      console.error('Error: Could not fetch book details. Invalid MD5?');
    }
    process.exit(1);
  }

  if (!json) {
    console.log(`\nTitle: ${details.title}`);
    console.log(`Author: ${details.author || 'Unknown'}`);
    console.log(`Format: ${details.format.toUpperCase()}`);
    console.log(`Size: ${details.size || 'Unknown'}`);
    console.log('\nStarting download...');
  }

  const bookInfo = buildBookInfo(details);
  const searchResult = buildSearchResult(details, md5);

  if (filename) {
    searchResult.title = filename;
  }

  const result = await downloader.download(bookInfo, searchResult);

  if (result.success) {
    if (json) {
      console.log(JSON.stringify({
        success: true,
        filePath: result.filePath,
        md5
      }, null, 2));
    } else {
      console.log(`\nDownload successful: ${result.filePath}`);
    }
  } else {
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: 'DOWNLOAD_FAILED',
        message: result.error,
        md5
      }));
    } else {
      console.error(`\nDownload failed: ${result.error}`);
    }
    process.exit(1);
  }
}

async function downloadBySearch(
  args: DownloadArgs,
  config: Config,
  searcher: Searcher,
  downloader: Downloader
): Promise<void> {
  const searchArgs: SearchArgs = {
    title: args.title,
    author: args.author,
    format: args.format,
    lang: args.lang,
  };

  const query = `${args.title || ''} ${args.author || ''}`.trim();

  if (!query) {
    if (args.json) {
      console.log(JSON.stringify({
        success: false,
        error: 'MISSING_ARGS',
        message: 'At least one of --title or --author is required'
      }));
    } else {
      console.error('Error: At least one of --title or --author is required');
    }
    process.exit(1);
  }

  if (!args.json) {
    console.log(`Searching for: ${query}`);
  }

  try {
    const results = await searcher.searchByQuery(query, args.format);
    const limitedResults = results.slice(0, 5);

    if (args.json) {
      console.log(JSON.stringify({
        success: true,
        results: limitedResults,
        count: limitedResults.length,
        message: limitedResults.length === 0 ? 'No results found' : undefined
      }, null, 2));
      return;
    }

    if (limitedResults.length === 0) {
      console.log('No results found');
      process.exit(0);
    }

    limitedResults.forEach((result, index) => {
      console.log(`\n=== Result ${index + 1} ===`);
      console.log(`Title: ${result.title}`);
      console.log(`Author: ${result.author || 'Unknown'}`);
      console.log(`Format: ${result.format.toUpperCase()}`);
      console.log(`Size: ${result.size || 'Unknown'}`);
      console.log(`MD5: ${result.md5}`);
    });

    console.log('\nEnter the number of the book to download (or "q" to quit):');

    const answer = await new Promise<string>((resolve) => {
      rl.question('> ', resolve);
    });

    const trimmed = answer.trim().toLowerCase();

    if (trimmed === 'q' || trimmed === 'quit') {
      console.log('Download cancelled.');
      process.exit(0);
    }

    const index = parseInt(trimmed) - 1;
    if (isNaN(index) || index < 0 || index >= limitedResults.length) {
      console.log('Invalid selection.');
      process.exit(1);
    }

    const selected = limitedResults[index];

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

    const details = await searcher.fetchBookDetails(selected.md5);
    selected.year = details.year;
    selected.publisher = details.publisher;

    const result = await downloader.download(bookInfo, selected);

    if (result.success) {
      console.log(`\nDownload successful: ${result.filePath}`);
    } else {
      console.error(`\nDownload failed: ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    const errorMsg = (error as Error).message;

    if (args.json) {
      console.log(JSON.stringify({
        success: false,
        error: errorMsg === 'CAPTCHA_DETECTED' ? 'CAPTCHA_DETECTED' : 'SEARCH_ERROR',
        message: errorMsg
      }));
      process.exit(errorMsg === 'CAPTCHA_DETECTED' ? 2 : 1);
    }

    if (errorMsg === 'CAPTCHA_DETECTED') {
      console.error('\nCAPTCHA detected. Please visit the search URL in a browser, solve it, and update cookies.json.');
      process.exit(2);
    }

    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function runDownload(args: DownloadArgs, config: Config): Promise<void> {
  if (args.json) {
    setQuiet(true);
  }

  if (!args.md5 && !args.title) {
    if (args.json) {
      console.log(JSON.stringify({
        success: false,
        error: 'MISSING_ARGS',
        message: 'Either --md5 or --title is required'
      }));
    } else {
      console.error('Error: Either --md5 or --title is required');
    }
    process.exit(1);
  }

  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);
  const downloader = new Downloader(config, httpClient);

  try {
    if (args.md5) {
      await downloadByMd5(args.md5, args.filename, searcher, downloader, args.json);
    } else {
      await downloadBySearch(args, config, searcher, downloader);
    }
  } catch (error) {
    const errorMsg = (error as Error).message;

    if (args.json) {
      console.log(JSON.stringify({
        success: false,
        error: errorMsg === 'NO_DOWNLOADS_LEFT' ? 'NO_DOWNLOADS_LEFT' : 'UNEXPECTED_ERROR',
        message: errorMsg
      }));
      process.exit(errorMsg === 'NO_DOWNLOADS_LEFT' ? 3 : 1);
    }

    if (errorMsg === 'NO_DOWNLOADS_LEFT') {
      console.error('\nError: No downloads left on this account.');
      process.exit(3);
    }

    console.error(`\nUnexpected error: ${errorMsg}`);
    process.exit(1);
  }

  if (!args.json) {
    rl.close();
  }
}
```

- [ ] **Step 4: 创建 src/commands/batch.ts**

```typescript
import { loadConfig, validateConfig } from '../config.js';
import { ExcelReader } from '../excel-reader.js';
import { HttpClient } from '../http-client.js';
import { Searcher } from '../searcher.js';
import { Downloader } from '../downloader.js';
import { logger, setQuiet } from '../logger.js';
import { Config, FATAL_ERRORS } from '../types.js';
import { sleep, withRetry } from '../utils.js';

interface BatchArgs {
  excel?: string;
  output?: string;
  json?: boolean;
  limit?: number;
}

interface BatchResult {
  row: number;
  title: string;
  success: boolean;
  filePath?: string;
  error?: string;
  md5?: string;
}

export async function runBatch(args: BatchArgs, config: Config): Promise<void> {
  if (args.json) {
    setQuiet(true);
  }

  if (!args.excel) {
    if (args.json) {
      console.log(JSON.stringify({
        success: false,
        error: 'MISSING_ARGS',
        message: '--excel is required'
      }));
    } else {
      console.error('Error: --excel is required');
    }
    process.exit(1);
  }

  if (args.output) {
    config.downloadDir = args.output;
  }

  if (args.limit) {
    config.downloadLimit = args.limit;
  }

  const excelReader = new ExcelReader(args.excel);
  const httpClient = new HttpClient(config);
  const searcher = new Searcher(config, httpClient);
  const downloader = new Downloader(config, httpClient);

  const books = excelReader.readBooks();
  const results: BatchResult[] = [];

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const book of books) {
    const title = book.chineseTitle || book.englishTitle;

    if (!args.json) {
      logger.info(`Processing: ${title}`);
    }

    try {
      const skipStatuses = ['已下载', '未找到'];
      if (skipStatuses.includes(book.downloadStatus)) {
        skipped++;
        results.push({
          row: book.rowIndex,
          title,
          success: true,
          error: 'Skipped (already processed)'
        });
        continue;
      }

      const searchResults = await searcher.search(book);
      const searchTitle = book.language === 'en' ? book.englishTitle : book.chineseTitle;
      const searchAuthor = book.language === 'en' ? book.englishAuthor : book.chineseAuthor;
      const searchResult = await searcher.selectBestResult(searchResults, searchTitle, searchAuthor, book.language);

      if (!searchResult) {
        excelReader.updateStatus(book.rowIndex, '未找到');
        failed++;
        results.push({
          row: book.rowIndex,
          title,
          success: false,
          error: 'No match found'
        });
        continue;
      }

      const details = await searcher.fetchBookDetails(searchResult.md5);
      searchResult.year = details.year;
      searchResult.publisher = details.publisher;

      const result = await withRetry(
        () => downloader.download(book, searchResult!),
        config.maxRetries,
        [1000, 2000, 4000]
      );

      if (result.success) {
        excelReader.updateStatus(book.rowIndex, '已下载', `https://annas-archive.gl/md5/${searchResult.md5}`);
        if (result.downloadUrl) {
          excelReader.updateDownloadUrl(book.rowIndex, result.downloadUrl);
        }
        downloaded++;
        results.push({
          row: book.rowIndex,
          title,
          success: true,
          filePath: result.filePath,
          md5: searchResult.md5
        });

        if (config.downloadLimit && config.downloadLimit > 0 && downloaded >= config.downloadLimit) {
          if (!args.json) {
            logger.info(`Reached download limit: ${config.downloadLimit}`);
          }
          excelReader.save();
          break;
        }
      } else {
        const isTimeout = result.error?.includes('timeout') || result.error?.includes('ETIMEDOUT');
        const errorMsg = isTimeout ? '下载超时' : result.error;
        excelReader.updateStatus(book.rowIndex, `下载失败: ${errorMsg}`);
        failed++;
        results.push({
          row: book.rowIndex,
          title,
          success: false,
          error: result.error
        });
        if (result.downloadUrl) {
          excelReader.updateDownloadUrl(book.rowIndex, result.downloadUrl);
        }
      }

      excelReader.save();
      await sleep(config.rateLimitMs);

    } catch (error) {
      const errorMsg = (error as Error).message;

      if (errorMsg === 'RATE_LIMITED') {
        await sleep(60000);
        continue;
      }

      if (FATAL_ERRORS.includes(errorMsg as any)) {
        excelReader.save();

        if (args.json) {
          console.log(JSON.stringify({
            success: false,
            error: errorMsg,
            message: errorMsg === 'CAPTCHA_DETECTED'
              ? 'CAPTCHA detected. Please update cookies.json'
              : errorMsg === 'NO_DOWNLOADS_LEFT'
                ? 'No downloads left on this account'
                : 'Too many consecutive failures',
            total: books.length,
            downloaded,
            skipped,
            failed,
            results
          }));
        } else {
          logger.error(`Fatal error: ${errorMsg}. Stopping.`);
        }

        process.exit(errorMsg === 'NO_DOWNLOADS_LEFT' ? 3 : errorMsg === 'CAPTCHA_DETECTED' ? 2 : 1);
      }

      logger.error(`Unexpected error: ${errorMsg}`);
      excelReader.updateStatus(book.rowIndex, `错误: ${errorMsg}`);
      failed++;
      results.push({
        row: book.rowIndex,
        title,
        success: false,
        error: errorMsg
      });
    }
  }

  excelReader.save();

  if (args.json) {
    console.log(JSON.stringify({
      success: true,
      total: books.length,
      downloaded,
      skipped,
      failed,
      results
    }, null, 2));
  } else {
    logger.info('='.repeat(50));
    logger.info(`Completed: ${books.length} total, ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
    logger.info('='.repeat(50));
  }
}
```

- [ ] **Step 5: 创建 src/commands/config.ts**

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getConfigPath, getAllConfigPaths } from '../config.js';

interface ConfigArgs {
  subcommand?: 'list' | 'path' | 'init';
}

export async function runConfig(args: ConfigArgs): Promise<void> {
  const subcommand = args.subcommand || 'list';

  switch (subcommand) {
    case 'path':
      runConfigPath();
      break;
    case 'init':
      runConfigInit();
      break;
    case 'list':
    default:
      runConfigList();
      break;
  }
}

function runConfigPath(): void {
  const configPath = getConfigPath();

  if (configPath) {
    console.log(configPath);
  } else {
    console.log('No config file found.');
    console.log('Run: annas-download config init');
    process.exit(1);
  }
}

function runConfigList(): void {
  const configPath = getConfigPath();

  console.log('Config file search paths:');
  getAllConfigPaths().forEach((p, i) => {
    const source = i === 0 ? '$ANNASBOOK_CONFIG' :
                   i === 1 ? '~/.annasbook/config.json' :
                   './config.json';
    const exists = fs.existsSync(p);
    const marker = p === configPath ? ' (active)' : '';
    console.log(`  ${i + 1}. ${source} -> ${p}${exists ? '' : ' (not found)'}${marker}`);
  });

  if (configPath && fs.existsSync(configPath)) {
    console.log('\nCurrent config:');
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      // Show config values, hide sensitive ones
      console.log(`  apiKey: ${config.apiKey ? '***' + config.apiKey.slice(-4) : '(not set)'}`);
      console.log(`  baseUrl: ${config.baseUrl || '(not set)'}`);
      console.log(`  downloadDir: ${config.downloadDir || '(default: ./downloads)'}`);
      if (config.proxy) {
        console.log(`  proxy: ***`);
      }
    } catch (error) {
      console.error(`Error reading config: ${(error as Error).message}`);
    }
  } else {
    console.log('\nNo config file found. Run: annas-download config init');
  }
}

function runConfigInit(): void {
  const defaultConfigDir = path.join(os.homedir(), '.annasbook');
  const defaultConfigPath = path.join(defaultConfigDir, 'config.json');

  if (fs.existsSync(defaultConfigPath)) {
    console.log(`Config file already exists at: ${defaultConfigPath}`);
    return;
  }

  // Create directory if needed
  if (!fs.existsSync(defaultConfigDir)) {
    fs.mkdirSync(defaultConfigDir, { recursive: true });
  }

  // Create default config
  const defaultConfig = {
    apiKey: 'YOUR_API_KEY_HERE',
    baseUrl: 'https://annas-archive.gl',
    downloadDir: './downloads',
  };

  fs.writeFileSync(defaultConfigPath, JSON.stringify(defaultConfig, null, 2));
  console.log(`Created config file at: ${defaultConfigPath}`);
  console.log('\nPlease edit the file and add your API key.');
}
```

- [ ] **Step 6: 验证 TypeScript 编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 7: 提交**

```bash
git add src/commands/
git commit -m "feat: add command modules (search, download, batch, config)"
```

---

### Task 5: 重构 src/cli.ts 为统一子命令分发器

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: 重写 cli.ts 为统一入口**

**注意**：shebang 已在 `bin/annas-download.js` 中，TypeScript 源文件不需要。

替换整个文件内容为：
```typescript
/**
 * annas-download - CLI for searching and downloading books from Anna's Archive
 *
 * Usage:
 *   annas-download search --title "Book Title"
 *   annas-download download --md5 <md5>
 *   annas-download batch --excel ./books.xlsx
 *   annas-download config init
 */

import { loadConfig, validateConfig, getConfigPath } from './config.js';
import { runSearch } from './commands/search.js';
import { runDownload } from './commands/download.js';
import { runBatch } from './commands/batch.js';
import { runConfig } from './commands/config.js';

const VERSION = '1.0.0';

interface GlobalOptions {
  config?: string;
  output?: string;
  json?: boolean;
}

interface ParsedArgs {
  globalOptions: GlobalOptions;
  command: string | null;
  commandArgs: string[];
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const globalOptions: GlobalOptions = {};
  const commandArgs: string[] = [];

  let i = 0;
  let command: string | null = null;

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--config' && args[i + 1]) {
      globalOptions.config = args[i + 1];
      i += 2;
    } else if (arg === '--output' && args[i + 1]) {
      globalOptions.output = args[i + 1];
      i += 2;
    } else if (arg === '--json') {
      globalOptions.json = true;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log(`annas-download v${VERSION}`);
      process.exit(0);
    } else if (!arg.startsWith('-') && !command) {
      command = arg;
      i++;
    } else {
      commandArgs.push(arg);
      i++;
    }
  }

  return { globalOptions, command, commandArgs };
}

function printHelp(): void {
  console.log(`
annas-download - Search and download books from Anna's Archive

Usage: annas-download <command> [options]

Commands:
  search     Search for books
  download   Download a book
  batch      Batch download from Excel file
  config     Manage configuration

Global Options:
  --config <path>   Use specified config file
  --output <dir>    Output directory for downloads
  --json            Output as JSON
  --help            Show this help
  --version         Show version

Examples:
  annas-download search --title "Dune" --author "Herbert"
  annas-download download --md5 abc123...
  annas-download batch --excel ./books.xlsx --limit 10
  annas-download config init

Run 'annas-download <command> --help' for command-specific options.
`);
}

function printCommandHelp(command: string): void {
  switch (command) {
    case 'search':
      console.log(`
Usage: annas-download search [options]

Options:
  --title <string>   Book title keywords (required)
  --author <string>  Author name
  --format <format>  Filter by format: pdf or epub
  --lang <lang>      Language preference: en or zh (default: en)
  --limit <number>   Max results to return (default: 5)
  --json             Output as JSON

Examples:
  annas-download search --title "The Great Gatsby"
  annas-download search --title "1984" --author "Orwell" --format pdf
`);
      break;

    case 'download':
      console.log(`
Usage: annas-download download [options]

Options:
  --md5 <string>     Book MD5 hash (use instead of search)
  --title <string>   Book title keywords (for search)
  --author <string>  Author name
  --format <format>  Filter by format: pdf or epub
  --lang <lang>      Language preference: en or zh
  --filename <name>  Output filename without extension (MD5 mode only)
  --json             Output as JSON

Either --md5 OR --title is required.

Examples:
  annas-download download --md5 abc123...
  annas-download download --title "The Great Gatsby" --format pdf
`);
      break;

    case 'batch':
      console.log(`
Usage: annas-download batch [options]

Options:
  --excel <file>   Path to Excel file with book list (required)
  --output <dir>   Output directory for downloads
  --limit <n>      Maximum number of downloads
  --json           Output as JSON

Examples:
  annas-download batch --excel ./books.xlsx
  annas-download batch --excel ./books.xlsx --limit 10
`);
      break;

    case 'config':
      console.log(`
Usage: annas-download config <subcommand>

Subcommands:
  list   Show current configuration and config file paths
  path   Show the path to the active config file
  init   Create a default config file in ~/.annasbook/

Examples:
  annas-download config list
  annas-download config path
  annas-download config init
`);
      break;

    default:
      console.log(`Unknown command: ${command}`);
      printHelp();
  }
}

function parseSearchArgs(args: string[]): { title?: string; author?: string; format?: 'pdf' | 'epub'; lang?: 'en' | 'zh'; json?: boolean; limit?: number } {
  const result: { title?: string; author?: string; format?: 'pdf' | 'epub'; lang?: 'en' | 'zh'; json?: boolean; limit?: number } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
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
    } else if (args[i] === '--json') {
      result.json = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      const limit = parseInt(args[i + 1]);
      if (!isNaN(limit) && limit > 0) {
        result.limit = limit;
      }
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printCommandHelp('search');
      process.exit(0);
    }
  }

  return result;
}

function parseDownloadArgs(args: string[]): { md5?: string; filename?: string; title?: string; author?: string; format?: 'pdf' | 'epub'; lang?: 'en' | 'zh'; json?: boolean; output?: string } {
  const result: { md5?: string; filename?: string; title?: string; author?: string; format?: 'pdf' | 'epub'; lang?: 'en' | 'zh'; json?: boolean; output?: string } = {};

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
    } else if (args[i] === '--json') {
      result.json = true;
    } else if (args[i] === '--output' && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printCommandHelp('download');
      process.exit(0);
    }
  }

  return result;
}

function parseBatchArgs(args: string[]): { excel?: string; output?: string; json?: boolean; limit?: number } {
  const result: { excel?: string; output?: string; json?: boolean; limit?: number } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--excel' && args[i + 1]) {
      result.excel = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    } else if (args[i] === '--json') {
      result.json = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      const limit = parseInt(args[i + 1]);
      if (!isNaN(limit) && limit > 0) {
        result.limit = limit;
      }
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printCommandHelp('batch');
      process.exit(0);
    }
  }

  return result;
}

function parseConfigArgs(args: string[]): { subcommand?: 'list' | 'path' | 'init' } {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printCommandHelp('config');
    process.exit(0);
  }

  const subcommand = args[0];
  if (subcommand === 'list' || subcommand === 'path' || subcommand === 'init') {
    return { subcommand };
  }

  console.error(`Unknown config subcommand: ${subcommand}`);
  printCommandHelp('config');
  process.exit(1);
}

async function main(): Promise<void> {
  const { globalOptions, command, commandArgs } = parseArgs();

  if (!command) {
    printHelp();
    process.exit(0);
  }

  // Handle config command separately (doesn't need config file)
  if (command === 'config') {
    const configArgs = parseConfigArgs(commandArgs);
    await runConfig(configArgs);
    return;
  }

  // Load config for other commands
  const config = loadConfig(globalOptions.config);
  validateConfig(config, { skipExcelCheck: command !== 'batch' });

  // Apply global output override
  if (globalOptions.output) {
    config.downloadDir = globalOptions.output;
  }

  // Dispatch to command handlers
  switch (command) {
    case 'search': {
      const searchArgs = parseSearchArgs(commandArgs);
      if (globalOptions.json) searchArgs.json = true;
      await runSearch(searchArgs, config);
      break;
    }

    case 'download': {
      const downloadArgs = parseDownloadArgs(commandArgs);
      if (globalOptions.json) downloadArgs.json = true;
      if (globalOptions.output) downloadArgs.output = globalOptions.output;
      await runDownload(downloadArgs, config);
      break;
    }

    case 'batch': {
      const batchArgs = parseBatchArgs(commandArgs);
      if (globalOptions.json) batchArgs.json = true;
      if (globalOptions.output) batchArgs.output = globalOptions.output;
      await runBatch(batchArgs, config);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 提交**

```bash
git add src/cli.ts
git commit -m "feat: refactor cli.ts as unified subcommand dispatcher"
```

---

### Task 6: 构建并测试 CLI

**Files:**
- Test: 全局 CLI 命令

- [ ] **Step 1: 构建项目**

Run: `npm run build`
Expected: 编译成功，dist/ 目录生成

- [ ] **Step 2: 创建全局链接**

Run: `npm link`
Expected: 输出类似 `created symlink .../bin/annas-download -> .../bin/annas-download.js`

- [ ] **Step 3: 测试帮助命令**

Run: `annas-download --help`
Expected: 显示帮助信息

- [ ] **Step 4: 测试版本命令**

Run: `annas-download --version`
Expected: 显示 `annas-download v1.0.0`

- [ ] **Step 5: 测试 config 子命令**

Run: `annas-download config list`
Expected: 显示配置查找路径列表

- [ ] **Step 6: 测试 config init**

Run: `annas-download config init`
Expected: 在 ~/.annasbook/ 创建 config.json（如果不存在）

- [ ] **Step 7: 提交测试通过**

```bash
git add -A
git commit -m "test: verify CLI global installation works"
```

---

### Task 7: 更新 skill 文档

**Files:**
- Modify: `~/.claude/skills/anna-downloader/SKILL.md`

- [ ] **Step 1: 更新 skill 中的命令格式**

将原有的 `npx tsx /Users/yuyuxin/code/annasBook/scripts/...` 命令替换为新的全局命令格式：

```bash
annas-download search --title "Dune"
annas-download download --md5 abc123
annas-download batch --excel ./books.xlsx
```

- [ ] **Step 2: 提交 skill 更新**

```bash
git add ~/.claude/skills/anna-downloader/SKILL.md
git commit -m "docs: update skill to use global annas-download command"
```

---

## 完成检查清单

- [ ] `npm link` 后可全局运行 `annas-download`
- [ ] `annas-download config init` 创建默认配置
- [ ] `annas-download config list` 显示配置信息
- [ ] 配置文件查找按优先级工作（环境变量 > 用户目录 > 当前目录）
- [ ] 环境变量 `ANNASBOOK_API_KEY` 等正确覆盖配置文件
- [ ] skill 文档已更新使用新命令格式
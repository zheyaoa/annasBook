import readline from 'readline';
import { loadConfig, validateConfig } from '../src/config.js';
import { HttpClient } from '../src/http-client.js';
import { Searcher } from '../src/searcher.js';
import { Downloader } from '../src/downloader.js';
import { SearchResult, BookInfo, BookDetailsExtended } from '../src/types.js';
import {
  buildQuery,
  limitResults,
  formatResults,
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
    printDownloadUsage();
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
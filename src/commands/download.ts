import readline from 'readline';
import { Config, SearchResult, BookInfo, BookDetailsExtended } from '../types.js';
import { HttpClient } from '../http-client.js';
import { Searcher } from '../searcher.js';
import { Downloader } from '../downloader.js';
import { setQuiet } from '../logger.js';

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
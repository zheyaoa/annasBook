import { HttpClient } from '../src/http-client.js';
import { Searcher } from '../src/searcher.js';
import { SearchResult } from '../src/types.js';
import { setQuiet } from '../src/logger.js';
import { Config } from '../src/types.js';

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
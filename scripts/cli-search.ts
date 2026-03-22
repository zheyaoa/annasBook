import { loadConfig, validateConfig } from '../src/config.js';
import { HttpClient } from '../src/http-client.js';
import { Searcher } from '../src/searcher.js';
import { SearchResult } from '../src/types.js';

export interface SearchArgs {
  title?: string;
  author?: string;
  format?: 'pdf' | 'epub';
  lang?: 'en' | 'zh';
}

export function parseArgs(): SearchArgs {
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

export function buildQuery(args: SearchArgs): string {
  const parts: string[] = [];
  if (args.title) parts.push(args.title);
  if (args.author) parts.push(args.author);
  return parts.join(' ');
}

export function limitResults(results: SearchResult[]): SearchResult[] {
  return results.slice(0, 5);
}

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

export function printUsage(): void {
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
    process.exit(0);
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

// Only run main when executed directly, not when imported
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

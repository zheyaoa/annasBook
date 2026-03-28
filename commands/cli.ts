/**
 * annas-download - CLI for searching and downloading books from Anna's Archive
 *
 * Usage:
 *   annas-download search --title "Book Title"
 *   annas-download download --md5 <md5>
 *   annas-download batch --excel ./books.xlsx
 *   annas-download config init
 */

import { loadConfig, validateConfig } from '../src/config.js';
import { runSearch } from './search.js';
import { runDownload } from './download.js';
import { runBatch } from './batch.js';
import { runConfig } from './config-command.js';
import { runConvert } from './convert.js';

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
    } else if (!arg.startsWith('-') && !command) {
      // Detect subcommand first
      command = arg;
      i++;
    } else if ((arg === '--help' || arg === '-h') && command) {
      // -h after command: pass to subcommand
      commandArgs.push(arg);
      i++;
    } else if (arg === '--help' || arg === '-h') {
      // -h without command: show main help
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log(`annas-download v${VERSION}`);
      process.exit(0);
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
  convert    Convert EPUB to PDF

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
  annas-download convert ./downloads/book.epub

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

    case 'convert':
      console.log(`
Usage: annas-download convert <input.epub> [options]

Arguments:
  <input.epub>       Path to EPUB file to convert (required)

Options:
  --output <path>    Output path or directory for PDF (default: same as input)

Examples:
  annas-download convert ./downloads/book.epub
  annas-download convert ./downloads/book.epub --output ./pdfs
  annas-download convert ./downloads/book.epub --output ./pdfs/mybook.pdf
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

function parseConvertArgs(args: string[]): { input?: string; output?: string } {
  const result: { input?: string; output?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printCommandHelp('convert');
      process.exit(0);
    } else if (!args[i].startsWith('-') && !result.input) {
      result.input = args[i];
    }
  }

  return result;
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

  // Handle convert command separately (doesn't need config file)
  if (command === 'convert') {
    const convertArgs = parseConvertArgs(commandArgs);
    if (!convertArgs.input) {
      console.error('Error: Input EPUB file is required');
      printCommandHelp('convert');
      process.exit(1);
    }
    await runConvert({ input: convertArgs.input, output: convertArgs.output });
    return;
  }

  // Load config for other commands
  const config = loadConfig(globalOptions.config, { skipExcelCheck: command === 'batch' });
  validateConfig(config, { skipExcelCheck: command === 'batch' });

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
#!/usr/bin/env node
/**
 * Anna's Book CLI - Unified entry point
 *
 * Usage:
 *   npx tsx src/cli.ts search --title "Book Title" --json
 *   npx tsx src/cli.ts download --md5 <md5> --output ./downloads --json
 *   npx tsx src/cli.ts batch --excel ./books.xlsx --json
 */

import { spawn } from 'child_process';
import path from 'path';

const COMMANDS = ['search', 'download', 'batch'] as const;
type Command = typeof COMMANDS[number];

function printUsage(): void {
  console.log(`
Anna's Book CLI - Search and download books from Anna's Archive

Usage: annas-book <command> [options]

Commands:
  search     Search for books
  download   Download a book by MD5
  batch      Batch download from Excel file

Options:
  --json     Output results as JSON (for programmatic use)

Examples:
  annas-book search --title "The Great Gatsby" --json
  annas-book download --md5 abc123... --output ./downloads --json
  annas-book batch --excel ./books.xlsx --json

Run 'annas-book <command> --help' for more information on a command.
`);
}

function getScriptPath(command: Command): string {
  return path.join(import.meta.dirname, '..', 'scripts', `cli-${command}.ts`);
}

async function runCommand(command: Command): Promise<void> {
  const scriptPath = getScriptPath(command);
  const args = process.argv.slice(3); // Remove 'node', 'cli.ts', and command

  const child = spawn('npx', ['tsx', scriptPath, ...args], {
    stdio: 'inherit',
    shell: true
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });

  child.on('error', (err) => {
    console.error(`Failed to run command: ${err.message}`);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const command = args[0] as Command;

  if (!COMMANDS.includes(command)) {
    console.error(`Unknown command: ${command}`);
    console.error(`Available commands: ${COMMANDS.join(', ')}`);
    process.exit(1);
  }

  await runCommand(command);
}

main();
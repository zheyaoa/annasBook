import fs from 'fs';
import path from 'path';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const LOG_FILE = './logs/download.log';

function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function log(level: LogLevel, message: string): void {
  const timestamp = formatTimestamp();
  const logLine = `[${timestamp}] [${level}] ${message}`;

  // Console output
  if (level === 'ERROR') {
    console.error(logLine);
  } else if (level === 'WARN') {
    console.warn(logLine);
  } else {
    console.log(logLine);
  }

  // File output
  try {
    fs.appendFileSync(LOG_FILE, logLine + '\n');
  } catch (error) {
    console.error(`Failed to write to log file: ${(error as Error).message}`);
  }
}

export const logger = {
  info: (message: string) => log('INFO', message),
  warn: (message: string) => log('WARN', message),
  error: (message: string) => log('ERROR', message),
};
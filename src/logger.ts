import fs from 'fs';
import path from 'path';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const COLORS = {
  DEBUG: '\x1b[90m',   // Gray (仅写文件时不用)
  INFO: '\x1b[0m',     // Default/white
  WARN: '\x1b[33m',    // Yellow
  ERROR: '\x1b[31m',   // Red
  RESET: '\x1b[0m',
};

let quietMode = false;

export function setQuiet(quiet: boolean): void {
  quietMode = quiet;
}

function getLogFilePath(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `./logs/download-${year}-${month}-${day}.log`;
}

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

  // DEBUG 级别只写文件，不输出控制台
  if (!quietMode && level !== 'DEBUG') {
    const color = COLORS[level];
    const coloredLogLine = `${color}${logLine}${COLORS.RESET}`;
    if (level === 'ERROR') {
      console.error(coloredLogLine);
    } else if (level === 'WARN') {
      console.warn(coloredLogLine);
    } else {
      console.log(coloredLogLine);
    }
  }

  const logFile = getLogFilePath();
  try {
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logFile, logLine + '\n');
  } catch (error) {
    if (!quietMode) {
      console.error(`Failed to write to log file: ${(error as Error).message}`);
    }
  }
}

export const logger = {
  debug: (message: string) => log('DEBUG', message),
  info: (message: string) => log('INFO', message),
  warn: (message: string) => log('WARN', message),
  error: (message: string) => log('ERROR', message),
};
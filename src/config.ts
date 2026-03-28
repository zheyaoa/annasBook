import fs from 'fs';
import path from 'path';
import os from 'os';
import { Config } from './types.js';

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

const DEFAULT_CONFIG: Config = {
  apiKey: '',
  baseUrl: 'https://annas-archive.gl',
  excelFile: '',
  downloadDir: './downloads',
  rateLimitMs: 10000,
  requestTimeoutMs: 30000,
  downloadTimeoutMs: 300000,
  maxRetries: 3,
  proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '',
  downloadLimit: 0,
};

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
        enable: config.openai.enable,
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

export function validateConfig(config: Config, options?: { skipExcelCheck?: boolean }): void {
  if (!options?.skipExcelCheck && config.excelFile) {
    if (!fs.existsSync(config.excelFile)) {
      console.error(`Error: Excel file not found at ${config.excelFile}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(config.downloadDir)) {
    fs.mkdirSync(config.downloadDir, { recursive: true });
  }

  if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs', { recursive: true });
  }
}

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
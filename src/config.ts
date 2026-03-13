import fs from 'fs';
import path from 'path';
import { Config } from './types.js';

const DEFAULT_CONFIG: Config = {
  apiKey: '',
  baseUrl: 'https://annas-archive.gl',
  excelFile: './src/assets/海外中国.xlsx',
  downloadDir: './downloads',
  rateLimitMs: 2000,
  requestTimeoutMs: 30000,
  downloadTimeoutMs: 300000,
  maxRetries: 3,
};

export function loadConfig(configPath: string = './config.json'): Config {
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Config file not found at ${configPath}`);
    console.error('Please copy config.example.json to config.json and fill in your API key.');
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    // Validate required fields
    if (!config.apiKey) {
      console.error('Error: apiKey is required in config.json');
      process.exit(1);
    }
    if (!config.baseUrl) {
      console.error('Error: baseUrl is required in config.json');
      process.exit(1);
    }
    if (!config.excelFile) {
      console.error('Error: excelFile is required in config.json');
      process.exit(1);
    }

    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.error(`Error parsing config.json: ${(error as Error).message}`);
    process.exit(1);
  }
}

export function validateConfig(config: Config): void {
  // Check Excel file exists
  if (!fs.existsSync(config.excelFile)) {
    console.error(`Error: Excel file not found at ${config.excelFile}`);
    process.exit(1);
  }

  // Create download directory if not exists
  if (!fs.existsSync(config.downloadDir)) {
    fs.mkdirSync(config.downloadDir, { recursive: true });
  }

  // Create logs directory if not exists
  if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs', { recursive: true });
  }
}
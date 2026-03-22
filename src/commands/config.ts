import fs from 'fs';
import path from 'path';
import os from 'os';
import { getConfigPath, getAllConfigPaths } from '../config.js';

interface ConfigArgs {
  subcommand?: 'list' | 'path' | 'init';
}

export async function runConfig(args: ConfigArgs): Promise<void> {
  const subcommand = args.subcommand || 'list';

  switch (subcommand) {
    case 'path':
      runConfigPath();
      break;
    case 'init':
      runConfigInit();
      break;
    case 'list':
    default:
      runConfigList();
      break;
  }
}

function runConfigPath(): void {
  const configPath = getConfigPath();

  if (configPath) {
    console.log(configPath);
  } else {
    console.log('No config file found.');
    console.log('Run: annas-download config init');
    process.exit(1);
  }
}

function runConfigList(): void {
  const configPath = getConfigPath();

  console.log('Config file search paths:');
  getAllConfigPaths().forEach((p, i) => {
    const source = i === 0 ? '$ANNASBOOK_CONFIG' :
                   i === 1 ? '~/.annasbook/config.json' :
                   './config.json';
    const exists = fs.existsSync(p);
    const marker = p === configPath ? ' (active)' : '';
    console.log(`  ${i + 1}. ${source} -> ${p}${exists ? '' : ' (not found)'}${marker}`);
  });

  if (configPath && fs.existsSync(configPath)) {
    console.log('\nCurrent config:');
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      // Show config values, hide sensitive ones
      console.log(`  apiKey: ${config.apiKey ? '***' + config.apiKey.slice(-4) : '(not set)'}`);
      console.log(`  baseUrl: ${config.baseUrl || '(not set)'}`);
      console.log(`  downloadDir: ${config.downloadDir || '(default: ./downloads)'}`);
      if (config.proxy) {
        console.log(`  proxy: ***`);
      }
    } catch (error) {
      console.error(`Error reading config: ${(error as Error).message}`);
    }
  } else {
    console.log('\nNo config file found. Run: annas-download config init');
  }
}

function runConfigInit(): void {
  const defaultConfigDir = path.join(os.homedir(), '.annasbook');
  const defaultConfigPath = path.join(defaultConfigDir, 'config.json');

  if (fs.existsSync(defaultConfigPath)) {
    console.log(`Config file already exists at: ${defaultConfigPath}`);
    return;
  }

  // Create directory if needed
  if (!fs.existsSync(defaultConfigDir)) {
    fs.mkdirSync(defaultConfigDir, { recursive: true });
  }

  // Create default config
  const defaultConfig = {
    apiKey: 'YOUR_API_KEY_HERE',
    baseUrl: 'https://annas-archive.gl',
    downloadDir: './downloads',
  };

  fs.writeFileSync(defaultConfigPath, JSON.stringify(defaultConfig, null, 2));
  console.log(`Created config file at: ${defaultConfigPath}`);
  console.log('\nPlease edit the file and add your API key.');
}
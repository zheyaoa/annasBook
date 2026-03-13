import fs from 'fs';
import { logger } from './logger.js';

const LOCK_FILE = '.lock';

export function acquireLock(): boolean {
  if (fs.existsSync(LOCK_FILE)) {
    logger.error('Another instance is already running. If this is incorrect, delete .lock file.');
    return false;
  }

  try {
    fs.writeFileSync(LOCK_FILE, `${process.pid}\n${new Date().toISOString()}`);
    return true;
  } catch (error) {
    logger.error(`Failed to create lock file: ${(error as Error).message}`);
    return false;
  }
}

export function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (error) {
    logger.warn(`Failed to remove lock file: ${(error as Error).message}`);
  }
}
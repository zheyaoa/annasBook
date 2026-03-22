/**
 * Shared utility functions
 */

import { logger } from './logger.js';

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  backoff: number[],
  options?: { quiet?: boolean }
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = backoff[i] || backoff[backoff.length - 1];
        if (!options?.quiet && !lastError.message.includes('CAPTCHA')) {
          logger.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
        }
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
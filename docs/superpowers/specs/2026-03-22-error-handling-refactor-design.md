# Error Handling Refactor Spec

## Overview

Simplify error handling in the book downloader: only `RATE_LIMITED` waits and continues, all other fatal errors stop the program immediately.

## Motivation

Current behavior prompts user for confirmation on certain errors (CAPTCHA_DETECTED, CONSECUTIVE_FAILURES), but user wants these to stop immediately without interaction. Additionally, "No downloads left" API error should be treated as fatal.

## Scope

- `src/downloader.ts` - Add NO_DOWNLOADS_LEFT error detection
- `src/index.ts` - Simplify catch block error handling

## Detailed Design

### 1. NO_DOWNLOADS_LEFT Error Detection

**File:** `src/downloader.ts:73-76`

When the API returns `{ error: "No downloads left" }`, throw a `NO_DOWNLOADS_LEFT` error instead of returning failure.

```typescript
const error = data.error || 'Unknown error';
logger.error(`[API] API error: ${error}`);

if (error === 'No downloads left') {
  throw new Error('NO_DOWNLOADS_LEFT');
}

return { success: false, error };
```

### 2. Unified Fatal Error Handling

**File:** `src/index.ts:143-164`

Replace individual error handling with unified approach:

```typescript
// RATE_LIMITED: wait 60s and continue
if (errorMsg === 'RATE_LIMITED') {
  await sleep(60000);
  continue;
}

// Fatal errors: stop immediately
const fatalErrors = ['CAPTCHA_DETECTED', 'CONSECUTIVE_FAILURES', 'NO_DOWNLOADS_LEFT'];
if (fatalErrors.includes(errorMsg)) {
  logger.error(`Fatal error: ${errorMsg}. Stopping.`);
  break;
}
```

## Behavior Changes

| Error | Before | After |
|-------|--------|-------|
| CAPTCHA_DETECTED | Prompt user, wait for choice | Stop immediately |
| RATE_LIMITED | Wait 60s, continue | Wait 60s, continue (unchanged) |
| CONSECUTIVE_FAILURES | Prompt user, wait for choice | Stop immediately |
| NO_DOWNLOADS_LEFT | Continue to next book | Stop immediately (new behavior) |

## Testing

1. Build: `npm run build` - should compile without errors
2. Manual test: Trigger "No downloads left" error, verify program stops immediately

## Implementation Notes

- Remove `promptUser` calls for fatal errors
- Keep `promptUser` function for potential future use
- No new dependencies required
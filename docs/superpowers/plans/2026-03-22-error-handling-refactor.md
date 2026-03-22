# Error Handling Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify error handling - only RATE_LIMITED waits and continues, all other fatal errors stop immediately.

**Architecture:** Modify two files: add NO_DOWNLOADS_LEFT error throw in downloader.ts, simplify catch block in index.ts to handle fatal errors uniformly.

**Tech Stack:** TypeScript

**Spec:** `/Users/yuyuxin/code/annasBook/docs/superpowers/specs/2026-03-22-error-handling-refactor-design.md`

---

## Chunk 1: Implementation

### Task 1: Add NO_DOWNLOADS_LEFT Error Detection

**Files:**
- Modify: `src/downloader.ts:73-76`

- [ ] **Step 1: Add NO_DOWNLOADS_LEFT detection in tryFastDownloadApi**

Edit `src/downloader.ts`, replace lines 73-76:

```typescript
// Current (lines 73-76):
      const error = data.error || 'Unknown error';
      logger.error(`[API] API error: ${error}`);

      return { success: false, error };

// Replace with:
      const error = data.error || 'Unknown error';
      logger.error(`[API] API error: ${error}`);

      if (error === 'No downloads left') {
        throw new Error('NO_DOWNLOADS_LEFT');
      }

      return { success: false, error };
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No compilation errors

---

### Task 2: Simplify Error Handling in Main Loop

**Files:**
- Modify: `src/index.ts:143-164`

- [ ] **Step 3: Replace catch block error handling**

Edit `src/index.ts`, replace lines 143-164:

```typescript
// Current (lines 143-164):
      if (errorMsg === 'CAPTCHA_DETECTED') {
        logger.warn('CAPTCHA detected. Please solve it and update cookies.json.');
        const answer = await promptUser('Press Enter to continue or type "quit" to abort: ');
        if (answer.toLowerCase() === 'quit') {
          break;
        }
        httpClient.reloadCookies();
        continue;
      }

      if (errorMsg === 'RATE_LIMITED') {
        await sleep(60000);
        continue;
      }

      if (errorMsg === 'CONSECUTIVE_FAILURES') {
        const answer = await promptUser('Press Enter to continue or type "quit" to abort: ');
        if (answer.toLowerCase() === 'quit') {
          break;
        }
        continue;
      }

// Replace with:
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

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: No compilation errors

---

### Task 3: Commit Changes

- [ ] **Step 5: Commit**

Run:
```bash
git add src/downloader.ts src/index.ts
git commit -m "refactor: simplify error handling - fatal errors stop immediately

- Add NO_DOWNLOADS_LEFT error detection in API handler
- Unify fatal error handling (CAPTCHA_DETECTED, CONSECUTIVE_FAILURES, NO_DOWNLOADS_LEFT)
- RATE_LIMITED remains the only error that waits and continues"
```

---

## Summary

| Error | Before | After |
|-------|--------|-------|
| CAPTCHA_DETECTED | Prompt user | Stop immediately |
| RATE_LIMITED | Wait 60s, continue | Wait 60s, continue (unchanged) |
| CONSECUTIVE_FAILURES | Prompt user | Stop immediately |
| NO_DOWNLOADS_LEFT | Continue to next book | Stop immediately (new) |
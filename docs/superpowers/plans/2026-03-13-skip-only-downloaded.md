# Skip Only Downloaded Books Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the skip logic so only successfully downloaded books are skipped, while books with other statuses (empty, failed, not found) are re-processed.

**Architecture:** Modify the skip condition in `src/index.ts` from checking for any non-empty status to specifically checking for "已下载" status.

**Tech Stack:** TypeScript, Node.js

---

## Chunk 1: Implementation

### Task 1: Modify Skip Condition

**Files:**
- Modify: `src/index.ts:198-203`

- [ ] **Step 1: Modify the skip condition**

Change the condition from checking for any non-empty status to specifically checking for "已下载":

```typescript
// BEFORE (lines 198-203):
// Check if already downloaded
if (book.downloadStatus && book.downloadStatus !== '') {
  logger.info(`Skipping - already marked as ${book.downloadStatus}`);
  skipped++;
  continue;
}

// AFTER:
// Check if already successfully downloaded
if (book.downloadStatus === '已下载') {
  logger.info(`Skipping - already downloaded`);
  skipped++;
  continue;
}
```

- [ ] **Step 2: Verify the change works correctly**

Run: `npm run build`

Expected: No TypeScript errors

- [ ] **Step 3: Commit the change**

```bash
git add src/index.ts
git commit -m "$(cat <<'EOF'
fix: only skip books with '已下载' status

Previously, any book with a non-empty download status was skipped,
including failed downloads and not found books. Now only books that
were successfully downloaded are skipped, allowing retry of failures.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Summary

This is a minimal one-line logic change:
- **Before:** Skip if `downloadStatus` is non-empty (any status)
- **After:** Skip only if `downloadStatus === '已下载'` (downloaded)

This allows books with statuses like "未找到" (not found), "下载失败" (download failed), or empty status to be re-processed.
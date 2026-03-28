# selectBestResult 统一格式评分修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `selectBestResult` 函数，使其不再优先选择 PDF 格式，而是合并所有格式（PDF + EPUB）后统一评分。

**Architecture:** 修改 `src/searcher.ts` 中的 `selectBestResult` 方法，将按格式分组筛选改为合并所有格式结果后统一过滤和评分。

**Tech Stack:** TypeScript, Cheerio, Anna's Archive API

---

### Task 1: 修改 selectBestResult 方法，统一格式评分

**Files:**
- Modify: `src/searcher.ts:493-575` (selectBestResult 方法)

**Changes:**

旧代码 (第 496-499 行):
```typescript
const pdfResults = results.filter(r => r.format === 'pdf' && r.title);
const epubResults = results.filter(r => r.format === 'epub' && r.title);
let candidates = pdfResults.length > 0 ? pdfResults : epubResults;
```

新代码:
```typescript
const allCandidates = results.filter(r => r.title && r.sizeBytes >= MIN_SIZE_BYTES);
let candidates = allCandidates;
```

---

- [ ] **Step 1: 确认修改位置**

读取 `src/searcher.ts` 第 493-575 行，确认 `selectBestResult` 方法当前实现。

- [ ] **Step 2: 修改代码**

使用 Edit 工具将第 496-499 行的格式分组逻辑替换为统一过滤逻辑。

旧字符串:
```typescript
    const pdfResults = results.filter(r => r.format === 'pdf' && r.title);
    const epubResults = results.filter(r => r.format === 'epub' && r.title);

    let candidates = pdfResults.length > 0 ? pdfResults : epubResults;
```

新字符串:
```typescript
    // Combine all formats and filter by minimum size
    const allCandidates = results.filter(r => r.title && r.sizeBytes >= MIN_SIZE_BYTES);
    let candidates = allCandidates;
```

- [ ] **Step 3: 运行调试脚本验证**

Run: `npx tsx scripts/debug-book_delete.ts`
Expected output 应显示:
- `After format filter:` 后不再区分 PDF/EPUB
- `Best match should be: Two Cities...` (EPUB 格式)

- [ ] **Step 4: 提交代码**

```bash
git add src/searcher.ts
git commit -m "fix: combine all formats in selectBestResult instead of preferring pdf

Now considers both PDF and EPUB results together, then scores and selects
the best match. This fixes books that only have EPUB format being marked
as 'not found'.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 运行 batch 命令验证完整流程

**Files:**
- Test: `assets/已有但未找到-含有冒号.xlsx`

---

- [ ] **Step 1: 运行 batch 命令测试**

Run: `npx tsx commands/cli.ts batch --excel "./assets/已有但未找到-含有冒号.xlsx" --limit 1 2>&1`
Expected: Two Cities 这本书应被找到并下载（或至少尝试下载）

- [ ] **Step 2: 确认 Excel 状态更新**

检查 Excel 文件中 Two Cities 行的 `下载状态` 列是否从"未找到"变为"已下载"或下载链接。

---

### 验证清单

- [ ] 调试脚本输出显示 EPUB 格式的 Two Cities 被正确匹配
- [ ] batch 命令能成功找到并处理该书
- [ ] 代码已提交

# Fix: selectBestResult 统一格式评分

## 问题

`selectBestResult` 函数在筛选候选结果时，优先选择 PDF 格式，忽略 EPUB：

```typescript
const pdfResults = results.filter(r => r.format === 'pdf' && r.title);
const epubResults = results.filter(r => r.format === 'epub' && r.title);
let candidates = pdfResults.length > 0 ? pdfResults : epubResults;
```

这导致 Anna's Archive 上只有 EPUB 格式的书籍无法被找到（标记为"未找到"）。

## 解决方案

合并所有格式结果，统一评分。

### 变更文件

- `src/searcher.ts` — `selectBestResult` 方法

### 逻辑变更

**原逻辑：**
1. 分别筛选 PDF 和 EPUB
2. 如果有 PDF 结果，只保留 PDF
3. 否则使用 EPUB
4. 对候选列表进行语言、作者、标题过滤和评分

**新逻辑：**
1. 合并所有格式（PDF + EPUB + 其他）的有效结果
2. 对合并后的列表进行语言、作者、标题过滤和评分

### 代码变更

```typescript
// 旧代码 (searcher.ts selectBestResult)
const pdfResults = results.filter(r => r.format === 'pdf' && r.title);
const epubResults = results.filter(r => r.format === 'epub' && r.title);
let candidates = pdfResults.length > 0 ? pdfResults : epubResults;

// 新代码
const allCandidates = results.filter(r => r.title && r.sizeBytes >= MIN_SIZE_BYTES);
let candidates = allCandidates;
```

### 行为对比

| 场景 | 原行为 | 新行为 |
|------|--------|--------|
| 某书只有 PDF | ✅ 找到 | ✅ 找到 |
| 某书只有 EPUB | ❌ 遗漏 | ✅ 找到 |
| 某书 PDF+EPUB 都有 | PDF 优先 | 分数高者胜出 |

### 测试验证

修复后运行调试脚本 `scripts/debug-book_delete.ts`，预期结果：
- Two Cities 这本书（EPUB 格式）应被正确匹配

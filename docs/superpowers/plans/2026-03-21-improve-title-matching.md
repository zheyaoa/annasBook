# 改进标题分段匹配逻辑

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改进 `isTitleMatch` 函数，支持标题分段顺序不一致时的匹配。

**Architecture:** 在现有分段匹配逻辑基础上，新增"任意分段匹配"规则，处理 Excel 标题与网页标题分段顺序不同的情况。

**Tech Stack:** TypeScript

---

## Chunk 1: 修改匹配逻辑

### Task 1: 改进 isTitleMatch 函数

**Files:**
- Modify: `src/searcher.ts:243-264`

- [ ] **Step 1: 编写验证脚本**

创建测试脚本验证当前行为：

```typescript
// test/title-match-test.ts
import { Searcher } from '../src/searcher.js';
import { Config } from '../src/types.js';
import { HttpClient } from '../src/http-client.js';

const config: Config = {
  apiKey: 'test',
  baseUrl: 'https://annas-archive.gl',
  excelFile: '',
  downloadDir: '',
  rateLimitMs: 1000,
  requestTimeoutMs: 30000,
  downloadTimeoutMs: 300000,
  maxRetries: 3,
};

const httpClient = new HttpClient(config);
const searcher = new Searcher(config, httpClient);

// 测试用例
const testCases = [
  // 应该匹配 - 新方案需要修复的（分段顺序不一致）
  { search: 'Li: Beyond Oneness and Difference', result: 'Beyond Oneness and Difference: Li and Coherence in Chinese Buddhist Thought', expected: true },
  // 应该匹配 - 已能工作的（完整匹配）
  { search: 'Three Streams', result: 'Three Streams : Confucian Reflections on Learning', expected: true },
  { search: 'Confucius Now', result: 'Confucius Now', expected: true },
  { search: 'The Tao Encounters the West', result: 'The Tao Encounters the West', expected: true },
  // 应该匹配 - 包含匹配（现有行为）
  { search: 'The Way', result: 'The Way of Zen', expected: true },
  // 不应该匹配的（完全不同的书）
  { search: 'Confucius', result: 'Confucianism: A Very Short Introduction', expected: false },
  { search: 'Dao', result: 'Tao Te Ching', expected: false },
  // 边界情况：所有分段都 < 3 字符
  { search: 'A: B', result: 'C: D', expected: false },
];

console.log('=== isTitleMatch 测试 ===\n');

let passed = 0, failed = 0;
for (const tc of testCases) {
  // 使用反射调用私有方法（测试用）
  const match = (searcher as any).isTitleMatch(tc.search, tc.result);
  const status = match === tc.expected ? '✓' : '✗';
  if (match === tc.expected) passed++; else failed++;
  console.log(`${status} "${tc.search}" → "${tc.result.substring(0, 40)}..."`);
  console.log(`   期望: ${tc.expected}, 实际: ${match}\n`);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: 运行测试验证当前行为**

Run: `npx tsx test/title-match-test.ts`
Expected: 1 个失败（`Li: Beyond Oneness and Difference` 案例，旧代码因分段顺序不一致而无法匹配）

- [ ] **Step 3: 修改 isTitleMatch 函数**

修改 `src/searcher.ts` 第 243-264 行。

**关键说明：** 新增的"任意分段匹配"逻辑能解决问题，因为：
- 搜索 `Li: Beyond Oneness and Difference` 的分段为 `["li", "beyondonenessanddifference"]`
- 结果 `Beyond Oneness and Difference: Li and Coherence...` 的分段为 `["beyondonenessanddifference", "liandcoherenceinchinesebuddhistthought"]`
- 虽然 `"li"` 因长度 < 3 被跳过，但 `"beyondonenessanddifference"` 可以匹配成功

```typescript
// Check if title matches (segment matching)
private isTitleMatch(searchTitle: string, resultTitle: string): boolean {
  const normSearch = this.normalize(searchTitle);
  const normResult = this.normalize(resultTitle);

  // Skip empty normalized titles (e.g., Chinese-only titles when searching English)
  if (!normResult || !normSearch) return false;

  // Full match
  if (normResult.includes(normSearch) || normSearch.includes(normResult)) return true;

  // Segment matching: split by :;—-
  const separators = /[:;—\-]/;
  const searchSegments = searchTitle.split(separators).map(s => this.normalize(s.trim()));
  const resultSegments = resultTitle.split(separators).map(s => this.normalize(s.trim()));

  // Check if main title (first segment) matches
  if (searchSegments[0] && resultSegments[0] && searchSegments[0] === resultSegments[0]) {
    return true;
  }

  // Any segment matching: handle reordering
  for (const searchSeg of searchSegments) {
    if (!searchSeg || searchSeg.length < 3) continue; // Skip short segments
    for (const resultSeg of resultSegments) {
      if (!resultSeg) continue;
      if (searchSeg === resultSeg) {
        return true;
      }
    }
  }

  return false;
}
```

- [ ] **Step 4: 运行测试验证新行为**

Run: `npx tsx test/title-match-test.ts`
Expected: 全部通过（0 失败）

- [ ] **Step 5: 保留测试文件**

测试文件 `test/title-match-test.ts` 保留用于回归测试。

- [ ] **Step 6: 提交更改**

```bash
git add src/searcher.ts test/title-match-test.ts
git commit -m "fix: improve title matching to handle segment reordering"
```

---

## 完成检查

- [ ] 所有测试通过
- [ ] 代码已提交
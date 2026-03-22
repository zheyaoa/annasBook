# 搜索匹配算法改进方案

## 一、问题诊断总结

### 1.1 数据分析结果

| 指标 | 数值 |
|------|------|
| 总记录数 | 116 条 |
| 已下载成功 | 71 条 (61.2%) |
| 未找到 | 24 条 (20.7%) |
| 手动能找到但程序失败 | 21 条 |

### 1.2 失败原因统计

| 失败原因 | 出现次数 |
|----------|----------|
| 表格标题不全 | 8 次 |
| 网页标题包含书籍系列 | 9 次 |
| 作者信息问题（顺序/标注/错误） | 10 次 |
| 书籍版本不同 | 2 次 |

### 1.3 关键发现

通过模拟测试发现：
- **标题匹配逻辑已经很宽松**：6个失败案例的标题匹配全部成功
- **问题主要在作者匹配**：多作者部分匹配失败
  - 搜索: "David Jones; Jinli He (Editors)"
  - 结果: "David Jones"
  - 当前逻辑匹配失败

---

## 二、改造目标

1. **解决多作者部分匹配问题**
2. **改进作者姓名顺序和简写匹配**
3. **启用 LLM 兜底匹配**
4. **保持向前兼容，不影响现有71个成功案例**

---

## 三、具体改造内容

### 3.1 新增方法：`stripSeriesName`

剥离标题中的系列名称。

```typescript
// 新增：剥离系列名称
private stripSeriesName(title: string): string {
  // 已知系列名称模式
  const seriesPatterns = [
    /\s*\([^)]*series[^)]*\)/gi,           // (SUNY series in Chinese Philosophy)
    /\s*\([^)]*Series[^)]*\)/gi,           // (Cambridge Studies in...)
    /\s*\(SUNY series[^)]*\)/gi,           // (SUNY series...)
  ];

  let stripped = title;
  for (const pattern of seriesPatterns) {
    stripped = stripped.replace(pattern, '');
  }
  return stripped.trim();
}
```

**作用**：让 `Li: Beyond Oneness and Difference (SUNY series...)` 更容易匹配 `Li: Beyond Oneness and Difference`

---

### 3.2 改进方法：`isAuthorMatch`

支持多作者部分匹配和姓名顺序。

```typescript
// 改进：支持多作者部分匹配
private isAuthorMatch(searchAuthor: string, resultAuthor: string): boolean {
  const normResult = this.normalize(resultAuthor);

  // 拆分搜索作者（按分号分隔，移除编辑标注）
  const searchAuthors = searchAuthor
    .split(';')
    .map(a => {
      // 移除 (Editor), (Editors) 等标注
      return a.replace(/\(.*?\)/g, '').trim();
    })
    .filter(a => a.length > 0);

  // 逐个匹配
  for (const author of searchAuthors) {
    const normSearch = this.normalize(author);

    // 全名匹配
    if (normResult.includes(normSearch)) return true;

    // 姓/名顺序匹配：Chenyang Li ↔ Li, Chenyang
    const parts = author.split(/\s+/).filter(p => p.length > 1);
    if (parts.length >= 2) {
      // 尝试交换姓和名
      const reversed = parts.slice().reverse().join('');
      const normReversed = reversed.toLowerCase().replace(/\W+/g, '');
      if (normResult.includes(normReversed)) return true;

      // 姓氏匹配
      const surname = parts[parts.length - 1].toLowerCase();
      if (surname.length > 2 && normResult.includes(surname)) return true;

      // 名字匹配（处理简写）
      const firstName = parts[0];
      if (firstName.length <= 3) {
        // 可能是简写，检查结果作者是否以完整名字开头
        const firstInitial = firstName.charAt(0).toLowerCase();
        if (normResult.charAt(0) === firstInitial) {
          // 进一步验证姓氏
          if (normResult.includes(surname)) return true;
        }
      }
    }
  }

  return false;
}
```

**改进点**：
1. 拆分多作者，任一匹配即可
2. 支持姓/名顺序交换
3. 支持简写扩展 (Wm. → William)

---

### 3.3 改进方法：`isTitleMatch`

增加系列名称剥离。

```typescript
// 改进：增加系列名称剥离
private isTitleMatch(searchTitle: string, resultTitle: string): boolean {
  // 剥离系列名称
  const strippedResult = this.stripSeriesName(resultTitle);

  const normSearch = this.normalize(searchTitle);
  const normResult = this.normalize(strippedResult);

  if (!normResult || !normSearch) return false;

  // 全匹配
  if (normResult.includes(normSearch) || normSearch.includes(normResult)) return true;

  // 段落匹配
  const separators = /[:;—\-]/;
  const searchSegments = searchTitle.split(separators).map(s => this.normalize(s.trim()));
  const resultSegments = strippedResult.split(separators).map(s => this.normalize(s.trim()));

  // 主标题匹配
  if (searchSegments[0] && resultSegments[0] && searchSegments[0] === resultSegments[0]) {
    return true;
  }

  // 新增：子串匹配（搜索标题是结果标题的一部分）
  if (normSearch.length > 10 && normResult.includes(normSearch.substring(0, Math.floor(normSearch.length * 0.7)))) {
    return true;
  }

  return false;
}
```

---

### 3.4 降低匹配阈值

```typescript
// 改进前
let validCandidates = scoredCandidates.filter(c => c.score >= 50);

// 改进后
const SCORE_THRESHOLD = 40;  // 可配置
let validCandidates = scoredCandidates.filter(c => c.score >= SCORE_THRESHOLD);
```

---

### 3.5 启用 LLM 兜底匹配

移除调试代码，启用实际 API 调用。

```typescript
private async llmBatchMatch(searchTitle: string, candidates: SearchResult[]): Promise<SearchResult | null> {
  const openaiEnabled = this.config.openai?.enable !== false && this.config.openai?.apiKey;
  if (!openaiEnabled || candidates.length === 0) {
    return null;
  }

  // 构建候选列表（包含更多信息）
  const candidateList = candidates.map((c, i) =>
    `${i + 1}. "${c.title}" by ${c.author || 'Unknown'} (${c.size})`
  ).join('\n');

  const prompt = `Determine which candidate refers to the same book as the search title.
A book may have different subtitle, series name, or edition. Focus on the main title.

Search: "${searchTitle}"

Candidates:
${candidateList}

Reply only the number of the best match, or "none" if no match.`;

  try {
    let apiUrl = this.config.openai?.baseUrl || 'https://api.openai.com/v1';
    if (!apiUrl.includes('/chat/completions')) {
      apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openai?.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.openai?.model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      logger.warn(`LLM API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
    logger.info(`LLM response for "${searchTitle}": ${content}`);

    if (content === 'none') return null;

    const matchIndex = parseInt(content) - 1;
    if (matchIndex >= 0 && matchIndex < candidates.length) {
      return candidates[matchIndex];
    }

    return null;
  } catch (error) {
    logger.warn(`LLM batch match failed: ${(error as Error).message}`);
    return null;
  }
}
```

---

## 四、改造文件清单

| 文件 | 改动内容 |
|------|----------|
| `src/searcher.ts` | 主要改动文件 |

### 具体改动位置

| 行号范围 | 改动类型 | 说明 |
|----------|----------|------|
| 195-205 | 改进 | `normalize` 方法（可选） |
| 207-240 | 改进 | `isAuthorMatch` 方法 |
| 243-264 | 改进 | `isTitleMatch` 方法 |
| 267-337 | 改进 | `llmBatchMatch` 方法 |
| 417-418 | 改进 | 降低阈值 |
| 新增 | 新增 | `stripSeriesName` 方法 |

---

## 五、向前兼容性分析

### 5.1 成功案例影响评估

| 改动项 | 对71个成功案例的影响 |
|--------|---------------------|
| 系列名称剥离 | 无影响，只会改善匹配 |
| 多作者匹配改进 | 无影响，逻辑更宽松 |
| 阈值降低 | 无影响（成功案例分数≥60） |
| LLM 兜底 | 无影响（只在失败时触发） |

### 5.2 风险控制

1. **添加详细日志**：记录匹配过程，便于调试
2. **可配置阈值**：将阈值改为配置项
3. **渐进式改进**：先改进作者匹配，观察效果后再启用 LLM

---

## 六、预期效果

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 多作者部分匹配 | ✗ 失败 | ✓ 成功 |
| 姓名顺序不同 | 部分成功 | ✓ 成功 |
| 系列名称干扰 | ✓ 成功（已有子串匹配） | ✓ 成功（更稳定） |
| 标题不完整 | ✓ 成功（已有子串匹配） | ✓ 成功 |
| LLM 兜底 | 未启用 | ✓ 启用 |

**预期成功率提升**：61.2% → 75%+

---

## 七、实施步骤

1. **备份现有代码**
2. **实现 `stripSeriesName` 方法**
3. **改进 `isAuthorMatch` 方法**
4. **改进 `isTitleMatch` 方法**
5. **降低匹配阈值**
6. **启用 LLM 兜底匹配**
7. **使用失败案例进行验证测试**
8. **使用成功案例进行回归测试**

---

## 八、验证测试计划

### 8.1 回归测试

使用现有71个成功案例验证改进后仍能匹配成功。

### 8.2 效果测试

使用21个"手动能找到但程序失败"的案例测试改进效果。

### 8.3 测试命令

```bash
# 回归测试
npm start -- --file src/assets/已手动查找-海外中国.xlsx

# 单独测试某本书
npm start -- --title "Returning to Zhu Xi" --author "David Jones" --lang en
```
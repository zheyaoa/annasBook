# 下载重试与链接记录功能设计

## Context

用户希望在下载失败（超时）时自动重试，并在 Excel 中记录下载链接以便下次直接使用，避免重复调用 API。

---

## 数据流程

```
检查 Excel 是否有下载链接
    │
    ├─ 有 → 直接使用现有下载链接
    │
    └─ 无 → 调用 API 获取下载链接
              │
              └─ 记录到 Excel

下载文件（使用链接）
    │
    ├─ 成功 → 完成
    │
    └─ 超时 → 重试最多 3 次，间隔 10 秒
```

---

## 详细实现

### 1. `src/types.ts`

```typescript
export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  downloadUrl?: string;  // 新增：API 返回的下载链接
}

export interface BookInfo {
  rowIndex: number;
  language: string;
  chineseTitle: string;
  englishTitle: string;
  chineseAuthor: string;
  englishAuthor: string;
  confidence: string;
  downloadStatus: string;
  bookLink: string;
  downloadUrl?: string;  // 新增：Excel 中已有的下载链接
}
```

---

### 2. `src/excel-reader.ts`

#### 2.1 修改 `readBooks()` 方法

在列映射中添加"下载链接"列的读取：

```typescript
// 在 colMap 构建后，读取下载链接列
downloadUrl: this.getCellValue(row, colMap['下载链接'] || 'L'),
```

列顺序参考：
```
A: 语言 | B: 书名 | C: Book title | D: 作者 | E: Author | ... | J: 下载状态 | K: 书籍链接 | L: 下载链接
```

#### 2.2 新增 `updateDownloadUrl()` 方法

```typescript
updateDownloadUrl(rowIndex: number, downloadUrl: string): void {
  const range = XLSX.utils.decode_range(this.sheet['!ref'] || 'A1');

  // 查找"下载链接"列
  const colMap: Record<string, string> = {};
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
    if (cell && cell.v !== undefined) {
      colMap[String(cell.v)] = XLSX.utils.encode_col(col);
    }
  }

  let urlCol = colMap['下载链接'];
  if (!urlCol) {
    // 列不存在，创建新列
    const newColIndex = range.e.c + 1;
    urlCol = XLSX.utils.encode_col(newColIndex);
    this.sheet[`${urlCol}1`] = { t: 's', v: '下载链接' };
    // 更新 sheet 范围
    this.sheet['!ref'] = XLSX.utils.encode_range({
      s: range.s,
      e: { r: range.e.r, c: newColIndex }
    });
  }

  this.sheet[`${urlCol}${rowIndex + 1}`] = { t: 's', v: downloadUrl };
}
```

---

### 3. `src/downloader.ts`

#### 3.1 新增 sleep 辅助函数

```typescript
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

#### 3.2 修改 `download()` 方法

```typescript
async download(book: BookInfo, result: SearchResult): Promise<DownloadResult> {
  const filename = this.generateFilename(book, result);
  const destPath = path.join(this.config.downloadDir, filename);

  // 文件已存在，跳过下载
  if (fs.existsSync(destPath)) {
    logger.info(`File already exists: ${filename}`);
    this.consecutiveFailures = 0;
    return { success: true, filePath: destPath };
  }

  logger.info(`Downloading: ${filename}`);

  // 优先使用 Excel 中已有的下载链接
  let downloadUrl = book.downloadUrl;

  if (!downloadUrl) {
    // 没有现成链接，调用 API 获取
    const apiResult = await this.tryFastDownloadApi(result.md5);
    if (!apiResult.success || !apiResult.downloadUrl) {
      this.consecutiveFailures++;
      return { success: false, error: apiResult.error || 'API download failed' };
    }
    downloadUrl = apiResult.downloadUrl;
  } else {
    logger.info(`Using cached download URL from Excel`);
  }

  // 重试下载逻辑
  const maxRetries = 3;
  let lastError: string = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await this.httpClient.download(downloadUrl, destPath);

      // 验证文件
      const validationResult = this.validateDownloadedFile(destPath, result.format);
      if (!validationResult.valid) {
        fs.unlinkSync(destPath);
        return { success: false, error: validationResult.error, downloadUrl };
      }

      // 处理格式修正
      const actualFormat = validationResult.actualFormat || result.format;
      if (actualFormat !== result.format) {
        const newPath = destPath.replace(/\.[^.]+$/, `.${actualFormat}`);
        if (!fs.existsSync(newPath)) {
          fs.renameSync(destPath, newPath);
          logger.info(`Format corrected: ${result.format} -> ${actualFormat}`);
        }
        this.consecutiveFailures = 0;
        const actualSize = fs.statSync(newPath).size;
        logger.info(`Downloaded: ${path.basename(newPath)} (${actualSize} bytes)`);
        return { success: true, filePath: newPath, downloadUrl };
      }

      this.consecutiveFailures = 0;
      const actualSize = fs.statSync(destPath).size;
      logger.info(`Downloaded: ${filename} (${actualSize} bytes)`);
      return { success: true, filePath: destPath, downloadUrl };

    } catch (error) {
      const errorMsg = (error as Error).message;
      const isTimeout = errorMsg.toLowerCase().includes('timeout');

      if (isTimeout && attempt < maxRetries) {
        logger.warn(`Download timeout, retrying in 10s (attempt ${attempt}/${maxRetries})`);
        await sleep(10000);
        continue;
      }

      lastError = errorMsg;
      break;  // 非超时错误，不重试
    }
  }

  // 下载失败
  this.consecutiveFailures++;
  logger.error(`Download failed: ${lastError}`);

  if (this.consecutiveFailures >= 5) {
    logger.error('5 consecutive download failures. Please check network, API key, or cookies.');
    throw new Error('CONSECUTIVE_FAILURES');
  }

  return { success: false, error: lastError, downloadUrl };
}
```

---

### 4. `src/index.ts`

在下载完成后更新 Excel 中的下载链接：

```typescript
// 下载书籍
const downloadResult = await downloader.download(book, searchResult);

// 更新 Excel 状态
if (downloadResult.success) {
  excelReader.updateStatus(book.rowIndex, '已下载', searchResult.md5);
} else {
  excelReader.updateStatus(book.rowIndex, `失败: ${downloadResult.error}`, searchResult.md5);
}

// 无论成功失败，都记录下载链接
if (downloadResult.downloadUrl) {
  excelReader.updateDownloadUrl(book.rowIndex, downloadResult.downloadUrl);
}
```

---

## 重试参数总结

| 参数 | 值 |
|------|-----|
| 触发条件 | 仅下载超时 |
| 最大重试次数 | 3 次 |
| 重试间隔 | 10 秒（固定） |
| 非超时错误 | 不重试，直接返回失败 |

---

## Excel 列位置

```
... | J: 下载状态 | K: 书籍链接 | L: 下载链接
```

"下载链接"列放在"书籍链接"列之后。如果列不存在，首次写入时自动创建。

---

## 验证方式

1. **重试逻辑测试**：模拟超时场景，验证日志中是否显示重试信息
2. **链接记录测试**：下载后检查 Excel 中是否正确记录下载链接
3. **链接复用测试**：对已有下载链接的书籍运行，验证日志显示 "Using cached download URL from Excel" 且不调用 API
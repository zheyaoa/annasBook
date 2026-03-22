# Fast Download API 改进实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改进下载逻辑，优先使用 JSON API，失败时降级到 cookies 方式。

**Architecture:** 在 Downloader 类中添加 `tryFastDownloadApi()` 方法调用新 API，修改 `download()` 方法实现降级逻辑。

**Tech Stack:** TypeScript, axios

---

## Chunk 1: 类型和基础设施

### Task 1: 添加 API 响应类型定义

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: 添加 FastDownloadResponse 接口**

在 `src/types.ts` 文件末尾添加：

```typescript
// Fast download API response
export interface FastDownloadResponse {
  download_url: string | null;
  error?: string;
  account_fast_download_info?: Record<string, unknown>;
}

// Result of trying fast download API
export interface FastDownloadApiResult {
  success: boolean;
  downloadUrl?: string;
  shouldFallback?: boolean;
  error?: string;
}
```

- [ ] **Step 2: 验证类型编译通过**

Run: `npm run build`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add FastDownloadResponse types"
```

---

## Chunk 2: API 调用逻辑

### Task 2: 实现 tryFastDownloadApi 方法

**Files:**
- Modify: `src/downloader.ts`

- [ ] **Step 1: 更新导入语句**

将 `src/downloader.ts` 第3行的导入改为：

```typescript
import { Config, SearchResult, BookInfo, DownloadResult, FastDownloadResponse, FastDownloadApiResult } from './types.js';
```

- [ ] **Step 2: 添加 tryFastDownloadApi 方法**

在 `src/downloader.ts` 的 `Downloader` 类中，在 `download` 方法之前添加：

```typescript
  /**
   * Try the JSON API for fast download.
   * Returns download URL if successful, or indicates whether to fallback.
   */
  private async tryFastDownloadApi(md5: string): Promise<FastDownloadApiResult> {
    const url = `${this.config.baseUrl}/dyn/api/fast_download.json?md5=${md5}&key=${this.config.apiKey}`;

    try {
      logger.info(`[API] Trying JSON API: ${url.replace(this.config.apiKey, '***')}`);
      const response = await this.httpClient.get(url);

      // Check for CAPTCHA
      if (this.httpClient.isCaptchaResponse(response.body, response.status)) {
        logger.warn('[API] CAPTCHA detected, falling back to cookies');
        return { success: false, shouldFallback: true, error: 'CAPTCHA detected' };
      }

      // Parse JSON response
      const data: FastDownloadResponse = JSON.parse(response.body);

      if (data.download_url) {
        logger.info('[API] Got download URL from API');
        return { success: true, downloadUrl: data.download_url };
      }

      // Handle API errors
      const error = data.error || 'Unknown error';
      logger.warn(`[API] API error: ${error}`);

      // Determine if we should fallback
      const fallbackErrors = ['invalid_key', 'membership_required'];
      const shouldFallback = fallbackErrors.includes(error) || response.status >= 500;

      return {
        success: false,
        shouldFallback,
        error
      };
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`[API] API request failed: ${errorMsg}`);

      // Network errors should fallback
      return {
        success: false,
        shouldFallback: true,
        error: errorMsg
      };
    }
  }
```

- [ ] **Step 3: 验证编译通过**

Run: `npm run build`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/downloader.ts
git commit -m "feat: add tryFastDownloadApi method"
```

---

## Chunk 3: 下载流程重构

### Task 3: 修改 download 方法实现降级逻辑

**Files:**
- Modify: `src/downloader.ts`

- [ ] **Step 1: 重写 download 方法**

将 `src/downloader.ts` 的 `download` 方法（第68-127行）替换为：

```typescript
  async download(book: BookInfo, result: SearchResult): Promise<DownloadResult> {
    // Generate filename first
    const filename = this.generateFilename(book, result);
    const destPath = path.join(this.config.downloadDir, filename);

    // Check if file already exists
    if (fs.existsSync(destPath)) {
      logger.info(`File already exists: ${filename}`);
      this.consecutiveFailures = 0;
      return { success: true, filePath: destPath };
    }

    logger.info(`Downloading: ${filename}`);

    // Try JSON API first
    const apiResult = await this.tryFastDownloadApi(result.md5);

    let downloadUrl: string;
    let usedFallback = false;

    if (apiResult.success && apiResult.downloadUrl) {
      // Use API download URL
      downloadUrl = apiResult.downloadUrl;
    } else if (apiResult.shouldFallback) {
      // Fallback to cookies-based download
      logger.info('[Download] Falling back to cookies-based download');
      downloadUrl = `${this.config.baseUrl}/fast_download/${result.md5}/0/0`;
      usedFallback = true;
    } else {
      // Non-recoverable error
      this.consecutiveFailures++;
      return { success: false, error: apiResult.error || 'Download failed' };
    }

    try {
      // Download file
      const finalUrl = await this.httpClient.download(downloadUrl, destPath);

      // Verify the downloaded file is valid (not an HTML error page)
      const validationResult = this.validateDownloadedFile(destPath, result.format);
      if (!validationResult.valid) {
        // Delete the invalid file
        fs.unlinkSync(destPath);
        return { success: false, error: validationResult.error };
      }

      // Handle format correction if actual format differs from expected
      const actualFormat = validationResult.actualFormat || result.format;
      if (actualFormat !== result.format) {
        const newPath = destPath.replace(/\.[^.]+$/, `.${actualFormat}`);
        if (!fs.existsSync(newPath)) {
          fs.renameSync(destPath, newPath);
          logger.info(`Format corrected: ${result.format} -> ${actualFormat}`);
        }
        this.consecutiveFailures = 0;
        const actualSize = fs.statSync(newPath).size;
        logger.info(`Downloaded: ${path.basename(newPath)} (${actualSize} bytes)${usedFallback ? ' [fallback]' : ''}`);
        return { success: true, filePath: newPath };
      }

      this.consecutiveFailures = 0;
      const actualSize = fs.statSync(destPath).size;
      logger.info(`Downloaded: ${filename} (${actualSize} bytes)${usedFallback ? ' [fallback]' : ''}`);

      return { success: true, filePath: destPath };
    } catch (error) {
      this.consecutiveFailures++;
      const errorMsg = (error as Error).message;
      logger.error(`Download failed: ${errorMsg}`);

      if (this.consecutiveFailures >= 5) {
        logger.error('5 consecutive download failures. Please check network, API key, or cookies.');
        throw new Error('CONSECUTIVE_FAILURES');
      }

      return { success: false, error: errorMsg };
    }
  }
```

- [ ] **Step 2: 验证编译通过**

Run: `npm run build`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/downloader.ts
git commit -m "feat: implement API-first download with cookies fallback"
```

---

## Chunk 4: 清理和验证

### Task 4: 清理不再需要的代码

**Files:**
- Modify: `src/downloader.ts`

- [ ] **Step 1: 删除不再使用的 handleApiError 方法**

删除 `src/downloader.ts` 中的 `handleApiError` 方法（原第129-154行），因为错误处理已整合到 `tryFastDownloadApi` 中。

- [ ] **Step 2: 验证编译通过**

Run: `npm run build`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/downloader.ts
git commit -m "refactor: remove unused handleApiError method"
```

### Task 5: 最终验证

- [ ] **Step 1: 完整构建验证**

Run: `npm run build`
Expected: 无错误

- [ ] **Step 2: 手动测试（可选）**

运行程序测试下载功能：
```bash
npm start -- --title "Test Book" --author "Test Author" --lang en
```

---

## 变更摘要

| 文件 | 变更 |
|------|------|
| `src/types.ts` | 添加 `FastDownloadResponse` 和 `FastDownloadApiResult` 接口 |
| `src/downloader.ts` | 添加 `tryFastDownloadApi()` 方法，重写 `download()` 方法，删除 `handleApiError()` |
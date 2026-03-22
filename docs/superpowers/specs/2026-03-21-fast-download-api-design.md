# Fast Download API 改进设计

## 概述

改进 Anna's Archive 下载逻辑，优先使用官方 JSON API，失败时降级到现有的 cookies 方式。

## 背景

Anna's Archive 提供了稳定的 JSON API 用于会员下载：
```
GET /dyn/api/fast_download.json?md5={md5}&key={secret_key}
```

相比现有的 `/fast_download/{md5}/0/0` HTML 端点，JSON API 有以下优势：
- 结构化错误响应
- 不依赖 cookies 文件
- 官方支持，更稳定

## 设计

### 下载流程

```
download(book, result)
       │
       ▼
┌─────────────────────┐
│ 调用 JSON API       │
│ /dyn/api/fast_download.json
└─────────┬───────────┘
          │
    ┌─────▼─────┐
    │ API 成功? │
    └─────┬─────┘
     yes  │  no
          │   │
          │   ▼
          │  ┌───────────────────┐
          │  │ 检查错误类型       │
          │  │ 可降级?           │
          │  └─────────┬─────────┘
          │       yes  │  no
          │            │   │
          │            ▼   ▼
          │     ┌──────────┐ 返回错误
          │     │ 降级到    │
          │     │ cookies  │
          │     │ 方式下载  │
          │     └────┬─────┘
          │          │
          ◄──────────┘
          │
          ▼
    ┌──────────────┐
    │ 执行下载      │
    │ httpClient.download
    └──────────────┘
```

### 降级策略

| 错误类型 | 是否降级 | 原因 |
|----------|----------|------|
| `invalid_key` | 是 | API key 无效，cookies 可能有效 |
| `membership_required` | 是 | 账户无会员，尝试 cookies 方式 |
| 网络超时/错误 | 是 | 可能是 API 临时问题 |
| `Invalid md5` | 否 | MD5 格式错误，代码问题 |
| `not_found` | 否 | 书籍不存在，无法恢复 |

### 接口变更

**新增类型** (`types.ts`):
```typescript
interface FastDownloadResponse {
  download_url: string | null;
  error?: string;
  account_fast_download_info?: {
    // 会员信息，可选
  };
}
```

**配置** (`config.json`):
- `apiKey`: 用于 JSON API 的 secret key（已有字段，复用）

### 实现细节

**Downloader 类修改**:

1. 新增 `tryFastDownloadApi()` 方法：
   - 调用 JSON API
   - 解析响应
   - 返回 `{ success: boolean, downloadUrl?: string, shouldFallback?: boolean, error?: string }`

2. 修改 `download()` 方法：
   - 先调用 `tryFastDownloadApi()`
   - 根据结果决定直接下载或降级

3. 保留现有 cookies 方式作为降级路径

## 文件变更

| 文件 | 变更 |
|------|------|
| `src/types.ts` | 添加 `FastDownloadResponse` 类型 |
| `src/downloader.ts` | 添加 JSON API 调用逻辑和降级机制 |

## 测试场景

1. **正常下载**: API 返回有效 download_url
2. **API 降级**: invalid_key 错误，回退到 cookies
3. **不可恢复错误**: not_found 错误，直接返回失败
4. **格式验证**: 验证下载的文件格式正确
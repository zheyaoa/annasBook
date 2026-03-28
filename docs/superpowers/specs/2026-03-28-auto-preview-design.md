# Auto Preview After Download - Design Specification

## Overview

下载 PDF 成功后自动生成第一页预览图。

## Trigger Conditions

- PDF 下载成功后（EPUB 转 PDF 成功后也算）
- 仅对 PDF 格式生成预览

## Data Flow

```
Downloader.download() → 成功 → [如果是 PDF] Previewer.generatePreview() → 返回 result
                              ↓
                        失败 → logger.warn() → 继续返回 result（不影响下载）
```

## Implementation

### File: `src/downloader.ts`

1. 导入 `Previewer`
2. 在 `download()` 方法成功返回前（line 165），对 PDF 格式调用 `generatePreview()`

```typescript
// 下载成功后，如果是 PDF，生成预览
if (actualFormat === 'pdf') {
  const previewer = new Previewer();
  const previewResult = await previewer.generatePreview({ inputPath: finalPath });
  if (!previewResult.success) {
    logger.warn(`Preview generation failed: ${previewResult.error}`);
  }
}
```

### Error Handling

- Preview 生成失败只打印 `logger.warn()`，不影响下载结果
- `pdftoppm` 未安装：`logger.warn('pdftoppm not found. Install: brew install poppler (macOS)')`

### Previewer Already Exists

`src/previewer.ts` 已实现，只需调用其 `generatePreview()` 方法。

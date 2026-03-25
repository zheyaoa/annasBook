# 修复搜索结果格式信息解析

## 问题

`parseSearchResults` 方法使用 `$parent.text()` 获取整个父元素的文本，导致：

1. 获取的文本包含文件路径、标题、作者、出版社等无关内容
2. `parseFormatInfo` 无法正确解析格式信息（PDF/EPUB、大小、语言、年份）
3. `sizeBytes` 字段始终为 0

## 根因

HTML 结构中，格式信息在单独的 div 中：

```html
<div class="text-gray-800 dark:text-slate-400 font-semibold text-sm leading-[1.2] mt-2">
  Chinese [zh] · PDF · 13.8MB · 1800 · 📗 Book (unknown) · 🚀/ia/zlib
</div>
```

当前代码用 `$parent.text()` 获取整个父元素文本，混杂了其他内容。

## 解决方案

### 1. 修改 `parseSearchResults` 方法

用 CSS 选择器精确定位格式信息 div：

```typescript
const $formatDiv = $parent.find('.text-gray-800.font-semibold.text-sm');
const formatText = $formatDiv.text() || '';
const formatInfo = this.parseFormatInfo(formatText);
```

### 2. 扩展 `parseFormatInfo` 支持更多格式

支持：PDF、EPUB、DJVU、ZIP

```typescript
if (lowerPart === 'pdf' || lowerPart === 'epub' || lowerPart === 'djvu' || lowerPart === 'zip') {
  format = lowerPart;
}
```

### 3. 更新类型定义

`types.ts` 中的 `SearchResult.format` 类型从 `'pdf' | 'epub'` 扩展为 `'pdf' | 'epub' | 'djvu' | 'zip'`。

## 影响范围

- `src/searcher.ts`：修改 `parseSearchResults`、`parseFormatInfo` 方法
- `src/types.ts`：更新 `SearchResult` 接口的 `format` 字段类型

## 验证

运行搜索测试，确认格式信息正确解析：
- language 正确（如 "Chinese [zh]"）
- format 正确（PDF/EPUB/DJVU/ZIP）
- size 和 sizeBytes 正确
- year 正确
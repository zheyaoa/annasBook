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

删除调试语句 `console.log('parentText:',parentText)`。

### 2. 扩展 `parseFormatInfo` 支持更多格式

支持：PDF、EPUB、DJVU、ZIP

```typescript
if (lowerPart === 'pdf' || lowerPart === 'epub' || lowerPart === 'djvu' || lowerPart === 'zip') {
  format = lowerPart;
}
```

更新方法返回类型，使用共享类型定义。

### 3. 更新 `extractFormat` 方法

当前 `extractFormat` 方法只支持 PDF/EPUB，需扩展支持 DJVU/ZIP：

```typescript
if (text === 'DJVU') return 'djvu';
if (text === 'ZIP') return 'zip';
```

### 4. 更新类型定义

在 `types.ts` 中定义共享格式类型：

```typescript
export type BookFormat = 'pdf' | 'epub' | 'djvu' | 'zip';
```

更新以下接口使用该类型：
- `SearchResult.format`
- `BookDetailsExtended.format`

## 影响范围

- `src/types.ts`：定义 `BookFormat` 类型，更新 `SearchResult`、`BookDetailsExtended` 接口
- `src/searcher.ts`：
  - 修改 `parseSearchResults` 方法（精确定位格式 div，删除调试语句）
  - 修改 `parseFormatInfo` 方法（扩展格式支持，更新返回类型）
  - 修改 `extractFormat` 方法（扩展格式支持）

## 验证

运行搜索测试，确认格式信息正确解析：
- language 正确（如 "Chinese [zh]"）
- format 正确（PDF/EPUB/DJVU/ZIP）
- size 和 sizeBytes 正确
- year 正确
# Multi-Sheet Excel 批量下载设计

## 概述

修改批量下载逻辑，支持 Excel 文件中的多个 sheet，每个 sheet 的书籍下载到独立的子文件夹中。

## 需求

- 自动处理 Excel 文件中的所有 sheets（共 17 个）
- 每个 sheet 创建独立的下载子文件夹
- 文件夹名称使用 sheet 名称，移除特殊字符
- 自动为没有"下载状态"列的 sheet 添加该列
- 状态更新写回原 Excel 文件对应 sheet

## 设计

### 1. ExcelReader 类扩展

**新增属性：**

```typescript
private currentSheetName: string;
```

**新增方法：**

```typescript
// 获取所有 sheet 名称
getAllSheetNames(): string[] {
  return this.workbook.SheetNames;
}

// 切换当前操作的 sheet
selectSheet(sheetName: string): void {
  if (!this.workbook.SheetNames.includes(sheetName)) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }
  this.currentSheetName = sheetName;
  this.sheet = this.workbook.Sheets[sheetName];
  this.validateColumns();
}

// 确保有"下载状态"列，没有则创建
ensureStatusColumn(): void {
  const range = XLSX.utils.decode_range(this.sheet['!ref'] || 'A1');
  const colMap: Record<string, string> = {};

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
    if (cell && cell.v !== undefined) {
      colMap[String(cell.v)] = XLSX.utils.encode_col(col);
    }
  }

  if (!colMap['下载状态']) {
    const newColIndex = range.e.c + 1;
    const newCol = XLSX.utils.encode_col(newColIndex);
    this.sheet[`${newCol}1`] = { t: 's', v: '下载状态' };
    this.sheet['!ref'] = XLSX.utils.encode_range({
      s: range.s,
      e: { r: range.e.r, c: newColIndex }
    });
  }
}

// 获取当前 sheet 名称
getCurrentSheetName(): string {
  return this.currentSheetName;
}
```

**修改构造函数：**

```typescript
constructor(filePath: string, sheetName?: string) {
  this.filePath = filePath;
  this.workbook = XLSX.readFile(filePath);

  if (sheetName) {
    this.selectSheet(sheetName);
  } else {
    // 向后兼容：默认使用第一个 sheet
    this.currentSheetName = this.workbook.SheetNames[0];
    this.sheet = this.workbook.Sheets[this.currentSheetName];
    this.validateColumns();
  }
}
```

### 2. 工具函数

在 `utils.ts` 中添加：

```typescript
export function sanitizeFolderName(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|]/g, '')      // 移除文件系统不安全字符
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // 移除 emoji
    .trim();
}
```

### 3. batch 命令修改

修改 `runBatch` 函数主流程：

```typescript
export async function runBatch(args: BatchArgs, config: Config): Promise<void> {
  // 参数校验保持不变
  // ...

  const excelReader = new ExcelReader(args.excel);
  const sheetNames = excelReader.getAllSheetNames();

  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const allResults: SheetResult[] = [];

  for (const sheetName of sheetNames) {
    const safeFolderName = sanitizeFolderName(sheetName);
    const sheetOutputDir = path.join(config.downloadDir, safeFolderName);
    fs.mkdirSync(sheetOutputDir, { recursive: true });

    excelReader.selectSheet(sheetName);
    excelReader.ensureStatusColumn();

    const originalDownloadDir = config.downloadDir;
    config.downloadDir = sheetOutputDir;

    const books = excelReader.readBooks();
    const sheetResults: BatchResult[] = [];

    // 原有下载循环逻辑
    // ...

    config.downloadDir = originalDownloadDir;
    excelReader.save();

    allResults.push({
      name: sheetName,
      total: books.length,
      downloaded: sheetDownloaded,
      skipped: sheetSkipped,
      failed: sheetFailed,
      results: sheetResults
    });
  }

  // 最终汇总输出
}
```

### 4. JSON 输出格式

```typescript
interface SheetResult {
  name: string;
  total: number;
  downloaded: number;
  skipped: number;
  failed: number;
  results: BatchResult[];
}

// 输出示例
{
  success: true,
  sheets: [
    {
      name: "政治家与自然文学",
      total: 55,
      downloaded: 10,
      skipped: 5,
      failed: 2,
      results: [...]
    }
  ],
  totalDownloaded: 25,
  totalSkipped: 10,
  totalFailed: 5
}
```

### 5. 错误处理

- 遇到 `FATAL_ERRORS`（CAPTCHA、NO_DOWNLOADS_LEFT 等）→ 停止整个批处理
- 单个书籍下载失败 → 标记失败，继续下一本
- 单个 sheet 处理完成 → 保存 Excel，继续下一个 sheet

## 涉及文件

- `src/excel-reader.ts` - 新增多 sheet 支持方法
- `src/commands/batch.ts` - 修改主流程，遍历所有 sheets
- `src/utils.ts` - 新增 `sanitizeFolderName` 函数
- `src/types.ts` - 新增 `SheetResult` 接口（可选）

## 向后兼容性

- `ExcelReader` 构造函数保持向后兼容，不传 sheetName 时默认使用第一个 sheet
- 单 sheet 的 Excel 文件行为不变
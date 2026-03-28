# PDF Preview CLI - Design Specification

## Overview

新增 `preview` 命令，为 PDF 文件生成第一页的 PNG 格式预览图。

## CLI Interface

```bash
# 基本用法
annas-download preview --input <file.pdf>

# 指定输出目录（输出文件名自动生成）
annas-download preview --input <file.pdf> --output ./previews

# 指定完整输出路径
annas-download preview --input <file.pdf> --output ./previews/cover.png

# 位置参数
annas-download preview <file.pdf>

# 帮助
annas-download preview --help
```

### 输出路径规则

- **默认**: 与输入文件同目录，扩展名改为 `.png`
  - 输入: `./books/test.pdf` → 输出: `./books/test.png`
  - 输入: `./books/test.PDF` → 输出: `./books/test.png`（扩展名统一小写）
- **指定输出目录**: 在指定目录下生成同名 `.png` 文件
- **指定完整路径**: 按指定路径保存

## Architecture

```
commands/cli.ts
    │
    ├── 新增 case 'preview'
    │
    ▼
commands/preview.ts          # 命令入口
    ├── parsePreviewArgs()    # 参数解析
    └── runPreview()         # 业务逻辑
                                  │
                                  ▼
                             src/previewer.ts (新文件)
                                  │
                                  ├── Previewer.generatePreview()
                                  └── 调用 pdftoppm
```

## File Structure

### New Files

| 文件 | 职责 |
|------|------|
| `src/previewer.ts` | 核心逻辑，调用 pdftoppm |
| `commands/preview.ts` | CLI 命令处理 |

### Modified Files

| 文件 | 变更 |
|------|------|
| `commands/cli.ts` | 添加 `preview` 命令分支和 `printCommandHelp('preview')` |

## API Design

### Previewer Class (`src/previewer.ts`)

```typescript
export interface PreviewOptions {
  inputPath: string;      // 输入 PDF 路径
  outputPath?: string;    // 输出图片路径（可选）
}

export interface PreviewResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export class Previewer {
  /**
   * 使用 pdftoppm 生成 PDF 第一页预览图
   * pdftoppm -png -f 1 -l 1 input.pdf output_prefix
   */
  async generatePreview(options: PreviewOptions): Promise<PreviewResult>
}
```

### pdftoppm 调用

```bash
pdftoppm -png -f 1 -l 1 input.pdf output_prefix
```

- `-png`: 输出 PNG 格式
- `-f 1`: 从第一页开始
- `-l 1`: 到第一页结束（只渲染第一页）
- `output_prefix`: 输出文件前缀（不含扩展名，pdftoppm 自动加 `-1.png`）

## Error Handling

| 场景 | 行为 |
|------|------|
| 输入文件不存在 | 退出码 1，输出 `Error: Input file not found: <path>` |
| pdftoppm 执行失败 | 退出码 1，输出 `Error: pdftoppm failed: <error>` |
| 输出目录不存在 | 自动创建（`mkdir -p`） |
| pdftoppm 未安装 | 退出码 1，输出 `Error: pdftoppm not found. Install: brew install poppler (macOS)` |

## Dependencies

- **无新 npm 依赖**
- **系统要求**: 安装 `poppler-utils`（Linux）或 `poppler`（macOS via Homebrew）

## Testing

手动测试场景：
1. `annas-download preview ./test.pdf` - 默认输出路径
2. `annas-download preview --input ./test.pdf --output ./previews` - 指定目录
3. `annas-download preview --input ./test.PDF --output ./out.png` - 大写扩展名 + 完整路径
4. `annas-download preview ./nonexistent.pdf` - 文件不存在错误处理

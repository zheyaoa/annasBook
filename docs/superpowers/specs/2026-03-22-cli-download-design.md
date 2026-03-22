# CLI Download 功能设计

**日期**: 2026-03-22
**状态**: 待审核

## 背景

项目已有 `cli-search.ts` 提供命令行搜索功能，需要新增 `cli-download.ts` 提供命令行下载功能，支持两种使用场景。

## 功能需求

### 模式一：MD5 直接下载

用户已知书籍 MD5，直接下载无需搜索。

```bash
npm run download -- --md5 <MD5值> [--filename <文件名>]
```

### 模式二：搜索后交互式选择下载

用户输入关键词搜索，从结果列表中选择要下载的书籍。

```bash
npm run download -- --title <书名> [--author <作者>] [--format pdf|epub] [--lang en|zh]
```

## 命令行参数

| 参数 | 说明 | 必需 |
|------|------|------|
| `--md5` | 书籍 MD5 值 | 与搜索参数二选一 |
| `--filename` | 输出文件名（仅 MD5 模式，不含扩展名） | 否，不指定则自动命名 |
| `--title` | 书名关键词 | 与 MD5 二选一 |
| `--author` | 作者名 | 否 |
| `--format` | 格式过滤 (pdf/epub) | 否 |
| `--lang` | 语言偏好 (en/zh) | 否 |

## 架构设计

### 文件结构

```
scripts/
├── cli-search.ts      # 修改：导出可复用函数
└── cli-download.ts    # 新建：下载脚本
```

### 模块复用

`cli-download.ts` 复用 `cli-search.ts` 的能力：

| 函数 | 用途 |
|------|------|
| `parseArgs()` | 解析命令行参数 |
| `buildQuery()` | 构建搜索查询字符串 |
| `limitResults()` | 限制结果数量 |
| `formatResults()` | 格式化显示搜索结果 |

### cli-download.ts 核心函数

```
downloadByMd5(md5, filename?)
  ├── fetchBookDetailsExtended(md5) 获取书籍完整信息
  │   └── 扩展版：返回 title, author, format, year, publisher
  ├── 自动生成文件名（如未指定）
  └── Downloader.download()

downloadBySearch(args)
  ├── Searcher.searchByQuery()
  ├── formatResults() 显示结果
  ├── promptUserSelection() 等待用户输入
  └── Downloader.download()

promptUserSelection(results)
  ├── 显示带序号的结果列表
  ├── 等待用户输入序号
  └── 返回选中的 SearchResult
```

## 数据流

### MD5 模式

```
用户输入 MD5
    ↓
fetchBookDetailsExtended(md5) → 获取 title, author, format, year, publisher
    ↓
生成文件名（用户指定 或 自动生成）
    ↓
build BookInfo + SearchResult
    ↓
Downloader.download()
    ↓
输出下载结果
```

### 搜索模式

```
用户输入关键词
    ↓
buildQuery() → 搜索查询字符串
    ↓
Searcher.searchByQuery()
    ↓
limitResults() → 限制 5 条（复用 cli-search）
    ↓
formatResults() → 显示带序号列表
    ↓
promptUserSelection() → 用户输入序号
    ↓
Downloader.download()
    ↓
输出下载结果
```

## 文件命名逻辑

### MD5 模式

1. 用户指定 `--filename`：使用用户指定的文件名
2. 用户未指定：从 `fetchBookDetailsExtended()` 获取标题生成文件名

### 搜索模式

使用选中结果的标题生成文件名，逻辑与 Excel 模式一致。

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| MD5 无效 | 提示错误，退出码 1 |
| 搜索无结果 | 提示 "No results found"，退出码 0 |
| 用户取消 (Ctrl+C) | 优雅退出，退出码 130 |
| 下载失败 | 显示错误信息，退出码 1 |
| CAPTCHA | 提示用户访问 URL 解决验证码 |

## 修改清单

### 1. 修改 `src/searcher.ts`

- 新增 `fetchBookDetailsExtended(md5)` 方法
- 返回 `{ title, author, format, year, publisher }`
- 从 MD5 页面解析标题、作者、格式等信息

### 2. 修改 `scripts/cli-search.ts`

- 导出 `SearchArgs` 接口
- 导出 `parseArgs`、`buildQuery`、`limitResults`、`formatResults` 函数
- `formatResults` 改为返回格式化后的结果数组（同时保留打印功能）

### 3. 新建 `scripts/cli-download.ts`

- 实现 MD5 下载流程（使用 `fetchBookDetailsExtended`）
- 实现搜索下载流程（复用 cli-search 能力）
- 实现交互式选择逻辑
- 处理错误和退出码

## 使用示例

```bash
# MD5 直接下载
npm run download -- --md5 a1b2c3d4e5f6...

# MD5 下载并指定文件名
npm run download -- --md5 a1b2c3d4e5f6... --filename "My Book"

# 搜索下载
npm run download -- --title "The Great Gatsby"

# 搜索下载（指定作者和格式）
npm run download -- --title "1984" --author "Orwell" --format pdf
```
# Anna's Archive Book Downloader

从 Anna's Archive 搜索和下载书籍的 TypeScript CLI 工具。支持 Excel 批量处理和单本书籍 CLI 模式。

## 功能特性

- 🔍 **搜索模式**: 搜索书籍，显示结果不下载
- 📥 **下载模式**: 搜索后交互选择下载，或直接用 MD5 下载
- 📊 **批量模式**: 从 Excel 文件批量下载，支持 JSON 输出
- 🔄 **智能匹配**: 自动选择最佳匹配，支持 LLM 辅助匹配
- 🛡️ **错误处理**: 自动处理 CAPTCHA、速率限制、超时重试

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置

创建 `config.json`:

```json
{
  "apiKey": "your-api-key",
  "baseUrl": "https://annas-archive.gl",
  "downloadDir": "./downloads",
  "proxy": "http://127.0.0.1:7892"
}
```

创建 `cookies.json` (用于下载):

```json
"cookie_name=cookie_value; another_cookie=value"
```

### 使用方法

#### 搜索书籍

```bash
# 基本搜索
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-search.ts --title "The Great Gatsby"

# 带作者和格式过滤
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-search.ts --title "1984" --author "Orwell" --format pdf

# 中文书籍
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-search.ts --title "三体" --lang zh
```

#### 下载书籍

```bash
# 交互式下载 (搜索后选择)
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-download.ts --title "The Great Gatsby"

# 通过 MD5 直接下载
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-download.ts --md5 <32位MD5哈希>

# 指定输出文件名
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-download.ts --md5 <md5> --filename "My Book"
```

#### 批量下载

```bash
# 从 Excel 批量下载
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-batch.ts --excel ./books.xlsx

# 指定输出目录和限制数量
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-batch.ts --excel ./books.xlsx --output ./downloads --limit 10

# JSON 输出 (便于程序调用)
npx tsx /Users/yuyuxin/code/annasBook/scripts/cli-batch.ts --excel ./books.xlsx --json
```

#### Excel 批量处理 (默认模式)

```bash
npx tsx /Users/yuyuxin/code/annasBook/src/index.ts
```

## 命令行选项

### 搜索命令 (cli-search.ts)

| 选项 | 说明 |
|------|------|
| `--title <string>` | 书名关键词 (必需) |
| `--author <string>` | 作者名 |
| `--format <pdf\|epub>` | 格式过滤 |
| `--lang <en\|zh>` | 语言偏好 (默认: en) |

### 下载命令 (cli-download.ts)

| 选项 | 说明 |
|------|------|
| `--md5 <string>` | 书籍 MD5 哈希 (跳过搜索) |
| `--filename <string>` | 输出文件名 (仅 MD5 模式) |
| `--title <string>` | 书名关键词 (搜索模式) |
| `--author <string>` | 作者名 |
| `--format <pdf\|epub>` | 格式过滤 |
| `--lang <en\|zh>` | 语言偏好 |

### 批量命令 (cli-batch.ts)

| 选项 | 说明 |
|------|------|
| `--excel <file>` | Excel 文件路径 (必需) |
| `--output <dir>` | 下载输出目录 |
| `--limit <n>` | 最大下载数量 |
| `--json` | JSON 格式输出 |

## Excel 格式

| 列名 | 说明 |
|------|------|
| 语言 | "en" 使用英文标题搜索，否则用中文 |
| 书名 | 中文标题 |
| Book title | 英文标题 |
| 作者 | 中文作者 |
| Author | 英文作者 |
| 下载状态 | 状态 (自动更新) |
| 书籍链接 | 可选 MD5 链接 (跳过搜索) |

## 配置说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `apiKey` | Anna's Archive API 密钥 | (必需) |
| `baseUrl` | 镜像站点 URL | (必需) |
| `downloadDir` | 下载目录 | `./downloads` |
| `excelFile` | Excel 文件路径 | (批量模式必需) |
| `rateLimitMs` | 请求间隔 | 2000 |
| `requestTimeoutMs` | 请求超时 | 30000 |
| `downloadTimeoutMs` | 下载超时 | 300000 |
| `maxRetries` | 最大重试次数 | 3 |
| `proxy` | 代理 URL | (可选) |
| `downloadLimit` | 单次最大下载数 | 无限制 |
| `openai.apiKey` | OpenAI API 密钥 (LLM 匹配) | (可选) |

## 错误处理

| 错误 | 说明 | 解决方案 |
|------|------|----------|
| `CAPTCHA_DETECTED` | 遇到验证码 | 浏览器访问站点，解决验证码后更新 cookies.json |
| `NO_DOWNLOADS_LEFT` | 账户下载次数用完 | 更换账户 |
| `RATE_LIMITED` | 请求过于频繁 | 自动等待 60 秒 |
| `CONSECUTIVE_FAILURES` | 连续 5 次失败 | 检查网络/代理 |

## 项目结构

```
src/
├── index.ts        # Excel 批量模式入口
├── cli.ts          # 统一 CLI 入口
├── searcher.ts     # 搜索和结果解析
├── downloader.ts   # 下载处理
├── http-client.ts  # HTTP 客户端 (cookies, proxy)
├── excel-reader.ts # Excel 读写
├── config.ts       # 配置加载
├── types.ts        # TypeScript 类型定义
├── logger.ts       # 日志记录
└── lock.ts         # 进程锁

scripts/
├── cli-search.ts   # 搜索命令
├── cli-download.ts # 下载命令
└── cli-batch.ts    # 批量命令
```

## 开发

```bash
# 构建
npm run build

# 运行测试
npx tsx test/test-match.ts
npx tsx test/test-fast-download.ts
```

## 依赖

- [axios](https://github.com/axios/axios) - HTTP 客户端
- [cheerio](https://github.com/cheeriojs/cheerio) - HTML 解析
- [xlsx](https://github.com/SheetJS/sheetjs) - Excel 读写

## 许可证

ISC
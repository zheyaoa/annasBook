# annas-download CLI 重构设计

## 背景

当前 annasBook 通过 `npx tsx` 调用，配置文件路径硬编码为 `./config.json`，导致从非项目目录调用时找不到配置。需要重构为标准的全局 CLI 工具。

## 目标

将 annasBook 改造为可全局安装的 CLI 工具 `annas-download`，支持：
- 全局命令调用
- 多路径配置查找
- 环境变量配置覆盖

## 设计决策

| 项目 | 决定 |
|------|------|
| 命令名称 | `annas-download` |
| 命令风格 | 子命令模式 |
| 默认配置位置 | `~/.annasbook/config.json` |

## 命令格式

### 子命令

```bash
# 搜索
annas-download search --title "Dune" --author "Herbert" --format pdf --lang en

# 下载（交互式选择）
annas-download download --title "The Great Gatsby"

# 直接下载（通过 MD5）
annas-download download --md5 abc123 --filename "My Book"

# 批量下载
annas-download batch --excel ./books.xlsx --output ./downloads

# 配置管理
annas-download config list    # 显示当前配置
annas-download config path    # 显示配置文件路径
annas-download config init    # 初始化配置文件
```

### 全局选项

```bash
--config <path>    指定配置文件路径
--output <dir>     指定下载目录（覆盖配置）
--json             JSON 格式输出
--help             显示帮助
--version          显示版本
```

### 子命令选项

**search**:
| 选项 | 说明 |
|------|------|
| `--title <string>` | 书名关键词（必需） |
| `--author <string>` | 作者名 |
| `--format <pdf\|epub>` | 格式筛选 |
| `--lang <en\|zh>` | 语言偏好 |

**download**:
| 选项 | 说明 |
|------|------|
| `--md5 <string>` | MD5 哈希值（直接下载） |
| `--title <string>` | 书名关键词（搜索下载） |
| `--author <string>` | 作者名 |
| `--format <pdf\|epub>` | 格式筛选 |
| `--filename <string>` | 输出文件名（仅 MD5 模式） |

**batch**:
| 选项 | 说明 |
|------|------|
| `--excel <file>` | Excel 文件路径（必需） |
| `--limit <n>` | 最大下载数量 |

## 配置策略

### 配置文件查找优先级

```
1. --config <path>                      命令行指定（最高优先级）
2. $ANNASBOOK_CONFIG                    环境变量
3. ~/.annasbook/config.json             用户目录（默认）
4. ./config.json                        当前目录（向后兼容）
```

找到第一个存在的文件即停止查找。

### 环境变量覆盖

环境变量优先级高于配置文件：

| 环境变量 | 配置项 |
|----------|--------|
| `ANNASBOOK_API_KEY` | `apiKey` |
| `ANNASBOOK_BASE_URL` | `baseUrl` |
| `ANNASBOOK_DOWNLOAD_DIR` | `downloadDir` |
| `ANNASBOOK_PROXY` | `proxy` |

### 下载目录优先级

```
1. --output <dir>                       命令行参数（单次生效）
2. $ANNASBOOK_DOWNLOAD_DIR              环境变量
3. config.json 中的 downloadDir         配置文件
4. ./downloads                          默认值
```

## 文件结构

```
annasBook/
├── package.json              # 添加 bin 字段
├── bin/
│   └── annas-download.js     # CLI 入口（shebang + 转发）
├── src/
│   ├── index.ts              # 保留：Excel 模式入口
│   ├── cli.ts                # 重构：统一子命令解析
│   ├── config.ts             # 重构：多路径查找 + 环境变量
│   ├── searcher.ts           # 不变
│   ├── downloader.ts         # 不变
│   ├── http-client.ts        # 不变
│   ├── excel-reader.ts       # 不变
│   ├── types.ts              # 不变
│   ├── logger.ts             # 不变
│   └── lock.ts               # 不变
├── scripts/
│   ├── cli-search.ts         # 保留：独立脚本（向后兼容）
│   ├── cli-download.ts       # 保留：独立脚本（向后兼容）
│   └── cli-batch.ts          # 保留：独立脚本（向后兼容）
├── config.example.json       # 不变
└── tsconfig.json             # 不变
```

## 实现要点

### package.json

```json
{
  "name": "annas-book-downloader",
  "bin": {
    "annas-download": "./bin/annas-download.js"
  },
  "files": ["bin", "dist"]
}
```

### bin/annas-download.js

```javascript
#!/usr/bin/env node
import('../dist/cli.js');
```

### src/config.ts 核心逻辑

1. `getConfigPaths()` - 返回配置查找路径列表
2. `findConfigFile()` - 按优先级查找存在的配置文件
3. `applyEnvOverrides()` - 环境变量覆盖配置值
4. `loadConfig()` - 加载配置并合并默认值

### src/cli.ts 核心逻辑

1. `parseArgs()` - 解析全局选项和子命令
2. `loadConfig()` - 加载配置（支持 --config 覆盖）
3. 子命令分发：search / download / batch / config
4. 复用现有 scripts/ 中的逻辑

## 向后兼容

- `scripts/` 目录下的独立脚本保留，原有调用方式仍可用
- `./config.json` 仍在查找路径中，现有用户无需迁移

## 安装使用

```bash
# 开发时
cd /Users/yuyuxin/code/annasBook
npm link

# 使用
annas-download search --title "Dune"

# 初始化配置
annas-download config init
```

## 错误处理

当找不到配置文件时，显示友好提示：

```
Error: No config file found.
Searched paths:
  - $ANNASBOOK_CONFIG (not set)
  - ~/.annasbook/config.json (not found)
  - ./config.json (not found)

Run: annas-download config init
```
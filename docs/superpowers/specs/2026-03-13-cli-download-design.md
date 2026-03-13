# 命令行下载功能设计

## 概述

增加命令行模式，支持直接通过命令行传入书名和作者名进行下载，无需依赖 Excel 文件。

## 命令行参数

```
tsx src/index.ts --title "书名" --author "作者名"
```

- `--title`: 必填，书籍标题
- `--author`: 可选，作者名（用于提高搜索精度）

## 执行流程

```
解析命令行参数
    ↓
检测到 --title 参数？
    ├─ 是 → 命令行模式
    │        ↓
    │   构建 BookInfo 对象
    │        ↓
    │   调用 Searcher.search() 搜索
    │        ↓
    │   调用 Searcher.selectBestResult() 选择最佳
    │        ↓
    │   调用 Downloader.download() 下载
    │        ↓
    │   输出结果并退出
    │
    └─ 否 → Excel 模式（现有逻辑不变）
```

## 配置与依赖

- 从 `config.json` 读取配置（baseUrl、proxy、timeout 等）
- 命令行模式下 `excelFile` 不必填
- 复用现有的 `HttpClient`、`Searcher`、`Downloader` 组件

## 输出格式

成功时：
```
[INFO] Searching for: 书名
[INFO] Found X results
[INFO] Best match: 书名 (pdf, 2.1MB)
[INFO] Downloaded to: ./downloads/书名.pdf
```

失败时：
```
[INFO] Searching for: 书名
[INFO] Found 0 results
[ERROR] Book not found
```

## 代码改动

### src/index.ts

1. 添加命令行参数解析函数 `parseCliArgs()`
2. 在 `main()` 开头检测命令行模式
3. 添加 `runCliMode()` 函数处理命令行下载

### src/config.ts

1. `loadConfig()` 增加 `skipExcelCheck` 参数
2. 命令行模式下跳过 excelFile 必填校验

## 不在范围内

- 多本书同时下载
- 交互式结果选择
- 其他输出格式选项
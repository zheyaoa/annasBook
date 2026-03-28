# npm 发布准备设计方案

## 目标

将 `annas-book-downloader` 项目发布到 npm，支持 CLI 和库两种使用方式。

## 现状分析

| 项目 | 当前状态 | 需要修改 |
|------|---------|---------|
| 包名 `annas-book-downloader` | 可用（npm 上不存在）| 无需修改 |
| `package.json` 字段 | 缺少 `description`/`author`/`repository` 等 | 需补充 |
| TypeScript 构建 | `dist/commands/` 已生成 | 正常 |
| `bin` 入口 | 指向 `dist/commands/cli.js` | 正常 |
| README | 包含硬编码本地路径 | 需清理 |
| `.npmignore` | 不存在 | 需创建 |
| `execa` | 用于 `src/converter.ts` | 保留 |

## 待完成事项

### 1. 补充 `package.json` 字段

需要添加的字段：

```json
{
  "description": "Search and download books from Anna's Archive - CLI tool with Excel batch support",
  "author": "Your Name <your@email.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourname/annasBook.git"
  },
  "bugs": {
    "url": "https://github.com/yourname/annasBook/issues"
  },
  "homepage": "https://github.com/yourname/annasBook#readme",
  "keywords": ["books", "downloader", "anna-archive", "ebook", "pdf", "epub"],
  "prepublishOnly": "npm run build"
}
```

### 2. 创建 `.npmignore`

排除不需要进入 npm 包的文件：

```
# 源码和构建
src/
commands/
scripts/
test/
bin/
tsconfig.json

# 本地开发和文档
docs/
*.md
.gitignore
.claude/

# 本地配置和输出
cookies.json
config.json
*.log
logs/
downloads/

# 其他
node_modules/
.DS_Store
*.ts
!*.d.ts
```

### 3. 清理 README

- 移除所有 `/Users/yuyuxin/code/annasBook/` 硬编码路径
- 改为相对路径或通用描述
- 添加 npm 安装和全球使用说明

### 4. 验证 lib API 导出

确认 `src/` 下的核心模块有正确的 `export`：
- `Searcher` - 搜索书籍
- `Downloader` - 下载书籍
- `ExcelReader` - Excel 处理
- `Config` - 配置管理
- `HttpClient` - HTTP 客户端

在 `package.json` 中添加 `exports` 字段（如果需要）：

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  }
}
```

## 自动化脚本

### 发布流程

```bash
# 1. 本地构建测试
npm run build

# 2. 更新版本号并打 tag
npm version patch  # 或 minor / major

# 3. 发布到 npm
npm publish

# 4. 推送代码和标签
git push && git push --tags
```

### 可选：添加 `release` 脚本

在 `package.json` 中添加交互式发布脚本：

```json
{
  "scripts": {
    "release": "npm version patch && npm publish && git push --follow-tags"
  }
}
```

## 发布前检查清单

- [ ] `npm run build` 成功
- [ ] `npm pack` 生成正确的 tarball
- [ ] `package.json` 所有字段填写完整
- [ ] `README.md` 无硬编码路径
- [ ] `.npmignore` 正确排除敏感文件
- [ ] `npm login` 已登录正确账户
- [ ] `npm publish --dry-run` 测试通过

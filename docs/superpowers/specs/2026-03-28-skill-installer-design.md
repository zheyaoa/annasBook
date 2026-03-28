# Skills 安装器设计

## 概述

为 `annas-download` CLI 添加 `install` 命令，用于将项目中的技能安装到全局 Claude Code 技能目录 `~/.claude/skills/`。

## 背景

- Claude Code 技能目录在 `~/.claude/skills/`（用户级别）
- 项目开发时的技能放在 `assets/skills/`（npm publish 时可被包含）
- 需要一个命令将项目技能一键安装到全局目录

## 功能设计

### `annas-download install` 命令

**功能**：将 `assets/skills/` 下的所有技能安装到 `~/.claude/skills/`

**使用方式**：
```bash
annas-download install
```

**输出示例**：
```
Installing skills to ~/.claude/skills/...
✓ Installed: anna-downloader
✓ Installed: another-skill
Done. 2 skill(s) installed.
```

### 实现细节

#### 源目录结构
```
assets/skills/
├── anna-downloader/
│   ├── SKILL.md
│   └── evals/
│       └── evals.json
└── another-skill/
    └── SKILL.md
```

#### 目标目录结构
```
~/.claude/skills/
├── anna-downloader/    ← 覆盖安装
└── another-skill/      ← 覆盖安装
```

#### 安装流程
1. 解析目标目录路径（`~/.claude/skills/`）
2. 读取源目录 `assets/skills/`
3. 创建目标目录（如不存在）
4. 对每个技能目录：
   - 递归复制到目标位置（覆盖式安装）
   - 记录安装结果
5. 输出安装摘要

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `commands/install.ts` | 新增 | install 命令处理器 |
| `commands/cli.ts` | 修改 | 添加 install 子命令路由 |

## 错误处理

| 错误 | 处理 |
|------|------|
| 目标目录创建失败 | 输出错误信息，退出码 1 |
| 复制失败 | 输出错误信息，退出码 1 |
| 源目录为空/不存在 | 输出警告，继续执行 |

## 依赖

- 使用 `fs-extra` 或 Node.js 原生 fs/shell 进行文件复制
- 路径处理使用 `path` 模块处理 `~` 展开

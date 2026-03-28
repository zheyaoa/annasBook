# Project Structure Specification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply project structure spec to CLAUDE.md - add directory rules and create scripts/ directory.

**Architecture:** Update CLAUDE.md to include directory responsibilities and file creation rules. Create scripts/ directory as specified.

**Tech Stack:** N/A (documentation only)

---

## Task 1: Create scripts/ directory

**Files:**
- Create: `scripts/` (empty directory)

- [ ] **Step 1: Create scripts/ directory**

Run: `mkdir -p /Users/yuyuxin/code/annasBook/scripts`
Verify: `ls -la /Users/yuyuxin/code/annasBook/scripts/` should show empty directory

- [ ] **Step 2: Add .gitkeep to preserve directory**

Run: `touch /Users/yuyuxin/code/annasBook/scripts/.gitkeep`

- [ ] **Step 3: Commit**

```bash
git add scripts/.gitkeep
git commit -m "chore: create scripts/ directory for temp files"
```

---

## Task 2: Update CLAUDE.md with structure rules

**Files:**
- Modify: `CLAUDE.md` - add directory structure rules section

- [ ] **Step 1: Read current CLAUDE.md**

- [ ] **Step 2: Add Directory Structure Rules section before/after Architecture section**

Add the following section:

```markdown
## Directory Structure Rules

| 目录 | 职责 | 可创建的文件类型 |
|------|------|----------------|
| `src/` | 核心业务逻辑库 | `.ts` 核心模块 |
| `commands/` | CLI 命令处理器 | `.ts` 命令模块 |
| `test/` | 测试脚本 | `.ts` 测试脚本 |
| `scripts/` | 临时/一次性脚本 | `.ts` 临时脚本 (标记 `_delete` 后缀，等待清理) |
| `docs/` | 文档 | `.md` 文档 |
| `bin/` | 构建产物 | (自动生成) |
| `logs/` | 日志文件 | (自动生成) |
| `downloads/` | 下载的书籍 | (自动生成) |
| `assets/` | 静态资源/Excel | `.xlsx` 等资源文件 |

### File Creation Rules

1. **禁止在根目录创建 `.ts` 文件** — 调试/临时脚本一律放 `scripts/`
2. **临时脚本命名加 `_delete` 后缀** — 如 `debug-search_delete.ts`，表示"待删除"
3. **禁止在 `src/` 和 `commands/` 创建带 `_delete` 后缀的文件**
4. **定期清理** — 项目成员发现带 `_delete` 的文件应确认后删除
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add directory structure rules to CLAUDE.md
- specify allowed file types per directory
- add rules for temp files with _delete suffix"
```

---

## Task 3: Verify and summary

- [ ] Verify CLAUDE.md has the new section
- [ ] Verify scripts/ directory exists
- [ ] Confirm no temp files in root directory

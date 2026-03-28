# OpenAI Enable 配置修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `openai.enable` 字段在 `config.ts` 中未被读取的问题

**Architecture:** 单文件修改，直接在 `config.ts` 的 openai 配置合并处添加 `enable` 字段传递

**Tech Stack:** TypeScript

---

### Task 1: 添加 enable 字段到配置加载

**Files:**
- Modify: `src/config.ts:101-105`

- [ ] **Step 1: 修改 config.ts 添加 enable 字段**

```typescript
openai: config.openai ? {
  enable: config.openai.enable,
  apiKey: config.openai.apiKey,
  baseUrl: config.openai.baseUrl || 'https://api.openai.com/v1',
  model: config.openai.model || 'gpt-4o-mini',
} : undefined,
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/config.ts
git commit -m "fix: pass openai.enable from config file to runtime config"
```

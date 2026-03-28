# CLI Help Flag Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `-h`/`--help` flag so `annas-download search -h` shows subcommand help, not main help.

**Architecture:** Reorder if-else conditions in `parseArgs()` so that `-h` after a command is passed to `commandArgs` instead of being intercepted by the main help handler.

**Tech Stack:** TypeScript (commands/cli.ts)

---

## Task 1: Fix parseArgs() condition order

**Files:**
- Modify: `commands/cli.ts:40-64` (parseArgs while loop body)

- [ ] **Step 1: Read current code**

Read `commands/cli.ts` lines 32-68 to see the exact current implementation.

- [ ] **Step 2: Apply the fix**

Replace the current if-else chain (lines 40-64) with the corrected version:

```typescript
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--config' && args[i + 1]) {
      globalOptions.config = args[i + 1];
      i += 2;
    } else if (arg === '--output' && args[i + 1]) {
      globalOptions.output = args[i + 1];
      i += 2;
    } else if (arg === '--json') {
      globalOptions.json = true;
      i++;
    } else if (!arg.startsWith('-') && !command) {
      // Detect subcommand first
      command = arg;
      i++;
    } else if ((arg === '--help' || arg === '-h') && command) {
      // -h after command: pass to subcommand
      commandArgs.push(arg);
      i++;
    } else if (arg === '--help' || arg === '-h') {
      // -h without command: show main help
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log(`annas-download v${VERSION}`);
      process.exit(0);
    } else {
      commandArgs.push(arg);
      i++;
    }
  }
```

- [ ] **Step 3: Build and verify no errors**

```bash
npm run build
```

- [ ] **Step 4: Test subcommand help**

```bash
annas-download search -h
```

Expected: Search subcommand help (Usage, Options, Examples for search command)

```bash
annas-download download -h
```

Expected: Download subcommand help

```bash
annas-download batch -h
```

Expected: Batch subcommand help

```bash
annas-download config -h
```

Expected: Config subcommand help

```bash
annas-download convert -h
```

Expected: Convert subcommand help

```bash
annas-download -h
```

Expected: Main help (unchanged behavior)

```bash
annas-download --help
```

Expected: Main help (unchanged behavior)

- [ ] **Step 5: Commit**

```bash
git add commands/cli.ts
git commit -m "fix: pass -h to subcommand when command is set

Before: annas-download search -h showed main help
After: annas-download search -h shows search subcommand help

Reordered if-else in parseArgs() so -h after a command is
passed to commandArgs instead of triggering main help handler.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Verification Checklist

- [ ] `annas-download -h` → main help ✓
- [ ] `annas-download --help` → main help ✓
- [ ] `annas-download search -h` → search help ✓
- [ ] `annas-download download -h` → download help ✓
- [ ] `annas-download batch -h` → batch help ✓
- [ ] `annas-download config -h` → config help ✓
- [ ] `annas-download convert -h` → convert help ✓

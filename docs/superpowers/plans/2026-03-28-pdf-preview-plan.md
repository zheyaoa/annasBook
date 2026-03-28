# PDF Preview CLI - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `preview` command that generates PNG previews from the first page of PDF files using `pdftoppm`.

**Architecture:** New `Previewer` class in `src/previewer.ts` wraps `pdftoppm` process execution. CLI handler in `commands/preview.ts` parses args and delegates to Previewer. `commands/cli.ts` gets new `preview` case.

**Tech Stack:** TypeScript, `child_process` for pdftoppm invocation, no new npm dependencies.

---

## File Structure

| File | Responsibility |
|------|-----------------|
| `src/previewer.ts` | Core Previewer class - wraps `pdftoppm -png -f 1 -l 1` |
| `commands/preview.ts` | CLI command handler - args parsing, output path resolution |
| `commands/cli.ts` | Add `preview` case in switch, add help text |

---

## Task 1: Create Previewer Class

**Files:**
- Create: `src/previewer.ts`
- Test: `test/test-preview.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/test-preview.ts
import { Previewer, PreviewOptions, PreviewResult } from '../src/previewer';
import fs from 'fs';
import path from 'path';

const TEST_PDF = './test/fixtures/sample.pdf';

describe('Previewer', () => {
  const previewer = new Previewer();

  it('should generate preview with default output path', async () => {
    const options: PreviewOptions = { inputPath: TEST_PDF };
    const result = await previewer.generatePreview(options);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBeDefined();
    expect(fs.existsSync(result.outputPath!)).toBe(true);
  });

  it('should reject non-existent input file', async () => {
    const options: PreviewOptions = { inputPath: './nonexistent.pdf' };
    const result = await previewer.generatePreview(options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx test/test-preview.ts`
Expected: FAIL with "Cannot find module '../src/previewer'" or test failure

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/previewer.ts
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface PreviewOptions {
  inputPath: string;
  outputPath?: string;
}

export interface PreviewResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export class Previewer {
  /**
   * Generate a PNG preview of the first page of a PDF using pdftoppm.
   * Command: pdftoppm -png -f 1 -l 1 input.pdf output_prefix
   */
  async generatePreview(options: PreviewOptions): Promise<PreviewResult> {
    const { inputPath } = options;

    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      return { success: false, error: `Input file not found: ${inputPath}` };
    }

    // Determine output path
    let outputPath = options.outputPath;
    if (!outputPath) {
      // Default: same directory as input, .pdf -> .png
      const dir = path.dirname(inputPath);
      const basename = path.basename(inputPath, path.extname(inputPath).toLowerCase());
      outputPath = path.join(dir, `${basename}.png`);
    } else if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
      // If output is a directory, use same basename
      const basename = path.basename(inputPath, path.extname(inputPath).toLowerCase());
      outputPath = path.join(outputPath, `${basename}.png`);
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // The output_prefix for pdftoppm must NOT include extension
    // pdftoppm adds "-1.png" automatically
    const outputPrefix = outputPath.replace(/\.png$/, '');

    try {
      // Check if pdftoppm is available
      try {
        execSync('which pdftoppm', { stdio: 'pipe' });
      } catch {
        return {
          success: false,
          error: 'pdftoppm not found. Install: brew install poppler (macOS)'
        };
      }

      // Run pdftoppm: -png (PNG output), -f 1 -l 1 (first page only)
      execSync(
        `pdftoppm -png -f 1 -l 1 "${inputPath}" "${outputPrefix}"`,
        { stdio: 'pipe' }
      );

      // pdftoppm creates outputPrefix-1.png, rename to our outputPath
      const generatedFile = `${outputPrefix}-1.png`;
      if (fs.existsSync(generatedFile)) {
        if (generatedFile !== outputPath) {
          fs.renameSync(generatedFile, outputPath);
        }
        return { success: true, outputPath };
      }

      return { success: false, error: 'pdftoppm did not generate expected output' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `pdftoppm failed: ${message}` };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx test/test-preview.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/previewer.ts test/test-preview.ts
git commit -m "feat: add Previewer class for PDF to PNG conversion"
```

---

## Task 2: Create Preview Command Handler

**Files:**
- Create: `commands/preview.ts`
- Modify: `commands/cli.ts:1-22` (imports), `commands/cli.ts:86-88` (help), `commands/cli.ts:196-200` (case 'preview' help), `commands/cli.ts:369-370` (handler), `commands/cli.ts:343-350` (parsePreviewArgs), `commands/cli.ts:411-412` (switch case)

- [ ] **Step 1: Write the preview command**

```typescript
// commands/preview.ts
import fs from 'fs';
import path from 'path';
import { Previewer } from '../src/previewer';

interface PreviewArgs {
  input: string;
  output?: string;
}

export async function runPreview(args: PreviewArgs): Promise<void> {
  // Validate input
  if (!args.input) {
    console.error('Error: Input PDF file is required');
    process.exit(1);
  }

  if (!fs.existsSync(args.input)) {
    console.error(`Error: Input file not found: ${args.input}`);
    process.exit(1);
  }

  const ext = path.extname(args.input).toLowerCase();
  if (ext !== '.pdf') {
    console.error('Error: Input file must be a PDF file');
    process.exit(1);
  }

  // Determine output path
  let outputPath = args.output;
  if (outputPath) {
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
      const basename = path.basename(args.input, '.pdf');
      outputPath = path.join(outputPath, `${basename}.png`);
    }
    // else: user specified full path, use as-is
  } else {
    // Default: same directory as input, .pdf -> .png
    outputPath = args.input.replace(/\.pdf$/i, '.png');
  }

  console.log(`Generating preview: ${args.input}`);
  console.log(`Output: ${outputPath}`);

  const previewer = new Previewer();
  const result = await previewer.generatePreview({
    inputPath: args.input,
    outputPath
  });

  if (result.success) {
    console.log(`\nPreview generated: ${result.outputPath}`);
  } else {
    console.error(`\nError: ${result.error}`);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Run to verify syntax**

Run: `npx tsx commands/preview.ts --help`
Expected: Should not error on import

- [ ] **Step 3: Commit**

```bash
git add commands/preview.ts
git commit -m "feat: add preview command handler"
```

---

## Task 3: Integrate Preview Command into CLI

**Files:**
- Modify: `commands/cli.ts`

- [ ] **Step 1: Add import for runPreview**

Add after line 16:
```typescript
import { runPreview } from './preview.js';
```

- [ ] **Step 2: Add preview to main help text**

In `printHelp()` function, add `preview` to the Commands list after `convert`:
```
  preview    Generate PNG preview of PDF first page
```

And add to Examples:
```
  annas-download preview ./book.pdf
```

- [ ] **Step 3: Add preview case to printCommandHelp**

Add after line 195 (before `default:`):
```typescript
    case 'preview':
      console.log(`
Usage: annas-download preview <input.pdf> [options]

Arguments:
  <input.pdf>           Path to PDF file (required, can also use --input)

Options:
  --input <path>        Path to PDF file
  --output <path>       Output path or directory for PNG (default: same dir as input)

Examples:
  annas-download preview ./book.pdf
  annas-download preview --input ./book.pdf --output ./previews
  annas-download preview ./book.pdf --output ./previews/cover.png
`);
      break;
```

- [ ] **Step 4: Add parsePreviewArgs function**

Add after `parseConvertArgs` (after line 343):
```typescript
function parsePreviewArgs(args: string[]): { input?: string; output?: string } {
  const result: { input?: string; output?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      result.input = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printCommandHelp('preview');
      process.exit(0);
    } else if (!args[i].startsWith('-') && !result.input) {
      // Positional argument
      result.input = args[i];
    }
  }

  return result;
}
```

- [ ] **Step 5: Add preview handler in main() switch after convert case (line 369)**

Add after the convert case:
```typescript
  // Handle preview command separately (doesn't need config file)
  if (command === 'preview') {
    const previewArgs = parsePreviewArgs(commandArgs);
    if (!previewArgs.input) {
      console.error('Error: Input PDF file is required');
      printCommandHelp('preview');
      process.exit(1);
    }
    await runPreview(previewArgs);
    return;
  }
```

- [ ] **Step 6: Add 'preview' case in switch statement**

Add in the switch after 'convert' case (around line 412):
```typescript
    case 'preview': {
      const previewArgs = parsePreviewArgs(commandArgs);
      if (!previewArgs.input) {
        console.error('Error: Input PDF file is required');
        printCommandHelp('preview');
        process.exit(1);
      }
      await runPreview(previewArgs);
      break;
    }
```

- [ ] **Step 7: Test CLI help**

Run: `npx tsx commands/cli.ts preview --help`
Expected: Should show preview help text

- [ ] **Step 8: Commit**

```bash
git add commands/cli.ts
git commit -m "feat: integrate preview command into CLI"
```

---

## Verification

Manual testing scenarios from the spec:

1. `npx tsx commands/cli.ts preview ./test.pdf` - Default output path
2. `npx tsx commands/cli.ts preview --input ./test.pdf --output ./previews` - Specify directory
3. `npx tsx commands/cli.ts preview --input ./test.PDF --output ./out.png` - Uppercase extension + full path
4. `npx tsx commands/cli.ts preview ./nonexistent.pdf` - File not found error

---

## Self-Review Checklist

- [ ] All spec requirements covered (CLI interface, output path rules, error handling)
- [ ] No placeholder/TODO patterns in code
- [ ] Types consistent: PreviewOptions, PreviewResult, PreviewArgs interfaces
- [ ] Error messages match spec exactly
- [ ] pdftoppm install hint uses `brew install poppler` for macOS

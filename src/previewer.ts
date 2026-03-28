// src/previewer.ts
import { execSync, execFileSync } from 'child_process';
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

    // Validate input file exists and is a regular file
    if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
      return { success: false, error: `Error: Input is not a valid file: ${inputPath}` };
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
          error: 'Error: pdftoppm not found. Install: brew install poppler (macOS)'
        };
      }

      // Run pdftoppm: -png (PNG output), -f 1 -l 1 (first page only)
      // Pass arguments as array to avoid command injection
      execFileSync('pdftoppm', ['-png', '-f', '1', '-l', '1', inputPath, outputPrefix], { stdio: 'pipe', timeout: 30000 });

      // pdftoppm creates outputPrefix-1.png (or -01.png with leading zero), rename to our outputPath
      const generatedFile1 = `${outputPrefix}-1.png`;
      const generatedFile01 = `${outputPrefix}-01.png`;
      const generatedFile = fs.existsSync(generatedFile1) ? generatedFile1
        : fs.existsSync(generatedFile01) ? generatedFile01
        : null;

      if (generatedFile) {
        if (generatedFile !== outputPath) {
          fs.renameSync(generatedFile, outputPath);
        }
        return { success: true, outputPath };
      }

      return { success: false, error: 'pdftoppm did not generate expected output' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Error: pdftoppm failed: ${message}` };
    }
  }
}
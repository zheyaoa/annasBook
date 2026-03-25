import { execa } from 'execa';
import { ConvertResult } from './types.js';

export class Converter {
  /**
   * Convert EPUB to PDF using Calibre's ebook-convert
   */
  async convert(inputPath: string, outputPath?: string): Promise<ConvertResult> {
    const output = outputPath || inputPath.replace(/\.epub$/i, '.pdf');

    try {
      await execa('ebook-convert', [
        inputPath,
        output,
        '--paper-size', 'a4',
      ], { timeout: 120000 });

      return { success: true, outputPath: output };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}
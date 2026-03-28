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
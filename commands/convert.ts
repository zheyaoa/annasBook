import fs from 'fs';
import path from 'path';
import { Converter } from '../src/converter.js';

interface ConvertArgs {
  input: string;
  output?: string;
}

export async function runConvert(args: ConvertArgs): Promise<void> {
  // 检查输入文件是否存在
  if (!fs.existsSync(args.input)) {
    console.error(`Error: File not found: ${args.input}`);
    process.exit(1);
  }

  // 检查是否是 EPUB 文件
  if (!args.input.toLowerCase().endsWith('.epub')) {
    console.error('Error: Input file must be an EPUB file');
    process.exit(1);
  }

  // 确定输出路径
  let outputPath: string;
  if (args.output) {
    // 如果 output 是目录，则使用原文件名
    if (fs.existsSync(args.output) && fs.statSync(args.output).isDirectory()) {
      outputPath = path.join(args.output, path.basename(args.input).replace(/\.epub$/i, '.pdf'));
    } else {
      outputPath = args.output;
    }
  } else {
    outputPath = args.input.replace(/\.epub$/i, '.pdf');
  }

  // 检查输出文件是否已存在
  if (fs.existsSync(outputPath)) {
    console.log(`PDF already exists: ${outputPath}`);
    process.exit(0);
  }

  console.log(`Converting: ${args.input}`);
  console.log(`Output: ${outputPath}`);

  const converter = new Converter();
  const result = await converter.convert(args.input, outputPath);

  if (result.success) {
    // 删除原 EPUB 文件
    fs.unlinkSync(args.input);
    console.log(`\nConverted successfully: ${result.outputPath}`);
  } else {
    console.error(`\nConversion failed: ${result.error}`);
    process.exit(1);
  }
}
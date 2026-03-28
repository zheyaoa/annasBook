// test/test-preview.ts
// Standalone test script for Previewer class
import { Previewer, PreviewOptions, PreviewResult } from '../src/previewer';
import fs from 'fs';
import path from 'path';

const TEST_PDF = './test/fixtures/sample.pdf';
const OUTPUT_DIR = './test/output';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertExists(path: string, message: string) {
  if (!fs.existsSync(path)) {
    throw new Error(`ASSERTION FAILED: ${message} - file does not exist: ${path}`);
  }
}

async function runTests() {
  console.log('=== Previewer Tests ===\n');
  const previewer = new Previewer();
  let passed = 0;
  let failed = 0;

  // Test 1: should generate preview with default output path
  console.log('Test 1: Generate preview with default output path');
  try {
    // Clean up any existing output
    const expectedOutput = TEST_PDF.replace(/\.pdf$/, '.png');
    if (fs.existsSync(expectedOutput)) {
      fs.unlinkSync(expectedOutput);
    }

    const options: PreviewOptions = { inputPath: TEST_PDF };
    const result = await previewer.generatePreview(options);

    assert(result.success === true, `Expected success=true, got ${result.success}`);
    assert(result.outputPath !== undefined, 'Expected outputPath to be defined');
    assertExists(result.outputPath!, `Expected output file to exist at ${result.outputPath}`);

    console.log(`  PASSED: Generated ${result.outputPath}`);
    passed++;
  } catch (err) {
    console.log(`  FAILED: ${err}`);
    failed++;
  }

  // Test 2: should reject non-existent input file
  console.log('\nTest 2: Reject non-existent input file');
  try {
    const options: PreviewOptions = { inputPath: './nonexistent.pdf' };
    const result = await previewer.generatePreview(options);

    assert(result.success === false, `Expected success=false, got ${result.success}`);
    assert(result.error !== undefined, 'Expected error to be defined');
    assert(result.error!.includes('not found'), `Expected error to contain "not found", got: ${result.error}`);

    console.log(`  PASSED: Correctly rejected non-existent file with error: ${result.error}`);
    passed++;
  } catch (err) {
    console.log(`  FAILED: ${err}`);
    failed++;
  }

  // Test 3: should generate preview with custom output path
  console.log('\nTest 3: Generate preview with custom output path');
  try {
    // Ensure output dir exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const customOutput = path.join(OUTPUT_DIR, 'custom-preview.png');
    if (fs.existsSync(customOutput)) {
      fs.unlinkSync(customOutput);
    }

    const options: PreviewOptions = { inputPath: TEST_PDF, outputPath: customOutput };
    const result = await previewer.generatePreview(options);

    assert(result.success === true, `Expected success=true, got ${result.success}`);
    assertExists(customOutput, 'Expected custom output file to exist');

    console.log(`  PASSED: Generated ${customOutput}`);
    passed++;
  } catch (err) {
    console.log(`  FAILED: ${err}`);
    failed++;
  }

  // Test 4: should handle output to directory
  console.log('\nTest 4: Generate preview to output directory');
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Clean up existing file in output dir
    const expectedOutput = path.join(OUTPUT_DIR, 'sample.png');
    if (fs.existsSync(expectedOutput)) {
      fs.unlinkSync(expectedOutput);
    }

    const options: PreviewOptions = { inputPath: TEST_PDF, outputPath: OUTPUT_DIR };
    const result = await previewer.generatePreview(options);

    assert(result.success === true, `Expected success=true, got ${result.success}`);
    assertExists(expectedOutput, 'Expected output file to exist in directory');

    console.log(`  PASSED: Generated ${expectedOutput}`);
    passed++;
  } catch (err) {
    console.log(`  FAILED: ${err}`);
    failed++;
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
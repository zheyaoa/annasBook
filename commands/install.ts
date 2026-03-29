import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Get the directory where this script is installed (package root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Go up from dist/commands/ to package root
const PACKAGE_ROOT = path.resolve(__dirname, '../..');

const SOURCE_DIR = path.join(PACKAGE_ROOT, 'assets', 'skills');
const TARGET_DIR = path.join(os.homedir(), '.claude', 'skills');

export async function runInstall(): Promise<void> {
  // Resolve ~ to actual home directory
  const targetDir = TARGET_DIR;

  console.log(`Installing skills to ${targetDir}...`);

  // Check if source directory exists
  if (!fs.existsSync(SOURCE_DIR)) {
    console.warn(`Warning: Source directory does not exist: ${SOURCE_DIR}`);
    console.warn('No skills to install.');
    return;
  }

  // Read source directory
  const entries = fs.readdirSync(SOURCE_DIR, { withFileTypes: true });
  const skillDirs = entries.filter(e => e.isDirectory());

  if (skillDirs.length === 0) {
    console.warn('Warning: No skill directories found in assets/skills/');
    return;
  }

  // Create target directory if needed
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Install each skill
  let installed = 0;
  for (const skill of skillDirs) {
    const sourcePath = path.join(SOURCE_DIR, skill.name);
    const targetPath = path.join(targetDir, skill.name);

    try {
      // Remove existing skill directory (for clean install)
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true });
      }

      // Copy skill directory
      await copyDir(sourcePath, targetPath);
      console.log(`✓ Installed: ${skill.name}`);
      installed++;
    } catch (error) {
      console.error(`✗ Failed to install ${skill.name}: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  console.log(`Done. ${installed} skill(s) installed.`);
  process.exit(0);
}

async function copyDir(src: string, dest: string): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

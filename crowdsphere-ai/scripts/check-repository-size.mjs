#!/usr/bin/env node
/**
 * Repository size checker for CrowdSphere AI.
 * Calculates total source size, excluding build artifacts and dependencies.
 * Fails if size exceeds 9.5 MB.
 *
 * @module check-repository-size
 */

import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

/** Directories to exclude from size calculation */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.nyc_output',
  '.cache',
  'tmp',
  'temp',
]);

/** File extensions to skip */
const EXCLUDED_EXTENSIONS = new Set([
  '.log',
  '.tsbuildinfo',
]);

const LIMIT_BYTES = 9.5 * 1024 * 1024; // 9.5 MB
const WARN_BYTES = 8 * 1024 * 1024;    // 8 MB

/**
 * Recursively calculates total size of a directory.
 * @param {string} dir - Directory to scan
 * @returns {{ totalBytes: number, fileCount: number }} Size result
 */
function calculateSize(dir) {
  let totalBytes = 0;
  let fileCount = 0;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return { totalBytes, fileCount };
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const sub = calculateSize(fullPath);
      totalBytes += sub.totalBytes;
      fileCount += sub.fileCount;
    } else if (entry.isFile()) {
      const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop() : '';
      if (EXCLUDED_EXTENSIONS.has(ext)) continue;
      try {
        const { size } = statSync(fullPath);
        totalBytes += size;
        fileCount++;
      } catch {
        // ignore unreadable files
      }
    }
  }

  return { totalBytes, fileCount };
}

/**
 * Format bytes to human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Run the check
console.log('');
console.log('═══════════════════════════════════════════════');
console.log('   CrowdSphere AI — Repository Size Check');
console.log('═══════════════════════════════════════════════');
console.log(`Root: ${ROOT}`);
console.log(`Excluding: ${[...EXCLUDED_DIRS].join(', ')}`);
console.log('');

const { totalBytes, fileCount } = calculateSize(ROOT);
const totalMB = totalBytes / (1024 * 1024);
const limitMB = LIMIT_BYTES / (1024 * 1024);
const warnMB = WARN_BYTES / (1024 * 1024);

console.log(`Files scanned : ${fileCount}`);
console.log(`Total size    : ${formatBytes(totalBytes)} (${totalMB.toFixed(3)} MB)`);
console.log(`Hard limit    : ${formatBytes(LIMIT_BYTES)} (${limitMB.toFixed(1)} MB)`);
console.log('');

if (totalBytes > LIMIT_BYTES) {
  console.error('✗ FAIL — Repository exceeds the 9.5 MB hard limit.');
  console.error(`  Current: ${formatBytes(totalBytes)}`);
  console.error(`  Limit  : ${formatBytes(LIMIT_BYTES)}`);
  console.error('  Remove large files, build outputs, or binary assets.');
  process.exit(1);
} else if (totalBytes > WARN_BYTES) {
  console.warn(`⚠ WARNING — Repository is above ${formatBytes(WARN_BYTES)}. Consider trimming.`);
  console.log('✓ PASS — Repository is within the 9.5 MB limit.');
} else {
  console.log('✓ PASS — Repository is within the 9.5 MB limit.');
}

console.log('═══════════════════════════════════════════════');
console.log('');

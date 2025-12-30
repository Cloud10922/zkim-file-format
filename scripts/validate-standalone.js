#!/usr/bin/env node
/**
 * Validation script for standalone zkim-file-format repository
 * Prevents committing monorepo-specific files or imports
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

// Get staged files
let stagedFiles = [];
try {
  const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
  stagedFiles = output.trim().split('\n').filter(Boolean);
} catch (e) {
  // No staged files or not a git repo
  console.log('✅ No files staged');
  process.exit(0);
}

if (stagedFiles.length === 0) {
  console.log('✅ No files staged');
  process.exit(0);
}

let hasErrors = false;
const errors = [];

// Check 1: Verify all files are in the package directory
console.log('🔍 Checking file paths...');
for (const file of stagedFiles) {
  // Block files that reference parent directories
  if (file.startsWith('../') || file.startsWith('../../') || file.includes('/../')) {
    errors.push(`❌ File outside package scope: ${file}`);
    hasErrors = true;
  }
}

// Check 2: Scan for monorepo imports
console.log('🔍 Checking for monorepo imports...');
let stagedContent = '';
try {
  stagedContent = execSync('git diff --cached', { encoding: 'utf-8' });
} catch (e) {
  // No staged content
}

// Check for monorepo import patterns
const monorepoImportPatterns = [
  /from\s+["']@\/domains\//g,
  /from\s+["']@\/infrastructure\//g,
  /import\s+.*from\s+["']@\/domains\//g,
  /import\s+.*from\s+["']@\/infrastructure\//g,
  /require\(["']@\/domains\//g,
  /require\(["']@\/infrastructure\//g,
];

// Exclude zkim-file-format infrastructure (it's part of this package)
const allowedInfrastructure = /@\/infrastructure\/zkim-file-format/;

for (const pattern of monorepoImportPatterns) {
  const matches = stagedContent.match(pattern);
  if (matches) {
    // Filter out allowed infrastructure
    const violations = matches.filter(match => !allowedInfrastructure.test(match));
    if (violations.length > 0) {
      errors.push(`❌ Monorepo imports detected: ${violations.slice(0, 3).join(', ')}${violations.length > 3 ? '...' : ''}`);
      hasErrors = true;
    }
  }
}

// Check 3: Verify no parent directory references in imports
console.log('🔍 Checking for parent directory references...');
const parentDirPatterns = [
  /from\s+["']\.\.\/\.\.\/\.\./g,
  /import\s+.*from\s+["']\.\.\/\.\.\/\.\./g,
  /require\(["']\.\.\/\.\.\/\.\./g,
];

for (const pattern of parentDirPatterns) {
  if (pattern.test(stagedContent)) {
    errors.push('❌ Parent directory references detected (../../..)');
    hasErrors = true;
    break;
  }
}

// Check 4: Verify remote is correct
console.log('🔍 Verifying Git remote...');
try {
  const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
  if (!remoteUrl.includes('zkim-file-format')) {
    errors.push(`❌ Wrong remote detected: ${remoteUrl}`);
    errors.push('   Expected: zkim-file-format repository');
    hasErrors = true;
  }
} catch (e) {
  // Remote might not be set, that's okay for validation
}

// Report results
if (hasErrors) {
  console.log('\n❌ VALIDATION FAILED\n');
  errors.forEach(error => console.log(error));
  console.log('\n📋 Fix the issues above before committing.');
  console.log('   This repository should only contain the zkim-file-format package.');
  console.log('   Do not commit monorepo-specific files or imports.\n');
  process.exit(1);
} else {
  console.log('✅ All validation checks passed');
  process.exit(0);
}

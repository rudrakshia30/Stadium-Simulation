#!/usr/bin/env node
/**
 * Submission verification script for CrowdSphere AI.
 * Checks that all required files exist and that no secrets are committed.
 *
 * @module verify-submission
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

let passed = 0;
let failed = 0;
const failures = [];

/**
 * @param {string} description
 * @param {boolean} condition
 */
function check(description, condition) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.error(`  ✗ ${description}`);
    failures.push(description);
    failed++;
  }
}

/**
 * Check if a file exists.
 * @param {string} relativePath
 */
function fileExists(relativePath) {
  return existsSync(join(ROOT, relativePath));
}

/**
 * Read file content safely.
 * @param {string} relativePath
 * @returns {string}
 */
function readFile(relativePath) {
  try {
    return readFileSync(join(ROOT, relativePath), 'utf8');
  } catch {
    return '';
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log('   CrowdSphere AI — Submission Verification');
console.log('═══════════════════════════════════════════════════════');
console.log('');

// ─── 1. Required root files ───────────────────────────────────────────────
console.log('1. Required root files');
check('package.json exists', fileExists('package.json'));
check('.env.example exists', fileExists('.env.example'));
check('.gitignore exists', fileExists('.gitignore'));
check('LICENSE exists', fileExists('LICENSE'));
check('README.md exists', fileExists('README.md'));
check('SECURITY.md exists', fileExists('SECURITY.md'));
console.log('');

// ─── 2. .env is not committed ─────────────────────────────────────────────
console.log('2. Secret protection');
check('.env is NOT committed', !fileExists('.env'));
check('server/.env is NOT committed', !fileExists('server/.env'));
check('client/.env is NOT committed', !fileExists('client/.env'));

// Check .env.example has only placeholders
const envExample = readFile('.env.example');
check('.env.example exists and has content', envExample.length > 0);
check('.env.example does not contain real API keys', !envExample.match(/AAAA[A-Za-z0-9_-]{20,}/));

// Check for obvious secret patterns in source
const serverConfigContent = readFile('server/src/config/index.js');
check('Server config does not hardcode secrets', !serverConfigContent.match(/AIza[A-Za-z0-9_-]{35}/));
console.log('');

// ─── 3. Gemini integration files ─────────────────────────────────────────
console.log('3. Gemini integration files');
check('geminiClient.js exists', fileExists('server/src/ai/geminiClient.js'));
check('systemInstructions.js exists', fileExists('server/src/ai/systemInstructions.js'));
check('toolDeclarations.js exists', fileExists('server/src/ai/toolDeclarations.js'));
check('fanAssistantService.js exists', fileExists('server/src/ai/fanAssistantService.js'));
check('operationsBriefService.js exists', fileExists('server/src/ai/operationsBriefService.js'));
check('announcementService.js exists', fileExists('server/src/ai/announcementService.js'));
check('responseSchemas.js exists', fileExists('server/src/ai/responseSchemas.js'));
check('responseValidator.js exists', fileExists('server/src/ai/responseValidator.js'));
console.log('');

// ─── 4. Deterministic tools ───────────────────────────────────────────────
console.log('4. Deterministic tools');
check('routingEngine.js exists', fileExists('server/src/tools/routingEngine.js'));
check('riskEngine.js exists', fileExists('server/src/tools/riskEngine.js'));
check('facilityFinder.js exists', fileExists('server/src/tools/facilityFinder.js'));
check('priorityQueue.js exists', fileExists('server/src/tools/priorityQueue.js'));
check('routeCache.js exists', fileExists('server/src/tools/routeCache.js'));
console.log('');

// ─── 5. Server source files ───────────────────────────────────────────────
console.log('5. Server source files');
check('server/src/app.js exists', fileExists('server/src/app.js'));
check('server/src/server.js exists', fileExists('server/src/server.js'));
check('server/src/config/index.js exists', fileExists('server/src/config/index.js'));
check('server/src/utils/errors.js exists', fileExists('server/src/utils/errors.js'));
check('server/src/utils/logger.js exists', fileExists('server/src/utils/logger.js'));
check('server/src/middleware/auth.js exists', fileExists('server/src/middleware/auth.js'));
check('server/src/middleware/security.js exists', fileExists('server/src/middleware/security.js'));
console.log('');

// ─── 6. Client source files ───────────────────────────────────────────────
console.log('6. Client source files');
check('client/src/App.jsx exists', fileExists('client/src/App.jsx'));
check('client/src/main.jsx exists', fileExists('client/src/main.jsx'));
check('client/src/services/api.js exists', fileExists('client/src/services/api.js'));
check('client/public/sw.js exists', fileExists('client/public/sw.js'));
check('client/src/i18n/en.js exists', fileExists('client/src/i18n/en.js'));
check('client/src/i18n/ar.js exists', fileExists('client/src/i18n/ar.js'));
check('client/src/i18n/es.js exists', fileExists('client/src/i18n/es.js'));
check('client/src/i18n/fr.js exists', fileExists('client/src/i18n/fr.js'));
check('client/src/i18n/hi.js exists', fileExists('client/src/i18n/hi.js'));
console.log('');

// ─── 7. Test files ────────────────────────────────────────────────────────
console.log('7. Test files');
check('Server integration tests exist', fileExists('server/src/tests/integration.test.js'));
check('Server routing tests exist', fileExists('server/src/tests/routingEngine.test.js'));
check('Server risk engine tests exist', fileExists('server/src/tests/riskEngine.test.js'));
check('Client accessibility tests exist', fileExists('client/src/test/accessibility.test.jsx'));
check('Client landing page tests exist', fileExists('client/src/test/LandingPage.test.jsx'));
console.log('');

// ─── 8. Documentation ─────────────────────────────────────────────────────
console.log('8. Documentation');
check('docs/ARCHITECTURE.md exists', fileExists('docs/ARCHITECTURE.md'));
check('docs/JUDGING-EVIDENCE.md exists', fileExists('docs/JUDGING-EVIDENCE.md'));
check('docs/THREAT-MODEL.md exists', fileExists('docs/THREAT-MODEL.md'));
check('docs/TEST-STRATEGY.md exists', fileExists('docs/TEST-STRATEGY.md'));
check('SECURITY.md exists', fileExists('SECURITY.md'));

// Check README completeness
const readme = readFile('README.md');
check('README.md has setup instructions', readme.includes('npm install'));
check('README.md has environment variables section', readme.includes('GEMINI_API_KEY'));
check('README.md has disclaimer', readme.toLowerCase().includes('not affiliated'));
console.log('');

// ─── 9. Accessibility statement ───────────────────────────────────────────
console.log('9. Accessibility');
check('Accessibility statement page exists', fileExists('client/src/pages/AccessibilityStatementPage/AccessibilityStatementPage.jsx'));
console.log('');

// ─── 10. Security documentation ───────────────────────────────────────────
console.log('10. Security documentation');
check('Threat model exists', fileExists('docs/THREAT-MODEL.md'));
const threatModel = readFile('docs/THREAT-MODEL.md');
check('Threat model covers prompt injection', threatModel.toLowerCase().includes('prompt injection') || threatModel.toLowerCase().includes('prompt-injection'));
check('Threat model covers authentication', threatModel.toLowerCase().includes('authentication'));
console.log('');

// ─── 11. GitHub Actions ───────────────────────────────────────────────────
console.log('11. CI/CD');
check('.github/workflows/ci.yml exists', fileExists('.github/workflows/ci.yml'));
const ciContent = readFile('.github/workflows/ci.yml');
check('CI runs tests', ciContent.includes('test'));
check('CI runs lint', ciContent.includes('lint'));
check('CI runs build', ciContent.includes('build'));
console.log('');

// ─── 12. Environment variables documented ─────────────────────────────────
console.log('12. Environment documentation');
const envEx = readFile('.env.example');
check('GEMINI_API_KEY documented', envEx.includes('GEMINI_API_KEY'));
check('JWT_SECRET documented', envEx.includes('JWT_SECRET'));
check('OPS_ACCESS_CODE documented', envEx.includes('OPS_ACCESS_CODE'));
check('PORT documented', envEx.includes('PORT'));
console.log('');

// ─── Summary ──────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('');

if (failed > 0) {
  console.error('✗ VERIFICATION FAILED');
  console.error('');
  console.error('Failed checks:');
  failures.forEach((f) => console.error(`  • ${f}`));
  console.error('');
  process.exit(1);
} else {
  console.log('✓ ALL CHECKS PASSED — Ready for submission');
}

console.log('═══════════════════════════════════════════════════════');
console.log('');

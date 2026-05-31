#!/usr/bin/env node
// Prerequisite validator — run via: npm run doctor

import { execSync }                                       from 'child_process';
import { existsSync, accessSync, constants,
         mkdirSync, writeFileSync, unlinkSync,
         readFileSync }                                    from 'fs';
import { join, dirname }                                  from 'path';
import { fileURLToPath }                                  from 'url';

const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');

// ---------------------------------------------------------------------------
// Terminal helpers — no chalk dependency so doctor works before npm install
// ---------------------------------------------------------------------------

const G = '\x1b[32m'; // green
const R = '\x1b[31m'; // red
const Y = '\x1b[33m'; // yellow
const B = '\x1b[1m';  // bold
const D = '\x1b[2m';  // dim
const X = '\x1b[0m';  // reset

const TICK  = `${G}✓${X}`;
const CROSS = `${R}✗${X}`;

function pass(msg)        { console.log(`  ${TICK}  ${msg}`); }
function fail(msg, fix)   {
  console.log(`  ${CROSS}  ${msg}`);
  if (fix) console.log(`     ${D}Fix: ${fix}${X}`);
}
function warn(msg, note)  {
  console.log(`  ${Y}!${X}  ${msg}`);
  if (note) console.log(`     ${D}Note: ${note}${X}`);
}

// ---------------------------------------------------------------------------
// Individual checks — each returns true (pass) or false (fail)
// ---------------------------------------------------------------------------

// 1. Node.js ≥ 20
function checkNodeVersion() {
  const major = parseInt(process.version.slice(1).split('.')[0], 10);
  if (major >= 20) {
    pass(`Node.js ${process.version}  (≥ 20 required)`);
    return true;
  }
  fail(
    `Node.js ${process.version} — version 20 or higher required`,
    'Install Node.js 20+ from https://nodejs.org'
  );
  return false;
}

// 2. Claude Code installed
function checkClaudeCode() {
  const isWindows = process.platform === 'win32';
  const which     = isWindows ? 'where' : 'which';

  try {
    execSync(`${which} claude`, { stdio: 'pipe' });
    let version = '';
    try { version = execSync('claude --version', { stdio: 'pipe' }).toString().trim(); } catch {}
    pass(`Claude Code installed${version ? ` (${version})` : ''}`);
    return true;
  } catch {
    fail(
      'Claude Code not found in PATH',
      'npm install -g @anthropic-ai/claude-code'
    );
    return false;
  }
}

// 3. ANTHROPIC_API_KEY
function checkApiKey() {
  const key       = process.env.ANTHROPIC_API_KEY ?? '';
  const isWindows = process.platform === 'win32';

  if (key.startsWith('sk-ant-')) {
    pass(`ANTHROPIC_API_KEY set  (sk-ant-...${key.slice(-4)})`);
    return true;
  }
  if (key) {
    fail(
      'ANTHROPIC_API_KEY set but value does not match expected format (sk-ant-...)',
      'Verify your key at https://console.anthropic.com'
    );
    return false;
  }
  fail(
    'ANTHROPIC_API_KEY not set in environment',
    isWindows
      ? '$env:ANTHROPIC_API_KEY = "sk-ant-..."  (PowerShell)'
      : 'export ANTHROPIC_API_KEY="sk-ant-..."'
  );
  return false;
}

// 4. researcher.yml — must exist and not be the example file
function checkResearcherYml() {
  const p = join(ROOT, 'researcher.yml');

  if (!existsSync(p)) {
    fail(
      'researcher.yml not found',
      'node src/index.js onboard'
    );
    return false;
  }

  const contents = readFileSync(p, 'utf8');

  // If the file contains the example placeholder name it hasn't been filled in.
  if (contents.includes('Alex Chen') || contents.trim().length < 50) {
    fail(
      'researcher.yml looks like the example template — run onboard to create your profile',
      'node src/index.js onboard'
    );
    return false;
  }

  // Quick YAML structure sanity check — look for required top-level keys.
  const hasProfile     = /^profile:/m.test(contents);
  const hasSkills      = /^skills:/m.test(contents);
  const hasConstraints = /^constraints:/m.test(contents);

  if (!hasProfile || !hasSkills || !hasConstraints) {
    fail(
      'researcher.yml is missing required sections (profile / skills / constraints)',
      'node src/index.js onboard'
    );
    return false;
  }

  pass('researcher.yml found and valid');
  return true;
}

// 5. data/ folder writable
function checkDataFolder() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const probe = join(DATA_DIR, '.write-probe');
    writeFileSync(probe, 'ok');
    unlinkSync(probe);
    pass('data/ folder exists and is writable');
    return true;
  } catch (err) {
    const isWindows = process.platform === 'win32';
    fail(
      `data/ folder is not writable: ${err.message}`,
      isWindows ? 'mkdir data' : 'mkdir -p data && chmod 755 data'
    );
    return false;
  }
}

// 6. seen-papers.tsv
function checkSeenPapers() {
  const p = join(DATA_DIR, 'seen-papers.tsv');

  if (existsSync(p)) {
    pass('data/seen-papers.tsv found');
    return true;
  }

  // Not fatal — the file is auto-created on first discover run.
  warn(
    'data/seen-papers.tsv not found',
    'Auto-created on first run of: node src/index.js discover'
  );
  return false;
}

// 7. tracker.tsv
function checkTrackerTsv() {
  const p = join(ROOT, 'tracker.tsv');

  if (existsSync(p)) {
    pass('tracker.tsv found');
    return true;
  }

  warn(
    'tracker.tsv not found',
    'Auto-created on first run of: node src/index.js onboard'
  );
  return false;
}

// 8. Required npm packages present in node_modules
function checkPackages() {
  const required = [
    '@anthropic-ai/sdk',
    'chalk',
    'commander',
    'inquirer',
    'js-yaml',
    'zod',
    'cli-table3',
    'axios',
    'p-limit',
  ];

  const missing = required.filter(
    (pkg) => !existsSync(join(ROOT, 'node_modules', pkg))
  );

  if (missing.length === 0) {
    pass(`All ${required.length} required packages installed`);
    return true;
  }

  fail(
    `Missing packages: ${missing.join(', ')}`,
    'npm install'
  );
  return false;
}

// 9. Semantic Scholar API reachable
async function checkSemanticScholar() {
  const url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=transformer&limit=1&fields=paperId';

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 6_000);

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (resp.ok) {
      pass('Semantic Scholar API reachable');
      return true;
    }

    fail(
      `Semantic Scholar API returned HTTP ${resp.status}`,
      'Check https://status.semanticscholar.org or try again shortly'
    );
    return false;
  } catch (err) {
    const msg = err.name === 'AbortError'
      ? 'Semantic Scholar API did not respond within 6 s'
      : `Semantic Scholar API unreachable: ${err.message}`;

    fail(msg, 'Check your internet connection or try again shortly');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const TOTAL = 9;

console.log(`\n${B}Research-Ops — prerequisite check${X}\n`);

const results = await Promise.all([
  checkNodeVersion(),
  checkClaudeCode(),
  checkApiKey(),
  checkResearcherYml(),
  checkDataFolder(),
  checkSeenPapers(),
  checkTrackerTsv(),
  checkPackages(),
  checkSemanticScholar(),
]);

// Checks 6 and 7 (TSV files) use warn() not fail(), so their false doesn't
// mean "broken" — treat them as optional in the summary.
const hardFails = [0, 1, 2, 3, 4, 7, 8]; // indices of checks that are blocking
const passed    = results.filter(Boolean).length;
const blocked   = hardFails.filter((i) => !results[i]).length;

console.log(`\n${D}${'─'.repeat(38)}${X}`);
console.log(`${B}${passed}/${TOTAL} checks passed${X}`);

if (blocked === 0) {
  console.log(`${G}Research-Ops is ready.${X} Run: node src/index.js onboard`);
} else {
  console.log(`${R}Fix the above issues and run npm run doctor again.${X}`);
}

console.log();

process.exit(blocked > 0 ? 1 : 0);

import chalk from 'chalk';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tw, divider } from './utils/terminal.js';
import { readProfile } from './utils/profile.js';

const ROOT            = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHORTLISTED_DIR = join(ROOT, 'data', 'shortlisted');
const GAPS_PATH       = join(ROOT, 'data', 'gaps.json');
const COMPARISON_PATH = join(ROOT, 'data', 'comparison.json');
const IDEAS_DIR       = join(ROOT, 'data', 'ideas');
const SEEN_PATH       = join(ROOT, 'data', 'seen-papers.tsv');

// ---------------------------------------------------------------------------
// Pipeline state reader
// ---------------------------------------------------------------------------

function readPipelineState() {
  // ── Seen papers ───────────────────────────────────────────────────────────
  const seenCount = existsSync(SEEN_PATH)
    ? readFileSync(SEEN_PATH, 'utf8').split('\n').filter(Boolean).length
    : 0;

  // ── Shortlisted papers and reviews ───────────────────────────────────────
  const shortlistedFiles = existsSync(SHORTLISTED_DIR)
    ? readdirSync(SHORTLISTED_DIR).filter((f) => f.endsWith('.json'))
    : [];

  const paperFiles  = shortlistedFiles.filter((f) => !f.endsWith('_review.json'));
  const reviewFiles = shortlistedFiles.filter((f) =>  f.endsWith('_review.json'));

  // ── Comparison ────────────────────────────────────────────────────────────
  let compData         = null;
  let contradictions   = 0;

  if (existsSync(COMPARISON_PATH)) {
    try {
      compData       = JSON.parse(readFileSync(COMPARISON_PATH, 'utf8'));
      contradictions = (compData.contradictions ?? []).length;
    } catch { /* malformed file — treat as missing */ }
  }

  // ── Gaps ──────────────────────────────────────────────────────────────────
  let gaps         = [];
  let highGaps     = 0;
  let priorityGapId = null;

  if (existsSync(GAPS_PATH)) {
    try {
      const gd      = JSON.parse(readFileSync(GAPS_PATH, 'utf8'));
      gaps          = gd.gaps ?? [];
      highGaps      = gaps.filter((g) => g.severity === 'high').length;
      priorityGapId = gd.priority_gap ?? null;
    } catch { /* malformed — treat as empty */ }
  }

  // ── Ideas and advisor reviews ─────────────────────────────────────────────
  const ideaFiles = existsSync(IDEAS_DIR)
    ? readdirSync(IDEAS_DIR).filter((f) => f.endsWith('.json'))
    : [];

  const ideas         = ideaFiles.filter((f) => !f.endsWith('_advisor.json'));
  const advisorReviews = ideaFiles.filter((f) =>  f.endsWith('_advisor.json'));

  return {
    seenCount,
    paperCount:      paperFiles.length,
    reviewCount:     reviewFiles.length,
    hasComparison:   compData !== null,
    contradictions,
    gapCount:        gaps.length,
    highGaps,
    priorityGapId,
    ideaCount:       ideas.length,
    advisorCount:    advisorReviews.length,
  };
}

// ---------------------------------------------------------------------------
// Next action inference
// ---------------------------------------------------------------------------

function inferNextAction(state) {
  if (state.paperCount === 0) {
    return 'node src/index.js discover';
  }
  if (state.reviewCount === 0) {
    return 'node src/index.js litreview';
  }
  if (!state.hasComparison) {
    return 'node src/index.js compare';
  }
  if (state.gapCount === 0) {
    return 'node src/index.js gaps';
  }
  if (state.ideaCount === 0) {
    const gapArg = state.priorityGapId ? ` ${state.priorityGapId}` : '';
    return `node src/index.js ideate${gapArg}`;
  }
  if (state.advisorCount === 0 && state.ideaCount > 0) {
    const gapArg = state.priorityGapId ? ` ${state.priorityGapId}` : '';
    return `node src/index.js ideate${gapArg}   (select advisor when prompted)`;
  }
  return 'Pipeline complete. Review data/ideas/ for your research proposals.';
}

// ---------------------------------------------------------------------------
// Row renderer
// ---------------------------------------------------------------------------

function statusDot(active) {
  return active ? chalk.green('●') : chalk.gray('○');
}

function renderRow(label, left, right, active) {
  const dot      = statusDot(active);
  const labelStr = chalk.bold(label.padEnd(12));
  const arrow    = chalk.dim('→');
  const W        = Math.min(tw() - 4, 90);
  const leftStr  = (left  ?? '').padEnd(20);
  const rightStr = right ?? '';

  return ` ${dot}  ${labelStr}  ${leftStr}  ${arrow}  ${rightStr}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runTracker() {
  // ── Read profile (optional — tracker works without it) ────────────────────
  let profileName = '(no profile)';
  let domain      = '';

  try {
    const profile = readProfile();
    profileName   = profile.profile.name;
    domain        = profile.domain.primary;
  } catch { /* continue without profile */ }

  // ── Read pipeline state ───────────────────────────────────────────────────
  const state      = readPipelineState();
  const nextAction = inferNextAction(state);

  // ── Header ────────────────────────────────────────────────────────────────
  const W      = Math.min(tw() - 4, 90);
  const border = chalk.bold('═'.repeat(W));

  console.log('\n' + border);
  const subtitle = domain ? `${profileName} · ${domain}` : profileName;
  console.log(chalk.bold.cyan(` RESEARCH-OPS PIPELINE · ${subtitle}`));
  console.log(border);

  console.log();

  // ── Pipeline rows ─────────────────────────────────────────────────────────

  // DISCOVERED
  const discLeft  = state.seenCount > 0
    ? `${state.seenCount} paper${state.seenCount === 1 ? '' : 's'} seen`
    : 'not started';
  const discRight = state.paperCount > 0
    ? chalk.green(`${state.paperCount} shortlisted`)
    : chalk.gray('0 shortlisted');
  console.log(renderRow('DISCOVERED', discLeft, discRight, state.paperCount > 0));

  // REVIEWED
  const revLeft  = state.paperCount > 0
    ? `${state.paperCount} paper${state.paperCount === 1 ? '' : 's'}`
    : 'waiting on discover';
  const revRight = state.reviewCount > 0
    ? chalk.green(`${state.reviewCount} with full reviews`)
    : chalk.gray('0 reviewed');
  console.log(renderRow('REVIEWED', revLeft, revRight, state.reviewCount > 0));

  // COMPARED
  const cmpLeft  = state.hasComparison ? 'complete' : 'not run';
  const cmpRight = state.hasComparison
    ? chalk.green(`${state.contradictions} contradiction${state.contradictions === 1 ? '' : 's'} found`)
    : chalk.gray('—');
  console.log(renderRow('COMPARED', cmpLeft, cmpRight, state.hasComparison));

  // GAPS
  const gapLeft  = state.gapCount > 0
    ? `${state.gapCount} gap${state.gapCount === 1 ? '' : 's'}`
    : 'not run';
  const gapRight = state.gapCount > 0
    ? chalk.green(`${state.highGaps} high severity`)
    : chalk.gray('—');
  console.log(renderRow('GAPS', gapLeft, gapRight, state.gapCount > 0));

  // IDEATING
  const ideaLeft  = state.ideaCount > 0
    ? `${state.ideaCount} idea${state.ideaCount === 1 ? '' : 's'}`
    : 'not run';
  const ideaRight = state.ideaCount > 0
    ? (state.advisorCount > 0
        ? chalk.green(`${state.advisorCount} advisor reviewed`)
        : chalk.yellow('0 advisor reviewed'))
    : chalk.gray('—');
  console.log(renderRow('IDEATING', ideaLeft, ideaRight, state.ideaCount > 0));

  console.log();

  // ── Next action ───────────────────────────────────────────────────────────
  const isComplete = nextAction.startsWith('Pipeline complete');

  console.log(divider('─'));

  if (isComplete) {
    console.log(chalk.bold.green(' NEXT ACTION: ') + chalk.green(nextAction));
  } else {
    console.log(chalk.bold.cyan(' NEXT ACTION: ') + chalk.cyan('Run: ' + nextAction));
  }

  console.log(divider('─'));
  console.log();
}

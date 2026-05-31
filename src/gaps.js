import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tw, divider, wrapLines } from './utils/terminal.js';
import { readProfile, appendTracker } from './utils/profile.js';

const ROOT            = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHORTLISTED_DIR = join(ROOT, 'data', 'shortlisted');
const COMPARISON_PATH = join(ROOT, 'data', 'comparison.json');
const GAPS_PATH       = join(ROOT, 'data', 'gaps.json');
const SKILLS_PATH     = join(ROOT, 'skills', 'gaps.md');

const GAPS_MODEL = 'claude-opus-4-7';

// Per-type chalk colors as specified.
const TYPE_COLOR = {
  methodology_gap:          chalk.blue,
  contradiction_gap:        chalk.red,
  population_gap:           chalk.yellow,
  technology_gap:           chalk.cyan,
  evaluation_gap:           chalk.magenta,
  coverage_gap:             chalk.white,
  performance_tradeoff_gap: chalk.green,
};

const FALLBACK_SYSTEM_PROMPT = `\
You are a research gap analyst helping an engineering student identify where they can
make an original contribution to their field.

Analyze the provided corpus of paper reviews and cross-paper comparison to identify
ALL meaningful research gaps — problems the field has not solved, inconsistencies
between papers, and underexplored territory.

Rules:
- Every gap must be grounded in evidence from the provided papers.
- feasibility_for_researcher must explicitly account for the student's stated skill level,
  compute access, and weekly hours — not a generic assessment.
- suggested_rq must be a specific, answerable research question. Not a vague direction.
- estimated_scope must be realistic: if a student has 12 hrs/week on a laptop, a scope
  of '6+ months' on an HPC task is not realistic.
- Return only valid JSON. No preamble, explanation, or markdown fences.`;

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

function loadComparison() {
  if (!existsSync(COMPARISON_PATH)) {
    console.error(chalk.red('\nNo comparison data found (data/comparison.json).'));
    console.error(chalk.yellow('Run `node src/index.js compare` first.\n'));
    process.exit(1);
  }
  return JSON.parse(readFileSync(COMPARISON_PATH, 'utf8'));
}

function loadReviews() {
  if (!existsSync(SHORTLISTED_DIR)) {
    console.error(chalk.red('\nNo review files found. Run `node src/index.js litreview` first.\n'));
    process.exit(1);
  }
  const files = readdirSync(SHORTLISTED_DIR).filter((f) => f.endsWith('_review.json'));
  if (files.length === 0) {
    console.error(chalk.red('\nNo review files found. Run `node src/index.js litreview` first.\n'));
    process.exit(1);
  }
  return files.map((f) => JSON.parse(readFileSync(join(SHORTLISTED_DIR, f), 'utf8')));
}

function loadSystemPrompt() {
  return existsSync(SKILLS_PATH)
    ? readFileSync(SKILLS_PATH, 'utf8')
    : FALLBACK_SYSTEM_PROMPT;
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

function extractJSON(text) {
  return JSON.parse(
    text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
  );
}

function buildUserMessage(reviews, comparison, profile) {
  const tools = [
    ...profile.skills.programming,
    ...profile.skills.tools,
  ].join(', ') || '(none listed)';

  return `\
You are analyzing a corpus of ${reviews.length} paper${reviews.length === 1 ? '' : 's'} \
in ${profile.domain.primary} for a ${profile.skills.level} researcher \
whose north star is ${profile.goals.north_star} with ${profile.constraints.hours_per_week} \
hours/week on ${profile.constraints.compute}.

Their interests: ${(profile.goals.interests ?? []).join(', ') || '(none listed)'}
Their tools: ${tools}
Their dataset access: ${profile.constraints.dataset_access}

Comparison data:
${JSON.stringify(comparison, null, 2)}

Individual reviews:
${JSON.stringify(reviews, null, 2)}

Identify ALL research gaps. Classify each into exactly one of:
  methodology_gap, contradiction_gap, population_gap, technology_gap,
  evaluation_gap, coverage_gap, performance_tradeoff_gap

Return ONLY valid JSON matching this exact schema:
{
  "gaps": [
    {
      "gap_id": "GAP-001",
      "type": "string",
      "title": "string",
      "description": "string",
      "evidence": [
        { "paperId": "string", "quote_or_reasoning": "string" }
      ],
      "severity": "high" | "medium" | "low",
      "feasibility_for_researcher": "high" | "medium" | "low",
      "feasibility_reasoning": "string",
      "suggested_rq": "string",
      "required_skills": ["string"],
      "required_compute": "string",
      "estimated_scope": "string"
    }
  ],
  "priority_gap": "GAP-001",
  "priority_reasoning": "string"
}`;
}

async function callClaude(client, systemPrompt, userMessage) {
  const systemBlock = [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
  ];

  const first = await client.messages.create({
    model:      GAPS_MODEL,
    max_tokens: 8_192,
    system:     systemBlock,
    messages:   [{ role: 'user', content: userMessage }],
  });

  const firstText = first.content[0].text;
  try {
    return extractJSON(firstText);
  } catch {
    console.log(chalk.yellow('  [!] Response was not valid JSON — retrying...'));
    const retry = await client.messages.create({
      model:      GAPS_MODEL,
      max_tokens: 8_192,
      system:     systemBlock,
      messages: [
        { role: 'user',      content: userMessage },
        { role: 'assistant', content: firstText },
        { role: 'user',      content: 'Your previous response was not valid JSON. Return only the JSON object, no other text.' },
      ],
    });
    return extractJSON(retry.content[0].text);
  }
}

// ---------------------------------------------------------------------------
// Terminal report
// ---------------------------------------------------------------------------

function hr(char = '─', width = 64) {
  return chalk.gray(char.repeat(width));
}

function severityLabel(s) {
  if (s === 'high')   return chalk.red('high');
  if (s === 'medium') return chalk.yellow('medium');
  return chalk.gray('low');
}

function feasLabel(f) {
  if (f === 'high')   return chalk.green('high');
  if (f === 'medium') return chalk.yellow('medium');
  return chalk.red('low');
}

function drawPriorityBox(gap, reasoning) {
  const W = 68;
  const pad = (text = '') => {
    const s = String(text).slice(0, W - 2);
    return '  ' + s + ' '.repeat(Math.max(0, W - 2 - s.length));
  };

  // Wrap a string to lines of max `w` chars.
  const wrap = (text, w) => {
    const words = (text ?? '').split(/\s+/);
    const lines = [];
    let line    = '';
    for (const word of words) {
      if (line.length + word.length + 1 > w) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  };

  const top = chalk.bgBlue.white.bold('╔' + '═'.repeat(W) + '╗');
  const bot = chalk.bgBlue.white.bold('╚' + '═'.repeat(W) + '╝');
  const row = (t) => chalk.bgBlue.white('║' + pad(t) + '║');

  console.log('\n' + top);
  console.log(row(''));
  console.log(row(chalk.bold(`  ★  PRIORITY GAP: ${gap.gap_id}`)));
  console.log(row(chalk.bold(`     ${gap.title}`)));
  console.log(row(''));
  for (const line of wrap(reasoning, W - 6)) {
    console.log(row('  ' + line));
  }
  console.log(row(''));
  console.log(row(chalk.bold('  Research Question:')));
  for (const line of wrap(`"${gap.suggested_rq}"`, W - 6)) {
    console.log(row('  ' + line));
  }
  console.log(row(''));
  console.log(bot + '\n');
}

function renderGapCard(gap) {
  const color     = TYPE_COLOR[gap.type] ?? chalk.white;
  const sevColor  = { high: chalk.red, medium: chalk.yellow, low: chalk.gray }[gap.severity]   ?? chalk.gray;
  const feasColor = { high: chalk.green, medium: chalk.yellow, low: chalk.red }[gap.feasibility_for_researcher] ?? chalk.gray;
  const cardWrap  = Math.max(40, tw() - 6);

  // ┌ header line
  console.log(
    color.bold(`┌ ${gap.gap_id} · ${gap.type} · `) +
    sevColor.bold((gap.severity ?? 'low').toUpperCase() + ' severity')
  );

  // │ title
  for (const line of wrapLines(`Title: ${gap.title ?? ''}`, 2, cardWrap)) {
    console.log(color('│') + chalk.bold(line));
  }

  // │ feasibility + scope
  console.log(
    color('│ ') +
    `Feasibility: ${feasColor((gap.feasibility_for_researcher ?? '?').toUpperCase())}` +
    chalk.gray(`  ·  Scope: ${gap.estimated_scope ?? '?'}`)
  );

  // │ research question (wrapped)
  const rqLines = wrapLines(`RQ: ${gap.suggested_rq ?? ''}`, 2, cardWrap);
  for (let i = 0; i < rqLines.length; i++) {
    console.log(color('│') + (i === 0 ? chalk.italic(rqLines[i]) : chalk.dim(rqLines[i])));
  }

  // └ evidence
  const evIds = (gap.evidence ?? []).slice(0, 5).map((e) => e.paperId ?? '?').join(', ');
  console.log(color('└ ') + chalk.dim(`Evidence: ${evIds || 'none'}`));
  console.log();
}

function displayGapsReport(data, allGaps) {
  console.log('\n' + divider('═'));
  console.log(chalk.bold.cyan(` Research Gaps Found: ${allGaps.length}`));
  console.log(divider('═'));

  // Group by type and render cards.
  const byType = {};
  for (const gap of allGaps) {
    const t = gap.type ?? 'unknown';
    (byType[t] = byType[t] ?? []).push(gap);
  }

  for (const [type, gaps] of Object.entries(byType)) {
    const color = TYPE_COLOR[type] ?? chalk.white;
    console.log('\n' + color.bold(` ▸ ${type.replace(/_/g, ' ').toUpperCase()}`));
    console.log(divider());
    for (const gap of gaps) renderGapCard(gap);
  }

  // Priority gap highlight.
  const priorityGap = allGaps.find((g) => g.gap_id === data.priority_gap);
  if (priorityGap) {
    drawPriorityBox(priorityGap, data.priority_reasoning ?? '');
  }
}

function displayGapDetails(gap) {
  const color = TYPE_COLOR[gap.type] ?? chalk.white;

  console.log('\n' + hr('═'));
  console.log(chalk.bold.white(` ${gap.gap_id} — ${gap.title}`));
  console.log(color(` Type: ${gap.type}`));
  console.log(hr('─'));

  console.log(chalk.bold('\nDescription'));
  console.log('  ' + gap.description);

  console.log(chalk.bold('\nEvidence'));
  for (const e of (gap.evidence ?? [])) {
    console.log(chalk.gray(`  [${e.paperId}]`) + `  ${e.quote_or_reasoning}`);
  }

  console.log(chalk.bold('\nFeasibility for you'));
  console.log(`  ${feasLabel(gap.feasibility_for_researcher)} — ${gap.feasibility_reasoning}`);

  console.log(chalk.bold('\nRequired skills'));
  console.log('  ' + (gap.required_skills ?? []).join(', '));

  console.log(chalk.bold('\nRequired compute'));
  console.log('  ' + (gap.required_compute ?? '?'));

  console.log(chalk.bold('\nEstimated scope'));
  console.log('  ' + (gap.estimated_scope ?? '?'));

  console.log(chalk.bold('\nResearch Question'));
  console.log(chalk.italic(`  "${gap.suggested_rq}"`));

  console.log('\n' + hr('═') + '\n');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runGaps() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red('\nANTHROPIC_API_KEY is not set.'));
    console.error(chalk.yellow('Export it: export ANTHROPIC_API_KEY=sk-ant-...\n'));
    process.exit(1);
  }

  let profile;
  try {
    profile = readProfile();
  } catch (err) {
    console.error(chalk.red(`\n${err.message}`));
    console.error(chalk.yellow('Run `node src/index.js onboard` first.\n'));
    process.exit(1);
  }

  // ── Step 1–3: Load all data ───────────────────────────────────────────────

  const comparison = loadComparison();
  const reviews    = loadReviews();

  console.log(chalk.bold.cyan(`\nGap Finder — analyzing ${reviews.length} papers in ${profile.domain.primary}\n`));
  console.log(chalk.gray(`Loaded comparison data + ${reviews.length} individual reviews.\n`));

  // ── Step 4: Call Claude ──────────────────────────────────────────────────

  const client       = new Anthropic();
  const systemPrompt = loadSystemPrompt();
  const userMessage  = buildUserMessage(reviews, comparison, profile);

  console.log(chalk.gray(`Sending corpus to ${GAPS_MODEL} for gap analysis...`));

  let data;
  try {
    data = await callClaude(client, systemPrompt, userMessage);
  } catch (err) {
    console.error(chalk.red(`\nGap analysis failed: ${err.message}\n`));
    process.exit(1);
  }

  const gaps = data.gaps ?? [];

  if (gaps.length === 0) {
    console.log(chalk.yellow('\nNo gaps were returned. Try adding more papers with litreview.\n'));
    return;
  }

  // ── Step 5: Save ─────────────────────────────────────────────────────────

  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(GAPS_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(chalk.gray(`Saved → data/gaps.json\n`));

  // ── Step 6: Display report ────────────────────────────────────────────────

  displayGapsReport(data, gaps);

  // ── Step 7: Interactive detail view ──────────────────────────────────────

  const { gapInput } = await inquirer.prompt([{
    type:    'input',
    name:    'gapInput',
    message: "See full details for a gap? Enter gap ID (or 'skip'):",
    default: 'skip',
  }]);

  if (gapInput.trim().toLowerCase() !== 'skip') {
    const target = gaps.find(
      (g) => g.gap_id.toLowerCase() === gapInput.trim().toLowerCase()
    );
    if (!target) {
      console.log(chalk.yellow(`\nGap "${gapInput}" not found. Available: ${gaps.map((g) => g.gap_id).join(', ')}\n`));
    } else {
      displayGapDetails(target);
    }
  }

  // ── Step 8: Update tracker ────────────────────────────────────────────────

  for (const gap of gaps) {
    appendTracker({
      mode:         'gaps',
      query:        profile.domain.primary,
      result_count: gaps.length,
      top_result:   gap.gap_id,
      score:        '',
      decision:     gap.gap_id === data.priority_gap ? 'priority' : 'identified',
      notes:        `gap_identified: ${gap.type} | ${gap.title}`,
    });
  }

  console.log(chalk.bold.green(`\n${gaps.length} gap${gaps.length === 1 ? '' : 's'} identified and saved to data/gaps.json\n`));
  console.log(chalk.gray('Run `node src/index.js ideate` to generate research ideas for a gap.\n'));
}

import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tw, divider, wrapLines } from './utils/terminal.js';
import { readProfile, appendTracker } from './utils/profile.js';

const ROOT            = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHORTLISTED_DIR = join(ROOT, 'data', 'shortlisted');
const COMPARISON_PATH = join(ROOT, 'data', 'comparison.json');
const SKILLS_PATH     = join(ROOT, 'skills', 'advisor.md');

const COMPARE_MODEL = 'claude-opus-4-8';

const FALLBACK_SYSTEM_PROMPT = `\
You are a research synthesis expert helping an engineering student understand how
a set of academic papers relate to each other.

Your task is to generate a structured comparison across all provided papers.

Rules:
- Be specific — reference actual paper content, not generic paraphrasing.
- Contradictions must be genuine disagreements on the same claim, not merely different emphases.
- open_problems_mentioned must be problems the papers themselves acknowledge as unresolved.
- underexplored_directions should be areas the papers gesture at but do not pursue.
- Return only valid JSON. No preamble, explanation, or markdown fences.`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadSystemPrompt() {
  return existsSync(SKILLS_PATH)
    ? readFileSync(SKILLS_PATH, 'utf8')
    : FALLBACK_SYSTEM_PROMPT;
}

function loadReviewsFromDisk() {
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

function extractJSON(text) {
  return JSON.parse(
    text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
  );
}

function buildUserMessage(reviews, profile) {
  return `\
You have ${reviews.length} research paper review${reviews.length === 1 ? '' : 's'}. \
Generate a structured comparison.

Reviews:
${JSON.stringify(reviews, null, 2)}

Researcher profile:
${JSON.stringify(profile, null, 2)}

Return ONLY valid JSON matching this exact schema:
{
  "methodology_comparison": [
    {
      "dimension": "string",
      "papers": {
        "<paperId>": "string"
      }
    }
  ],
  "consensus_findings": ["string"],
  "contradictions": [
    {
      "claim_a": { "paperId": "string", "statement": "string" },
      "claim_b": { "paperId": "string", "statement": "string" },
      "dimension": "string"
    }
  ],
  "sota_as_of_corpus": "string",
  "open_problems_mentioned": ["string"],
  "underexplored_directions": ["string"]
}`;
}

async function callClaude(client, systemPrompt, userMessage) {
  const systemBlock = [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
  ];

  const first = await client.messages.create({
    model:      COMPARE_MODEL,
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
      model:      COMPARE_MODEL,
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

function section(title) {
  console.log('\n' + chalk.bold.white(title));
  console.log(hr('─', title.length));
}

function displayReport(c, reviews) {
  const termWidth = tw();
  const textWrap  = Math.max(40, termWidth - 8);

  // Build a paperId → short title map for readable references.
  const titleOf = {};
  for (const r of reviews) {
    titleOf[r.paperId] = truncate(r.title ?? r.paperId ?? '?', 42);
  }

  console.log('\n' + divider('═'));
  console.log(chalk.bold.cyan(` Cross-Paper Comparison — ${reviews.length} paper${reviews.length === 1 ? '' : 's'}`));
  console.log(divider('═'));

  // ── Methodology comparison ───────────────────────────────────────────────
  section('Methodology Comparison');
  for (const dim of (c.methodology_comparison ?? [])) {
    console.log('\n' + chalk.bold(`  ${dim.dimension}`));
    for (const [paperId, desc] of Object.entries(dim.papers ?? {})) {
      const label    = chalk.gray(`  ${truncate(titleOf[paperId] ?? paperId, 42).padEnd(44)}`);
      const descLine = wrapLines(desc, 48, textWrap - 44);
      console.log(label + descLine[0]);
      for (const line of descLine.slice(1)) console.log(' '.repeat(46) + line);
    }
  }

  // ── Consensus findings ────────────────────────────────────────────────────
  section('Consensus Findings');
  if (!(c.consensus_findings ?? []).length) {
    console.log(chalk.gray('  None identified.'));
  } else {
    (c.consensus_findings).forEach((f, i) => {
      const lines = wrapLines(f, 5, textWrap);
      console.log(chalk.green(`  ${i + 1}. `) + chalk.green(lines[0].trim()));
      for (const line of lines.slice(1)) console.log(chalk.green(line));
    });
  }

  // ── Contradictions ────────────────────────────────────────────────────────
  section('Contradictions');
  if (!(c.contradictions ?? []).length) {
    console.log(chalk.gray('  None identified.'));
  } else {
    for (const con of c.contradictions) {
      const aTitle  = truncate(titleOf[con.claim_a?.paperId] ?? con.claim_a?.paperId ?? '?', 38);
      const bTitle  = truncate(titleOf[con.claim_b?.paperId] ?? con.claim_b?.paperId ?? '?', 38);
      const aYear   = reviews.find((r) => r.paperId === con.claim_a?.paperId)?.year ?? '';
      const bYear   = reviews.find((r) => r.paperId === con.claim_b?.paperId)?.year ?? '';

      console.log('\n' + chalk.red.bold(`  ⚡ CONTRADICTION · ${con.dimension}`));

      // Claim A — wrapped
      const aHeader = `    ${aTitle}${aYear ? ` (${aYear})` : ''}: `;
      for (const line of wrapLines(`${aHeader}"${con.claim_a?.statement ?? ''}"`, 4, textWrap)) {
        console.log(chalk.red(line));
      }

      // Claim B — wrapped
      const bHeader = `    ${bTitle}${bYear ? ` (${bYear})` : ''}: `;
      for (const line of wrapLines(`${bHeader}"${con.claim_b?.statement ?? ''}"`, 4, textWrap)) {
        console.log(chalk.red(line));
      }
    }
  }

  // ── State of the art ─────────────────────────────────────────────────────
  section('State of the Art (as of this corpus)');
  for (const line of wrapLines(c.sota_as_of_corpus ?? '(not determined)', 2, textWrap)) {
    console.log(line);
  }

  // ── Open problems ─────────────────────────────────────────────────────────
  section('Open Problems Mentioned by the Papers');
  if (!(c.open_problems_mentioned ?? []).length) {
    console.log(chalk.gray('  None listed.'));
  } else {
    c.open_problems_mentioned.forEach((p, i) => {
      const lines = wrapLines(p, 5, textWrap);
      console.log(chalk.cyan(`  ${i + 1}. `) + chalk.cyan(lines[0].trim()));
      for (const line of lines.slice(1)) console.log(chalk.cyan(line));
    });
  }

  // ── Underexplored directions ──────────────────────────────────────────────
  section('Underexplored Directions');
  if (!(c.underexplored_directions ?? []).length) {
    console.log(chalk.gray('  None listed.'));
  } else {
    c.underexplored_directions.forEach((d) => {
      const lines = wrapLines(d, 4, textWrap);
      console.log(chalk.cyan('  →  ') + chalk.cyan(lines[0].trim()));
      for (const line of lines.slice(1)) console.log(chalk.cyan(line));
    });
  }

  console.log('\n' + divider('═') + '\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// Called from litreview.js with data already in memory,
// or from the CLI (no args) → loads reviews from disk.
export async function runCompare(reviews = null, profile = null) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red('\nANTHROPIC_API_KEY is not set.'));
    console.error(chalk.yellow('Export it: export ANTHROPIC_API_KEY=sk-ant-...\n'));
    process.exit(1);
  }

  if (!reviews) reviews = loadReviewsFromDisk();
  if (!profile) {
    try { profile = readProfile(); }
    catch (err) {
      console.error(chalk.red(`\n${err.message}`));
      console.error(chalk.yellow('Run `node src/index.js onboard` first.\n'));
      process.exit(1);
    }
  }

  console.log(chalk.bold.cyan(`\nCompare — synthesising ${reviews.length} paper reviews\n`));

  const client       = new Anthropic();
  const systemPrompt = loadSystemPrompt();
  const userMessage  = buildUserMessage(reviews, profile);

  console.log(chalk.gray(`Sending ${reviews.length} reviews to ${COMPARE_MODEL}...`));

  let comparison;
  try {
    comparison = await callClaude(client, systemPrompt, userMessage);
  } catch (err) {
    console.error(chalk.red(`\nComparison failed: ${err.message}\n`));
    process.exit(1);
  }

  // Save to data/comparison.json
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(COMPARISON_PATH, JSON.stringify(comparison, null, 2), 'utf8');
  console.log(chalk.gray(`Saved → data/comparison.json\n`));

  displayReport(comparison, reviews);

  appendTracker({
    mode:         'compare',
    query:        `${reviews.length} reviews`,
    result_count: (comparison.methodology_comparison ?? []).length,
    top_result:   '',
    score:        '',
    decision:     'compared',
    notes:        `${(comparison.contradictions ?? []).length} contradictions, ` +
                  `${(comparison.underexplored_directions ?? []).length} underexplored directions`,
  });

  console.log(chalk.gray('Run `node src/index.js gaps` to identify research gaps.\n'));
}

import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readProfile, appendTracker } from './utils/profile.js';
import { loadShortlisted, buildCorpusContext } from './utils/paperContext.js';

const ROOT            = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHORTLISTED_DIR = join(ROOT, 'data', 'shortlisted');
const SKILLS_PATH     = join(ROOT, 'skills', 'litreview.md');

// Use Opus for deep paper analysis — this is where quality pays off.
const ANALYSIS_MODEL = 'claude-opus-4-7';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

// Placeholder active until skills/litreview.md is written.
const PLACEHOLDER_SYSTEM_PROMPT = `\
You are a research analysis assistant helping an engineering student evaluate academic papers.

Analyze each paper rigorously and extract structured, actionable information. Your job is to help
the student understand what the paper does, whether they can reproduce it, and where it leaves gaps.

Rules:
- Be specific and direct. Avoid generic academic phrases like "promising direction" or "future work."
- Limitations must be real limitations — not polite future-work suggestions.
- drawbacks_for_this_researcher must reference the student's actual tools and constraints.
- reproducibility_assessment must state clearly whether code is available and on what hardware.
- Return only valid JSON with no preamble, explanation, or markdown fencing.`;

function loadSystemPrompt() {
  if (existsSync(SKILLS_PATH)) {
    return readFileSync(SKILLS_PATH, 'utf8');
  }
  return PLACEHOLDER_SYSTEM_PROMPT;
}

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

function fmt(text) {
  return text?.trim() || '(not available)';
}

function buildUserMessage(ctx, profile) {
  const tools = [
    ...profile.skills.programming,
    ...profile.skills.tools,
  ].join(', ') || '(none listed)';

  return `\
Analyze this research paper and return a structured JSON review.

Paper: ${ctx.title} (${ctx.year ?? 'year unknown'})
Authors: ${ctx.authors.join(', ') || 'unknown'}
Citations: ${ctx.citationCount ?? 0}
Source: ${ctx.source}

Content:
Abstract: ${fmt(ctx.sections.abstract)}
Introduction: ${fmt(ctx.sections.introduction)}
Methodology: ${fmt(ctx.sections.methodology)}
Conclusion: ${fmt(ctx.sections.conclusion)}

Researcher profile:
Domain: ${profile.domain.primary}${profile.domain.sub_areas.length ? ' / ' + profile.domain.sub_areas.join(', ') : ''}
Skill level: ${profile.skills.level}
Tools known: ${tools}
Compute: ${profile.constraints.compute}
Dataset access: ${profile.constraints.dataset_access}
North star: ${profile.goals.north_star}
Hours per week: ${profile.constraints.hours_per_week}

Return ONLY valid JSON matching this exact schema:
{
  "paperId": "string",
  "title": "string",
  "year": 0,
  "one_line_summary": "string",
  "problem_statement": "string",
  "methodology": {
    "approach": "string",
    "datasets_used": ["string"],
    "evaluation_metrics": ["string"],
    "baseline_comparisons": ["string"]
  },
  "key_contributions": ["string"],
  "limitations": ["string"],
  "drawbacks_for_this_researcher": ["string"],
  "reproducibility_assessment": "string",
  "relevance_to_profile": "string",
  "tags": ["string"]
}`;
}

// ---------------------------------------------------------------------------
// Claude API call with prompt caching + JSON retry
// ---------------------------------------------------------------------------

// Strip optional markdown code fences Claude sometimes wraps around JSON.
function extractJSON(text) {
  const stripped = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
  return JSON.parse(stripped);
}

async function analyzeWithClaude(client, systemPrompt, userMessage) {
  // Cache the system prompt — it's identical across every paper in this run,
  // so caching it saves tokens on calls 2..N.
  const systemBlock = [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
  ];

  const firstResponse = await client.messages.create({
    model:      ANALYSIS_MODEL,
    max_tokens: 4_096,
    system:     systemBlock,
    messages:   [{ role: 'user', content: userMessage }],
  });

  const firstText = firstResponse.content[0].text;

  try {
    return extractJSON(firstText);
  } catch {
    // Retry: give Claude the bad response and ask for a fix.
    console.log(chalk.yellow('  [!] Response was not valid JSON — retrying...'));
    const retryResponse = await client.messages.create({
      model:      ANALYSIS_MODEL,
      max_tokens: 4_096,
      system:     systemBlock,
      messages: [
        { role: 'user',      content: userMessage },
        { role: 'assistant', content: firstText },
        { role: 'user',      content: 'Your previous response was not valid JSON. Return only the JSON object, no other text.' },
      ],
    });
    return extractJSON(retryResponse.content[0].text);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(str, n) {
  const s = str ?? '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function sanitizeId(paperId) {
  return (paperId ?? 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function reproLabel(assessment) {
  const t = (assessment ?? '').toLowerCase();
  if (/\b(github\.com|code\s+(?:is\s+)?available|open.source|publicly\s+(?:available|released))\b/.test(t)) {
    return chalk.green('yes');
  }
  if (/\b(not\s+(?:available|released)|no\s+code|proprietary|closed\s+source)\b/.test(t)) {
    return chalk.red('no');
  }
  return chalk.yellow('?');
}

// ---------------------------------------------------------------------------
// Compare mode — stub until compare.js is built
// ---------------------------------------------------------------------------

async function compareMode(reviews, profile) {
  try {
    const { runCompare } = await import('./compare.js');
    await runCompare(reviews, profile);
  } catch {
    console.log(chalk.yellow('\nCompare mode not yet implemented. Build src/compare.js next.\n'));
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runLitreview() {

  // ── Step 1: Load profile ─────────────────────────────────────────────────

  let profile;
  try {
    profile = readProfile();
  } catch (err) {
    console.error(chalk.red(`\n${err.message}`));
    console.error(chalk.yellow('Run `node src/index.js onboard` first.\n'));
    process.exit(1);
  }

  // ── Check API key early ──────────────────────────────────────────────────

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red('\nANTHROPIC_API_KEY is not set.'));
    console.error(chalk.yellow('Export it in your shell: export ANTHROPIC_API_KEY=sk-ant-...\n'));
    process.exit(1);
  }

  const client = new Anthropic();

  console.log(
    chalk.bold.cyan(`\nLiterature Review — analyzing shortlisted papers for ${profile.profile.name}\n`)
  );

  // ── Step 1: Load shortlisted papers ─────────────────────────────────────

  const papers = loadShortlisted();
  console.log(chalk.gray(`Found ${papers.length} shortlisted paper${papers.length === 1 ? '' : 's'}.\n`));

  // ── Step 2: Build corpus context ────────────────────────────────────────

  console.log(chalk.bold('Building paper context...\n'));
  const corpus = await buildCorpusContext(papers);

  const rawCount = corpus.filter((c) => c.rawAvailable).length;
  console.log(
    chalk.gray(
      `Context ready. ${rawCount}/${corpus.length} papers had accessible PDFs; ` +
      `${corpus.length - rawCount} fell back to abstract only.\n`
    )
  );

  // ── Step 3–5: Analyze each paper with Claude ─────────────────────────────

  const systemPrompt = loadSystemPrompt();
  const reviews      = [];

  console.log(chalk.bold(`Analyzing papers with ${ANALYSIS_MODEL}...\n`));

  mkdirSync(SHORTLISTED_DIR, { recursive: true });

  for (let i = 0; i < corpus.length; i++) {
    const ctx = corpus[i];
    console.log(
      chalk.cyan(`[${i + 1}/${corpus.length}] Analyzing "${truncate(ctx.title, 55)}"...`)
    );

    let review;
    try {
      const userMessage = buildUserMessage(ctx, profile);
      review = await analyzeWithClaude(client, systemPrompt, userMessage);

      // Ensure paperId is always set — Claude might omit it.
      review.paperId = review.paperId || ctx.paperId;
      review.title   = review.title   || ctx.title;
      review.year    = review.year    || ctx.year;
    } catch (err) {
      console.error(chalk.red(`  [!] Analysis failed for "${truncate(ctx.title, 40)}": ${err.message}`));
      continue;
    }

    // ── Step 5: Save review ───────────────────────────────────────────────

    const reviewFile = join(SHORTLISTED_DIR, sanitizeId(ctx.paperId) + '_review.json');
    writeFileSync(reviewFile, JSON.stringify(review, null, 2), 'utf8');
    console.log(chalk.gray(`  Saved → ${reviewFile.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`));

    reviews.push(review);
  }

  if (reviews.length === 0) {
    console.error(chalk.red('\nNo reviews were generated. Check your API key and network connection.\n'));
    process.exit(1);
  }

  // ── Step 6: Summary table ────────────────────────────────────────────────

  console.log(chalk.bold(`\nReview Summary — ${reviews.length} paper${reviews.length === 1 ? '' : 's'}\n`));

  // Max 5 columns; title width fills remaining terminal space.
  const termWidth = process.stdout.columns || 140;
  const titleW    = Math.max(15, termWidth - 80);  // Year6 + Problem30 + Lims6 + Repro9 + borders~29

  const table = new Table({
    head:      ['Title', 'Year', 'Problem', 'Lims', 'Repro?'],
    colWidths: [titleW, 6, 32, 6, 9],
    wordWrap:  true,
    style:     { head: ['bold', 'cyan'] },
  });

  for (const r of reviews) {
    table.push([
      truncate(r.title, titleW - 2),
      String(r.year ?? '—'),
      truncate(r.problem_statement, 30),
      String(r.limitations?.length ?? '—'),
      reproLabel(r.reproducibility_assessment),
    ]);
  }

  console.log(table.toString());

  // Print one-line summaries below the table as a quick digest.
  console.log(chalk.bold('\nOne-line summaries:\n'));
  reviews.forEach((r, i) => {
    console.log(`  ${chalk.bold(`${i + 1}.`)} ${r.one_line_summary ?? '(no summary)'}`);
  });
  console.log();

  // ── Step 7: Comparison offer ─────────────────────────────────────────────

  if (reviews.length > 1) {
    const { doCompare } = await inquirer.prompt([{
      type:    'confirm',
      name:    'doCompare',
      message: 'Generate a comparison table across all papers?',
      default: false,
    }]);

    if (doCompare) {
      await compareMode(reviews, profile);
    }
  }

  // ── Step 8: Update tracker ────────────────────────────────────────────────

  appendTracker({
    mode:         'litreview',
    query:        `${reviews.length} papers analyzed`,
    result_count: reviews.length,
    top_result:   truncate(reviews[0]?.title ?? '', 60),
    score:        '',
    decision:     'reviewed',
    notes:        `${corpus.length} contexts built, ${rawCount} with PDF, ${reviews.length} reviews saved`,
  });

  console.log(chalk.bold.green(`\nLiterature review complete. ${reviews.length} review${reviews.length === 1 ? '' : 's'} saved to data/shortlisted/.\n`));
  console.log(chalk.gray('Run `node src/index.js gaps` to identify research gaps across these papers.\n'));
}

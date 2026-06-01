import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tw, divider, header, wrapLines } from './utils/terminal.js';
import { readProfile, appendTracker } from './utils/profile.js';
import { checkFeasibility } from './feasibility.js';

const ROOT        = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAPS_PATH   = join(ROOT, 'data', 'gaps.json');
const IDEAS_DIR   = join(ROOT, 'data', 'ideas');
const SKILLS_PATH = join(ROOT, 'skills', 'ideate.md');

const IDEATE_MODEL = 'claude-opus-4-8';

const FALLBACK_SYSTEM_PROMPT = `\
You are a research idea generator helping an engineering student develop concrete,
actionable research proposals from identified gaps in the literature.

Generate 3 distinct research ideas for the given gap. Each idea must:
- Be a different methodological approach to the same gap
- Include a specific, testable research question with a measurable hypothesis
- Include a realistic timeline and publication target for the student's level
- Identify the biggest risks and concrete mitigations

Return only valid JSON. No preamble, no markdown fences.`;

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadGaps() {
  if (!existsSync(GAPS_PATH)) {
    console.error(chalk.red('\nNo gaps found. Run node src/index.js gaps first.'));
    process.exit(1);
  }
  return JSON.parse(readFileSync(GAPS_PATH, 'utf8'));
}

function loadSystemPrompt() {
  return existsSync(SKILLS_PATH)
    ? readFileSync(SKILLS_PATH, 'utf8')
    : FALLBACK_SYSTEM_PROMPT;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const TYPE_ABBR = {
  methodology_gap:          'methodology   ',
  contradiction_gap:        'contradiction ',
  population_gap:           'population    ',
  technology_gap:           'technology    ',
  evaluation_gap:           'evaluation    ',
  coverage_gap:             'coverage      ',
  performance_tradeoff_gap: 'perf-tradeoff ',
};

const SEVERITY_COLOR = {
  high:   chalk.red,
  medium: chalk.yellow,
  low:    chalk.gray,
};

const FEAS_COLOR = {
  high:   chalk.green,
  medium: chalk.yellow,
  low:    chalk.red,
};

const DIFF_COLOR = {
  'beginner-friendly': chalk.green,
  'intermediate':      chalk.yellow,
  'advanced':          chalk.red,
};

function truncate(str, n) {
  const s = str ?? '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function displayGapTable(gaps) {
  const W      = Math.min(tw() - 4, 120);
  const titleW = Math.max(20, W - 54);

  console.log('\n' + divider('═'));
  console.log(
    chalk.bold.cyan('ID      ') +
    chalk.bold.cyan('Type            ') +
    chalk.bold.cyan('Title'.padEnd(titleW + 2)) +
    chalk.bold.cyan('Sev     ') +
    chalk.bold.cyan('Feasibility')
  );
  console.log(divider('─'));

  for (const gap of gaps) {
    const typeStr  = (TYPE_ABBR[gap.type] ?? (gap.type ?? '').padEnd(14)).slice(0, 14);
    const title    = truncate(gap.title ?? '', titleW).padEnd(titleW + 2);
    const sevColor = SEVERITY_COLOR[gap.severity]              ?? chalk.white;
    const feaColor = FEAS_COLOR[gap.feasibility_for_researcher] ?? chalk.white;

    console.log(
      chalk.bold((gap.gap_id ?? '?').padEnd(8)) +
      chalk.cyan(typeStr) + '  ' +
      title +
      sevColor((gap.severity ?? '?').padEnd(8)) +
      feaColor(gap.feasibility_for_researcher ?? '?')
    );
  }

  console.log(divider('═') + '\n');
}

// ---------------------------------------------------------------------------
// Feasibility card
// ---------------------------------------------------------------------------

function overallBadge(overall) {
  if (overall === 'GO')   return chalk.bgGreen.black(' ✓ GO ');
  if (overall === 'WARN') return chalk.bgYellow.black(' ⚠ WARN ');
  return chalk.bgRed.white(' ✗ NO-GO ');
}

function statusLabel(status) {
  if (status === 'PASS') return chalk.green('PASS');
  if (status === 'WARN') return chalk.yellow('WARN');
  return chalk.red('FAIL');
}

function displayFeasibilityCard(feasibility) {
  const W = Math.min(tw() - 4, 100);

  console.log('\n' + divider('═'));
  console.log(' Feasibility Check  ' + overallBadge(feasibility.overall));
  console.log(divider('─'));

  const CHECK_LABELS = {
    compute_check: 'Compute  ',
    skill_check:   'Skills   ',
    time_check:    'Time     ',
    dataset_check: 'Dataset  ',
    scope_check:   'Scope/RQ ',
  };

  for (const [key, check] of Object.entries(feasibility.checks)) {
    const label      = CHECK_LABELS[key] ?? key.padEnd(9);
    const reasonClr  = check.status === 'FAIL' ? chalk.red
                     : check.status === 'WARN' ? chalk.yellow
                     : chalk.gray;
    console.log(
      ` ${chalk.bold(label)}  ${statusLabel(check.status)}  ` +
      reasonClr(truncate(check.reason ?? '', W - 28))
    );
  }

  if (feasibility.blockers.length > 0) {
    console.log('\n' + chalk.red.bold(' Blockers:'));
    for (const b of feasibility.blockers) {
      for (const line of wrapLines(b, 4, W - 4)) console.log(chalk.red(line));
    }
  }

  if (feasibility.warnings.length > 0) {
    console.log('\n' + chalk.yellow.bold(' Warnings:'));
    for (const w of feasibility.warnings) {
      for (const line of wrapLines(w, 4, W - 4)) console.log(chalk.yellow(line));
    }
  }

  console.log('\n' + chalk.dim(' Recommendation: ') + feasibility.recommendation);
  console.log(divider('═') + '\n');
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

function extractJSON(text) {
  return JSON.parse(
    text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
  );
}

function buildUserMessage(gap, profile, feasibility) {
  return `Generate 3 distinct research ideas for this gap.

Gap:
${JSON.stringify(gap, null, 2)}

Researcher profile:
${JSON.stringify(profile, null, 2)}

Feasibility verdict:
${JSON.stringify(feasibility, null, 2)}

Each idea must be a different approach to addressing the same gap.
Vary them across: methodology choice, scope size, dataset, novelty level.

Return ONLY valid JSON:
{
  "ideas": [
    {
      "idea_id": "IDEA-001",
      "title": "string",
      "approach": "string",
      "research_question": "string",
      "hypothesis": "string",
      "methodology": {
        "steps": ["string"],
        "datasets": ["string"],
        "tools_and_frameworks": ["string"],
        "evaluation_plan": "string"
      },
      "novelty_claim": "string",
      "expected_contribution": "string",
      "risks": ["string"],
      "mitigation": ["string"],
      "estimated_timeline": {
        "total": "string",
        "breakdown": [{ "phase": "string", "duration": "string", "deliverable": "string" }]
      },
      "publication_target": "string",
      "difficulty": "beginner-friendly" | "intermediate" | "advanced"
    }
  ],
  "recommendation": "string"
}`;
}

async function callClaude(client, systemPrompt, userMessage) {
  const systemBlock = [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
  ];

  const first = await client.messages.create({
    model:      IDEATE_MODEL,
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
      model:      IDEATE_MODEL,
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
// Idea card renderer
// ---------------------------------------------------------------------------

function displayIdeaCard(idea, index) {
  const W       = Math.min(tw() - 4, 100);
  const border  = chalk.bold('═'.repeat(Math.max(40, W)));
  const divLine = chalk.dim('─'.repeat(Math.max(40, W)));
  const diffClr = DIFF_COLOR[idea.difficulty] ?? chalk.white;

  console.log('\n' + border);
  console.log(
    chalk.bold(` ${index}. ${idea.idea_id ?? `IDEA-00${index}`}  ·  `) +
    diffClr(idea.difficulty ?? '')
  );
  console.log(chalk.bold.cyan(` "${idea.title ?? ''}"`));
  console.log(border);

  const field = (label, value) => {
    if (!value) return;
    console.log(chalk.bold(`\n${label}`));
    for (const line of wrapLines(String(value), 2, W - 2)) console.log(line);
  };

  field('Approach:', idea.approach);
  field('RQ:', idea.research_question);
  field('Hypothesis:', idea.hypothesis);

  const meth = idea.methodology ?? {};

  if ((meth.tools_and_frameworks ?? []).length > 0) {
    console.log(chalk.bold('\nTools:'));
    console.log('  ' + meth.tools_and_frameworks.join(', '));
  }

  if ((meth.datasets ?? []).length > 0) {
    console.log(chalk.bold('\nDatasets:'));
    console.log('  ' + meth.datasets.join(', '));
  }

  if (idea.estimated_timeline?.total) {
    console.log(chalk.bold('\nTimeline:') + '  ' + idea.estimated_timeline.total);
  }

  if (idea.publication_target) {
    console.log(chalk.bold('\nPublish at:') + '  ' + idea.publication_target);
  }

  if ((idea.risks ?? []).length > 0) {
    console.log(chalk.bold('\nRisks:') + `  ${idea.risks.length} identified`);
  }

  console.log('\n' + divLine);
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

function saveIdeas(ideas, gapId) {
  mkdirSync(IDEAS_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);

  for (const idea of ideas) {
    const filename = `${gapId}_${idea.idea_id ?? 'IDEA'}.json`;
    writeFileSync(
      join(IDEAS_DIR, filename),
      JSON.stringify({ ...idea, gap_id: gapId, saved_at: today }, null, 2),
      'utf8'
    );
    console.log(chalk.green(`  ✓  Saved → data/ideas/${filename}`));
  }
}

// ---------------------------------------------------------------------------
// Gap selection
// ---------------------------------------------------------------------------

async function selectGap(gaps, gapArg) {
  if (gapArg) {
    const found = gaps.find((g) => g.gap_id?.toLowerCase() === gapArg.toLowerCase());
    if (!found) {
      console.error(chalk.red(`\nGap "${gapArg}" not found.`));
      console.error(chalk.yellow(`Available: ${gaps.map((g) => g.gap_id).join(', ')}\n`));
      process.exit(1);
    }
    return found;
  }

  displayGapTable(gaps);

  const { gapId } = await inquirer.prompt([{
    type:    'input',
    name:    'gapId',
    message: 'Which gap do you want to develop into a research idea? Enter gap ID:',
    validate: (v) => {
      const t = v.trim().toUpperCase();
      if (gaps.some((g) => (g.gap_id ?? '').toUpperCase() === t)) return true;
      return `Gap "${v}" not found. Available: ${gaps.map((g) => g.gap_id).join(', ')}`;
    },
  }]);

  return gaps.find((g) => (g.gap_id ?? '').toUpperCase() === gapId.trim().toUpperCase());
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runIdeate(gapArg) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red('\nANTHROPIC_API_KEY is not set.'));
    console.error(chalk.yellow('Export it: export ANTHROPIC_API_KEY=sk-ant-...\n'));
    process.exit(1);
  }

  // ── Step 1: Load gaps ─────────────────────────────────────────────────────

  const gapsData = loadGaps();
  const gaps     = gapsData.gaps ?? [];

  if (gaps.length === 0) {
    console.error(chalk.red('\nNo gaps found in data/gaps.json. Run node src/index.js gaps first.\n'));
    process.exit(1);
  }

  // ── Step 2: Load profile ──────────────────────────────────────────────────

  let profile;
  try {
    profile = readProfile();
  } catch (err) {
    console.error(chalk.red(`\n${err.message}`));
    console.error(chalk.yellow('Run `node src/index.js onboard` first.\n'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan(`\nIdeate — generate research ideas from gaps\n`));

  // ── Step 3: Select gap ────────────────────────────────────────────────────

  const gap = await selectGap(gaps, gapArg);

  console.log(chalk.bold(`\nSelected: ${gap.gap_id} — ${gap.title}`));
  console.log(chalk.gray(`Type: ${gap.type}  ·  Severity: ${gap.severity}  ·  Scope: ${gap.estimated_scope ?? '?'}\n`));

  // ── Step 4: Feasibility check ─────────────────────────────────────────────

  const feasibility = checkFeasibility(gap, profile);
  displayFeasibilityCard(feasibility);

  if (feasibility.overall === 'NO-GO') {
    const { proceed } = await inquirer.prompt([{
      type:    'input',
      name:    'proceed',
      message: 'This gap has blockers. Continue anyway? (yes/no):',
      validate: (v) => ['yes', 'no'].includes(v.trim().toLowerCase()) || 'Enter yes or no',
    }]);

    if (proceed.trim().toLowerCase() !== 'yes') {
      console.log(chalk.yellow('\nReturning to gap list...\n'));
      return runIdeate(undefined);
    }
    console.log(chalk.yellow('\nContinuing with blockers visible — proceed with caution.\n'));
  }

  // ── Step 5: Generate ideas ────────────────────────────────────────────────

  const client       = new Anthropic();
  const systemPrompt = loadSystemPrompt();
  const userMessage  = buildUserMessage(gap, profile, feasibility);

  console.log(chalk.gray(`Sending gap to ${IDEATE_MODEL} for idea generation...\n`));

  let data;
  try {
    data = await callClaude(client, systemPrompt, userMessage);
  } catch (err) {
    console.error(chalk.red(`\nIdea generation failed: ${err.message}\n`));
    process.exit(1);
  }

  // ── Step 6: Validate ──────────────────────────────────────────────────────

  const ideas = data.ideas ?? [];

  if (ideas.length === 0) {
    console.error(chalk.red('\nNo ideas returned. Try a different gap or re-run.\n'));
    process.exit(1);
  }

  // ── Step 7: Display ───────────────────────────────────────────────────────

  console.log(chalk.bold.cyan(`\n${ideas.length} Research Ideas for ${gap.gap_id}\n`));

  for (let i = 0; i < ideas.length; i++) {
    displayIdeaCard(ideas[i], i + 1);
  }

  if (data.recommendation) {
    console.log('\n' + chalk.bgCyan.black.bold(' ★ RECOMMENDED ') + '\n');
    for (const line of wrapLines(data.recommendation, 2, Math.min(tw() - 4, 100))) {
      console.log(line);
    }
    console.log();
  }

  // ── Step 8: Select and save ───────────────────────────────────────────────

  const ideaIds = ideas.map((idea, i) => idea.idea_id ?? `IDEA-00${i + 1}`);

  const { selection } = await inquirer.prompt([{
    type:    'input',
    name:    'selection',
    message: `Select an idea to develop (${ideaIds.join('/')}) or 'all' to save all:`,
    validate: (v) => {
      const t = v.trim().toLowerCase();
      if (t === 'all') return true;
      if (ideaIds.some((id) => id.toLowerCase() === t)) return true;
      return `Enter one of ${ideaIds.join(', ')} or 'all'`;
    },
  }]);

  const selectionNorm = selection.trim().toLowerCase();
  const selectedIdeas = selectionNorm === 'all'
    ? ideas
    : ideas.filter((idea, i) => (idea.idea_id ?? `IDEA-00${i + 1}`).toLowerCase() === selectionNorm);

  if (selectedIdeas.length === 0) {
    console.error(chalk.red('\nNo matching idea found.\n'));
    process.exit(1);
  }

  console.log();
  saveIdeas(selectedIdeas, gap.gap_id);

  // ── Step 9: Reading pause ─────────────────────────────────────────────────

  const selectedIdeaId = selectedIdeas[0]?.idea_id ?? 'IDEA-001';

  console.log(divider());
  console.log(header('BEFORE YOU CONTINUE'));
  console.log(divider());
  console.log();
  console.log(chalk.white(
`Research-Ops has done its part. Now yours begins.

Before running the advisor simulation, do this:

  1. Open the actual papers that surfaced ${gap.gap_id}
     Location: data/shortlisted/
     Read the full methodology and results sections — not just abstracts.

  2. Note what the papers do that the abstracts didn't mention.
     Write it down somewhere. This is your raw material.

  3. Look at the suggested research question from the idea you selected.
     Ask yourself: do you agree? what would you change? what did the
     papers reveal that changes the framing?

  4. Form your own version of the research question.
     It should be a combination of what Research-Ops suggested
     and what you personally understood from reading.

  5. When you have your own RQ — come back and run:
     node src/index.js advisor ${gap.gap_id}

The advisor simulation works best when you bring your own
synthesis. Not the suggested idea copied verbatim — your version
of it, after actually reading the papers.`
  ));
  console.log();
  console.log(divider());
  console.log();
  console.log(chalk.dim(
`Tip: Most students need 1-2 days between ideate and advisor.
That reading period is part of the pipeline even though
Research-Ops cannot do it for you.`
  ));
  console.log();
  console.log(divider());
  console.log();

  const { advisorChoice } = await inquirer.prompt([{
    type:    'list',
    name:    'advisorChoice',
    message: 'Are you ready to run the advisor now, or do you want to read first?',
    choices: [
      { name: '1. Run advisor now',                                     value: 'now' },
      { name: '2. Exit and come back later  (your idea is saved)',      value: 'later' },
    ],
  }]);

  // ── Step 10: Update tracker ───────────────────────────────────────────────

  for (const idea of selectedIdeas) {
    appendTracker({
      mode:         'ideate',
      query:        gap.gap_id,
      result_count: ideas.length,
      top_result:   truncate(idea.title ?? idea.idea_id ?? '', 60),
      score:        '',
      decision:     `selected: ${idea.idea_id ?? 'IDEA'}`,
      notes:        `stage: ideating | gap: ${gap.gap_id} | difficulty: ${idea.difficulty ?? '?'}`,
    });
  }

  if (advisorChoice === 'later') {
    console.log();
    console.log(chalk.green(`Your idea is saved at data/ideas/${gap.gap_id}_${selectedIdeaId}.json`));
    console.log(chalk.dim(`Run 'node src/index.js advisor ${gap.gap_id}' when you're ready.`));
    console.log();
    return;
  }

  // ── Step 11: Advisor simulation ───────────────────────────────────────────

  try {
    const { advisorMode } = await import('./advisor.js');
    await advisorMode(selectedIdeas[0], gap, profile);
  } catch {
    console.log(chalk.yellow('\nAdvisor mode not yet available. Build advisor.js to enable it.\n'));
  }
}

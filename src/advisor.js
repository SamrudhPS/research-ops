import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { createInterface } from 'readline';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tw, divider, header, wrapLines } from './utils/terminal.js';
import { appendTracker } from './utils/profile.js';

const ROOT        = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDEAS_DIR   = join(ROOT, 'data', 'ideas');
const SKILLS_PATH = join(ROOT, 'skills', 'advisor.md');

const ADVISOR_MODEL = 'claude-opus-4-8';

const FALLBACK_SYSTEM_PROMPT = `\
You are a senior research advisor with 20 years of experience supervising graduate students
in engineering and computer science. You have served on dozens of thesis committees and
reviewed thousands of research proposals.

Your role: give honest, direct, expert feedback that makes proposals stronger.
You are not here to be kind — you are here to be useful. A student who leaves your
office with false confidence does worse than one who leaves with hard questions to answer.

Calibrate your feedback to the student's stated level and north star. A first-paper goal
gets different advice than a thesis chapter. But always be direct about real weaknesses.

Return only valid JSON. No preamble, no markdown fences.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(str, n) {
  const s = str ?? '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function extractJSON(text) {
  return JSON.parse(
    text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
  );
}

function loadSystemPrompt() {
  return existsSync(SKILLS_PATH)
    ? readFileSync(SKILLS_PATH, 'utf8')
    : FALLBACK_SYSTEM_PROMPT;
}

// ---------------------------------------------------------------------------
// Multi-line input — collects lines until two consecutive blank Enters
// ---------------------------------------------------------------------------

async function collectMultilineInput(message) {
  console.log(chalk.bold(`\n${message}`));
  console.log(chalk.dim('(Press Enter twice when done)\n'));

  return new Promise((resolve) => {
    const rl    = createInterface({ input: process.stdin, output: process.stdout });
    const lines = [];
    let blanks  = 0;

    rl.on('line', (line) => {
      if (line === '') {
        blanks++;
        if (blanks >= 2) {
          rl.close();
          return;
        }
        lines.push('');
      } else {
        blanks = 0;
        lines.push(line);
      }
    });

    rl.on('close', () => {
      while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      resolve(lines.join('\n'));
    });
  });
}

// ---------------------------------------------------------------------------
// Claude multi-turn call — same system block, growing messages array
// ---------------------------------------------------------------------------

async function callClaude(client, systemBlock, messages) {
  const response = await client.messages.create({
    model:      ADVISOR_MODEL,
    max_tokens: 4_096,
    system:     systemBlock,
    messages,
  });

  const text = response.content[0].text;

  try {
    return { parsed: extractJSON(text), raw: text };
  } catch {
    console.log(chalk.yellow('  [!] Response was not valid JSON — retrying...'));

    const retry = await client.messages.create({
      model:      ADVISOR_MODEL,
      max_tokens: 4_096,
      system:     systemBlock,
      messages: [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'user',      content: 'Your previous response was not valid JSON. Return only the JSON object, no other text.' },
      ],
    });

    const retryText = retry.content[0].text;
    return { parsed: extractJSON(retryText), raw: retryText };
  }
}

// ---------------------------------------------------------------------------
// Round 1 — First impression
// ---------------------------------------------------------------------------

function round1UserMessage(idea, gap, profile, student_rq, student_context, student_approach) {
  return `You are reviewing a research proposal from a ${profile.skills.level} student \
whose north star is ${profile.goals.north_star}.

The system suggested this research question:
${idea.research_question ?? '(none)'}

But after reading the papers themselves, the student formed their own version:
STUDENT'S RQ: ${student_rq}

What the student learned from reading the papers:
${student_context || 'Not provided'}

Student's proposed approach:
${student_approach || 'Not decided yet'}

Original gap this addresses:
${JSON.stringify(gap, null, 2)}

Full idea context:
${JSON.stringify(idea, null, 2)}

Give your first impression of the STUDENT'S research question — not the system-suggested one. \
If the student's version is stronger, say so. If it's weaker or less specific, say that directly.

Return ONLY valid JSON:
{
  "first_impression": "string",
  "biggest_weakness": "string",
  "initial_verdict": "promising" | "needs_work" | "rethink",
  "vs_suggested_rq": "string"
}`;
}

function displayRound1(r1) {
  const W = Math.min(tw() - 4, 100);

  console.log('\n' + divider('═'));
  console.log(chalk.bold.white(' ROUND 1 — First Impression'));
  console.log(divider('─'));

  console.log(chalk.bold('\nAdvisor says:\n'));
  for (const line of wrapLines(r1.first_impression ?? '', 2, W - 2)) {
    console.log(chalk.white(line));
  }

  console.log(chalk.bold.red('\nBiggest weakness:\n'));
  for (const line of wrapLines(r1.biggest_weakness ?? '', 2, W - 2)) {
    console.log(chalk.red.bold(line));
  }

  const verdictColor =
    r1.initial_verdict === 'promising'  ? chalk.green :
    r1.initial_verdict === 'needs_work' ? chalk.yellow :
    chalk.red;

  const verdictLabel = (r1.initial_verdict ?? '').replace(/_/g, ' ').toUpperCase();
  console.log('\n' + verdictColor.bold(`Initial verdict: ${verdictLabel}`));

  if (r1.vs_suggested_rq) {
    console.log(chalk.bold('\nVs. suggested RQ:\n'));
    for (const line of wrapLines(r1.vs_suggested_rq, 2, W - 2)) {
      console.log(chalk.cyan(line));
    }
  }

  console.log(divider('═') + '\n');
}

// ---------------------------------------------------------------------------
// Round 2 — Deep interrogation
// ---------------------------------------------------------------------------

function round2UserMessage(student_rq) {
  return `Now ask 5 hard questions a thesis committee would ask about this proposal.
Focus specifically on the student's research question: "${student_rq}"
These should expose gaps in methodology, novelty claims, evaluation plan, and feasibility.

Return ONLY valid JSON:
{
  "questions": [
    {
      "question": "string",
      "why_it_matters": "string",
      "what_a_good_answer_looks_like": "string"
    }
  ]
}`;
}

function displayQuestions(questions) {
  const W = Math.min(tw() - 4, 100);

  console.log('\n' + divider('═'));
  console.log(chalk.bold.white(' ROUND 2 — Committee Interrogation'));
  console.log(divider('─'));

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log();
    console.log(chalk.yellow.bold(`Q${i + 1}: `) + chalk.white.bold(q.question ?? ''));

    if (q.why_it_matters) {
      console.log(chalk.dim('  Why this matters: ') + chalk.dim(q.why_it_matters));
    }
    if (q.what_a_good_answer_looks_like) {
      console.log(chalk.dim('  Good answer: ') + chalk.dim(q.what_a_good_answer_looks_like));
    }
  }

  console.log('\n' + divider('═'));
}

// ---------------------------------------------------------------------------
// Round 3 — Final verdict
// ---------------------------------------------------------------------------

function round3UserMessage(studentAnswers) {
  return `The student answered your questions:
${studentAnswers}

Based on their answers and the original proposal, provide:
1. Assessment of their answers — did they address the weaknesses?
2. A revised, stronger version of the research question
3. Specific changes to make the methodology more rigorous
4. Final verdict and next steps

Return ONLY valid JSON:
{
  "answer_assessment": "string",
  "revised_rq": "string",
  "methodology_improvements": ["string"],
  "final_verdict": "ready_to_proceed" | "revise_and_resubmit" | "pivot_needed",
  "next_steps": ["string"],
  "encouragement": "string"
}`;
}

function finalVerdictBadge(verdict) {
  if (verdict === 'ready_to_proceed')    return chalk.bgGreen.black(' ✓ READY TO PROCEED ');
  if (verdict === 'revise_and_resubmit') return chalk.bgYellow.black(' ↻ REVISE AND RESUBMIT ');
  return chalk.bgRed.white(' ↺ PIVOT NEEDED ');
}

function displayFinalVerdict(r3) {
  const W = Math.min(tw() - 4, 100);

  console.log('\n' + divider('═'));
  console.log(chalk.bold.white(' ROUND 3 — Final Verdict'));
  console.log(divider('─'));

  console.log(chalk.bold('\nAssessment of your answers:\n'));
  for (const line of wrapLines(r3.answer_assessment ?? '', 2, W - 2)) {
    console.log(line);
  }

  if (r3.revised_rq) {
    console.log(chalk.bold('\nRevised research question:\n'));
    for (const line of wrapLines(`"${r3.revised_rq}"`, 2, W - 2)) {
      console.log(chalk.cyan.italic(line));
    }
  }

  if ((r3.methodology_improvements ?? []).length > 0) {
    console.log(chalk.bold('\nMethodology improvements:'));
    for (const improvement of r3.methodology_improvements) {
      for (const line of wrapLines(`• ${improvement}`, 2, W - 2)) {
        console.log(line);
      }
    }
  }

  console.log('\n' + finalVerdictBadge(r3.final_verdict));

  if ((r3.next_steps ?? []).length > 0) {
    console.log(chalk.bold('\nNext steps:'));
    r3.next_steps.forEach((step, i) => {
      console.log(chalk.cyan(`  ${i + 1}. `) + step);
    });
  }

  if (r3.encouragement) {
    console.log('\n' + chalk.italic(r3.encouragement));
  }

  console.log('\n' + divider('═') + '\n');
}

// ---------------------------------------------------------------------------
// Save helpers
// ---------------------------------------------------------------------------

function saveAdvisorSession(idea, gap, r1, r2, studentAnswers, r3, student_rq, student_context, student_approach) {
  mkdirSync(IDEAS_DIR, { recursive: true });

  const gapId  = gap.gap_id  ?? 'GAP';
  const ideaId = idea.idea_id ?? 'IDEA';
  const today  = new Date().toISOString().slice(0, 10);

  const session = {
    gap_id:           gapId,
    idea_id:          ideaId,
    advised_at:       today,
    student_rq,
    student_context:  student_context  || null,
    student_approach: student_approach || null,
    round1:           r1,
    round2:           r2,
    student_answers:  studentAnswers,
    round3:           r3,
  };

  const filename = `${gapId}_${ideaId}_advisor.json`;
  writeFileSync(join(IDEAS_DIR, filename), JSON.stringify(session, null, 2), 'utf8');
  console.log(chalk.green(`\n  ✓  Advisor session saved → data/ideas/${filename}`));

  return { session, filename };
}

function updateIdeaFile(idea, gap, r3) {
  const gapId  = gap.gap_id  ?? 'GAP';
  const ideaId = idea.idea_id ?? 'IDEA';

  const ideaPath = join(IDEAS_DIR, `${gapId}_${ideaId}.json`);

  if (!existsSync(ideaPath)) {
    console.log(chalk.yellow(`  [!] Idea file not found at data/ideas/${gapId}_${ideaId}.json — skipping update.`));
    return;
  }

  const ideaData = JSON.parse(readFileSync(ideaPath, 'utf8'));

  const updated = {
    ...ideaData,
    revised_rq:                r3.revised_rq,
    methodology_improvements:  r3.methodology_improvements ?? [],
    advisor_final_verdict:     r3.final_verdict,
    advisor_reviewed_at:       new Date().toISOString().slice(0, 10),
  };

  writeFileSync(ideaPath, JSON.stringify(updated, null, 2), 'utf8');
  console.log(chalk.green(`  ✓  Idea file updated with revised RQ → data/ideas/${gapId}_${ideaId}.json`));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function advisorMode(idea, gap, profile) {
  console.log(divider());
  console.log(header('ADVISOR SIMULATION'));
  console.log(divider());
  console.log();
  console.log(chalk.dim(`Loaded: ${idea.title ?? idea.idea_id ?? '(untitled)'}`));
  console.log(chalk.dim(`Gap: ${gap.title ?? gap.gap_id ?? '?'} (${gap.type ?? '?'})`));
  console.log(chalk.dim(`Suggested RQ: ${idea.research_question ?? '(none)'}`));
  console.log();
  console.log(chalk.white(
`The advisor will interrogate your research question — not the
suggested one above, but YOUR version of it.

Before the session begins, describe your research question in
your own words. Build on the suggested idea, refine it, or go
in a different direction based on what you read.

Be specific. Name a method, a dataset, a measurable outcome.
The more specific your RQ, the more useful the advisor's feedback.`
  ));
  console.log();

  const { student_rq } = await inquirer.prompt([{
    type:     'input',
    name:     'student_rq',
    message:  'Your research question:',
    validate: (v) => {
      if (v.trim().length >= 20) return true;
      return 'Too short — be more specific. What exactly are you testing?';
    },
  }]);

  const { student_context } = await inquirer.prompt([{
    type:    'input',
    name:    'student_context',
    message: 'What did you learn from reading the full papers that changed or confirmed your thinking? (optional, press Enter to skip):',
  }]);

  const { student_approach } = await inquirer.prompt([{
    type:    'input',
    name:    'student_approach',
    message: 'What is your proposed approach or method? (optional):',
  }]);

  console.log();

  const client      = new Anthropic();
  const systemBlock = [
    { type: 'text', text: loadSystemPrompt(), cache_control: { type: 'ephemeral' } },
  ];

  // Accumulates across all three rounds so Claude has full context.
  const messages = [];

  // ── ROUND 1: First impression ─────────────────────────────────────────────

  console.log(chalk.gray('Round 1: first impression...\n'));

  const r1Msg = round1UserMessage(idea, gap, profile, student_rq, student_context, student_approach);
  messages.push({ role: 'user', content: r1Msg });

  let r1;
  try {
    const { parsed, raw } = await callClaude(client, systemBlock, messages);
    r1 = parsed;
    messages.push({ role: 'assistant', content: raw });
  } catch (err) {
    console.error(chalk.red(`\nRound 1 failed: ${err.message}\n`));
    return;
  }

  displayRound1(r1);

  // ── ROUND 2: Interrogation ────────────────────────────────────────────────

  const { continueToR2 } = await inquirer.prompt([{
    type:    'input',
    name:    'continueToR2',
    message: 'The advisor wants to interrogate 3 aspects. Continue? (yes/no):',
    validate: (v) => ['yes', 'no'].includes(v.trim().toLowerCase()) || 'Enter yes or no',
  }]);

  if (continueToR2.trim().toLowerCase() !== 'yes') {
    console.log(chalk.gray('\nAdvisor session ended after first impression.\n'));
    return;
  }

  console.log(chalk.gray('\nRound 2: generating hard questions...\n'));

  const r2Msg = round2UserMessage(student_rq);
  messages.push({ role: 'user', content: r2Msg });

  let r2;
  try {
    const { parsed, raw } = await callClaude(client, systemBlock, messages);
    r2 = parsed;
    messages.push({ role: 'assistant', content: raw });
  } catch (err) {
    console.error(chalk.red(`\nRound 2 failed: ${err.message}\n`));
    return;
  }

  const questions = r2.questions ?? [];
  if (questions.length === 0) {
    console.log(chalk.yellow('\nNo questions returned. Skipping to final verdict.\n'));
  } else {
    displayQuestions(questions);
  }

  const studentAnswers = await collectMultilineInput(
    "Answer the advisor's questions (type your responses, one per line, press Enter twice when done):"
  );

  if (!studentAnswers.trim()) {
    console.log(chalk.yellow('\nNo answers provided. Skipping to final verdict.\n'));
  }

  // ── ROUND 3: Final verdict ────────────────────────────────────────────────

  console.log(chalk.gray('\nRound 3: generating final verdict...\n'));

  const r3Msg = round3UserMessage(studentAnswers || '(Student did not provide answers.)');
  messages.push({ role: 'user', content: r3Msg });

  let r3;
  try {
    const { parsed, raw } = await callClaude(client, systemBlock, messages);
    r3 = parsed;
    messages.push({ role: 'assistant', content: raw });
  } catch (err) {
    console.error(chalk.red(`\nRound 3 failed: ${err.message}\n`));
    return;
  }

  displayFinalVerdict(r3);

  // ── Save session ──────────────────────────────────────────────────────────

  saveAdvisorSession(idea, gap, r1, r2, studentAnswers, r3, student_rq, student_context, student_approach);

  // ── Update tracker ────────────────────────────────────────────────────────

  appendTracker({
    mode:         'advisor',
    query:        `${gap.gap_id ?? 'GAP'} / ${idea.idea_id ?? 'IDEA'}`,
    result_count: 3,
    top_result:   truncate(r3.revised_rq ?? idea.research_question ?? '', 60),
    score:        '',
    decision:     `final_verdict: ${r3.final_verdict ?? '?'}`,
    notes:        `stage: advisor_reviewed | initial: ${r1.initial_verdict ?? '?'} | final: ${r3.final_verdict ?? '?'}`,
  });

  // ── Optionally write revised RQ back to idea file ─────────────────────────

  if (r3.revised_rq) {
    const { saveRevised } = await inquirer.prompt([{
      type:    'input',
      name:    'saveRevised',
      message: 'Save revised RQ to your idea file? (yes/no):',
      validate: (v) => ['yes', 'no'].includes(v.trim().toLowerCase()) || 'Enter yes or no',
    }]);

    if (saveRevised.trim().toLowerCase() === 'yes') {
      updateIdeaFile(idea, gap, r3);
    }
  }

  console.log(chalk.gray('\nAdvisor session complete.\n'));
}

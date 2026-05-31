import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import pLimit from 'p-limit';
import { readProfile, appendTracker } from './utils/profile.js';
import { filterUnseen, markSeen } from './utils/dedup.js';
import { searchPapers } from './apis/semanticScholar.js';
import { searchArxiv } from './apis/arxiv.js';
import { scorePaper } from './scoring.js';
import { tw, divider, sectionLine, wrapLines } from './utils/terminal.js';

const ROOT            = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHORTLISTED_DIR = join(ROOT, 'data', 'shortlisted');
const CURRENT_YEAR    = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------

const GRADE_CHALK = {
  A: chalk.green,
  B: chalk.cyan,
  C: chalk.yellow,
  D: chalk.white,
  F: chalk.dim,
};

function truncate(str, n) {
  const s = str ?? '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function sanitizeId(paperId) {
  return (paperId ?? 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getPdfUrl(paper) {
  return paper.openAccessPdf?.url ?? paper.pdfUrl ?? null;
}

// ---------------------------------------------------------------------------
// Score progress bar — 10 characters, 2 filled per point
// ---------------------------------------------------------------------------

const SCORE_DIMS = [
  ['skill_fit',          'Skill fit:          '],
  ['tool_compatibility', 'Tool compatibility: '],
  ['scope_feasibility',  'Scope feasibility:  '],
  ['dataset_access',     'Dataset access:     '],
  ['novelty',            'Novelty:            '],
  ['reproducibility',    'Reproducibility:    '],
];

function scoreBar(score, colorFn = chalk.white) {
  const filled = Math.max(0, Math.min(5, score)) * 2;
  return colorFn('█'.repeat(filled)) + chalk.gray('░'.repeat(10 - filled));
}

// ---------------------------------------------------------------------------
// Paper inspect card (divider-based, terminal-responsive)
// ---------------------------------------------------------------------------

function displayPaperCard(result, orig) {
  const termWidth  = tw();
  const cardWrap   = Math.min(termWidth - 10, 100);
  const gradeColor = GRADE_CHALK[result.grade] ?? chalk.white;
  const pdfUrl     = getPdfUrl(result);
  const isVeryNew  = result.year === CURRENT_YEAR &&
                     (orig.citationCount === 0 || orig.citationCount == null);

  console.log('\n' + divider());

  // ── Header ────────────────────────────────────────────────────────────────
  const gradeTag  = gradeColor.bold(`[${result.grade}]`);
  const titleText = truncate(result.title ?? '', cardWrap - 14);
  const yearTag   = chalk.gray(`(${result.year ?? '?'})`);
  console.log(` ${gradeTag}  ${chalk.bold(titleText)}  ${yearTag}`);

  const rawAuthors = (orig.authors ?? []).map((a) => a.name ?? String(a));
  const authorStr  = rawAuthors.length <= 1
    ? (rawAuthors[0] ?? 'Unknown authors')
    : `${rawAuthors[0]} et al.`;
  console.log(chalk.gray(` ${truncate(authorStr, 40)}  ·  ${orig.citationCount ?? 0} citations  ·  ${result.source ?? 'unknown'}`));

  if (isVeryNew) {
    console.log(chalk.bgYellow.black.bold('  ⚠  Very new — no peer validation yet  '));
  }

  // ── Abstract ──────────────────────────────────────────────────────────────
  console.log('\n' + sectionLine('ABSTRACT'));
  const abstractText = (orig.abstract ?? '').trim() || '(not available)';
  const abstractLines = wrapLines(abstractText, 1, cardWrap);
  for (const line of abstractLines.slice(0, 20)) {
    console.log(line);
  }
  if (abstractLines.length > 20) {
    console.log(chalk.dim(' … (truncated — see full abstract in source)'));
  }

  // ── TLDR ──────────────────────────────────────────────────────────────────
  console.log('\n' + sectionLine('TLDR  (Semantic Scholar)'));
  const tldrText = orig.tldr?.text?.trim() ?? 'Not available';
  for (const line of wrapLines(tldrText, 1, cardWrap)) {
    console.log(chalk.gray(line));
  }

  // ── Score breakdown ───────────────────────────────────────────────────────
  console.log('\n' + sectionLine('SCORE BREAKDOWN'));
  const scores = result.scores ?? {};
  for (const [dim, label] of SCORE_DIMS) {
    const score = scores[dim] ?? 0;
    console.log(` ${chalk.gray(label)} ${score}/5  ${scoreBar(score, gradeColor)}`);
  }
  console.log(
    chalk.bold(` Weighted: ${result.weighted_score}`) +
    chalk.gray('  ·  Grade: ') +
    gradeColor.bold(result.grade)
  );

  // ── Fit reason ────────────────────────────────────────────────────────────
  console.log('\n' + sectionLine('FIT REASON'));
  for (const line of wrapLines(result.fit_reason ?? '', 1, cardWrap)) {
    console.log(line);
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  console.log('\n' + sectionLine('PDF'));
  if (pdfUrl) {
    console.log(chalk.green(' Available ✓  ') + chalk.gray(truncate(pdfUrl, 90)));
  } else {
    console.log(chalk.red(' Not available'));
  }

  console.log('\n' + divider());
}

// ---------------------------------------------------------------------------
// Step 2 helper — build queries from profile
// ---------------------------------------------------------------------------

function buildQueries(profile, customQuery) {
  const primary = profile.domain.primary;
  const sub0    = profile.domain.sub_areas[0];
  const int0    = profile.goals.interests[0];
  const int1    = profile.goals.interests[1];

  const seen = new Set();
  const add  = (q) => { const t = q?.trim(); if (t) seen.add(t); };

  if (customQuery) add(customQuery);
  add(sub0 ? `${primary} ${sub0}` : primary);
  if (int0 && int0.toLowerCase() !== primary.toLowerCase()) add(`${int0} ${primary}`);
  if (int0 && int1)                                         add(`${int0} ${int1}`);
  else if (int0 && int0.toLowerCase() !== primary.toLowerCase()) add(int0);
  add(primary);

  return [...seen].slice(0, 4);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runDiscover(customQuery) {

  // ── Step 1: Load profile ─────────────────────────────────────────────────

  let profile;
  try {
    profile = readProfile();
  } catch (err) {
    console.error(chalk.red(`\n${err.message}`));
    console.error(chalk.yellow('Run `node src/index.js onboard` first.\n'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan(`\nDiscover — finding research directions for ${profile.profile.name}\n`));

  // ── Step 2: Build queries ────────────────────────────────────────────────

  const queries = buildQueries(profile, customQuery);
  console.log(chalk.bold('Search queries:'));
  queries.forEach((q, i) => console.log(chalk.gray(`  ${i + 1}. "${q}"`)));
  console.log();

  // ── Step 3: Fetch papers ─────────────────────────────────────────────────

  console.log(chalk.bold('Fetching papers...\n'));

  const limit = pLimit(2);

  const ssPromises = queries.map((q) =>
    limit(() =>
      searchPapers(q, 15).catch((err) => {
        console.error(chalk.red(`  [!] SemanticScholar failed for "${q}": ${err.message}`));
        return [];
      })
    )
  );

  const arxivPromise = searchArxiv(queries[0], 15).catch((err) => {
    console.error(chalk.red(`  [!] arXiv failed for "${queries[0]}": ${err.message}`));
    return [];
  });

  const [ssResults, arxivResults] = await Promise.all([
    Promise.all(ssPromises),
    arxivPromise,
  ]);

  const paperMap = new Map();
  for (const paper of [...ssResults.flat(), ...arxivResults]) {
    if (paper.paperId && !paperMap.has(paper.paperId)) {
      paperMap.set(paper.paperId, paper);
    }
  }
  const merged = [...paperMap.values()];

  console.log(chalk.gray(`\nFetched ${merged.length} papers across all sources.\n`));

  if (merged.length === 0) {
    console.log(chalk.yellow('No papers found. Try a different query.\n'));
    return;
  }

  // ── Step 4: Filter unseen ────────────────────────────────────────────────

  const unseen    = filterUnseen(merged);
  const seenCount = merged.length - unseen.length;

  if (seenCount > 0) {
    console.log(chalk.gray(`Skipped ${seenCount} already-seen papers. ${unseen.length} new.\n`));
  }

  if (unseen.length === 0) {
    console.log(chalk.yellow('All results have been seen before. Try a different query.\n'));
    markSeen(merged);
    return;
  }

  // ── Step 5: Score with progress ──────────────────────────────────────────

  console.log(chalk.bold('Scoring papers...\n'));

  const scored = [];
  for (let i = 0; i < unseen.length; i++) {
    const paper = unseen[i];
    process.stdout.write(
      `\r  [${i + 1}/${unseen.length}] "${truncate(paper.title, 50)}"...` + ' '.repeat(10)
    );
    scored.push({
      ...scorePaper(paper, profile),
      citationCount: paper.citationCount  ?? 0,
      openAccessPdf: paper.openAccessPdf  ?? null,
      pdfUrl:        paper.pdfUrl         ?? null,
    });
  }
  process.stdout.write('\r' + ' '.repeat(process.stdout.columns ?? 80) + '\r');

  // ── Step 6: Sort descending by weighted_score ────────────────────────────

  scored.sort((a, b) => b.weighted_score - a.weighted_score);

  // ── Step 7: Two responsive tables ───────────────────────────────────────
  //
  //  Table 1 — identity  (#, Grade, Title, Year, Citations)
  //  Table 2 — scores    (#, Skill, Tools, Scope, Data, Nvlty, Repro, Source)
  //  Linked by the # column.

  const termWidth = tw();

  console.log(chalk.bold(`\nResults — ${scored.length} papers scored\n`));

  // Table 1
  const titleW = Math.max(15, termWidth - 45);   // #4 + Grade7 + Year6 + Cites9 + borders~19
  const t1 = new Table({
    head:      ['#', 'Grade', 'Title', 'Year', 'Cites'],
    colWidths: [4, 7, titleW, 6, 9],
    wordWrap:  true,
    style:     { head: ['bold', 'cyan'] },
  });

  scored.forEach((r, i) => {
    const color = GRADE_CHALK[r.grade] ?? chalk.white;
    t1.push([
      color(String(i + 1)),
      color(r.grade),
      color(truncate(r.title, titleW - 2)),
      color(String(r.year ?? '—')),
      color(String(r.citationCount ?? 0)),
    ]);
  });

  console.log(t1.toString());

  // Table 2 — all score columns are narrow single digits; source fills remaining space
  const t2 = new Table({
    head:      ['#', 'Skill', 'Tools', 'Scope', 'Data', 'Nvlty', 'Repro', 'Source'],
    colWidths: [4, 7, 7, 7, 6, 7, 7, 16],
    wordWrap:  false,
    style:     { head: ['bold', 'cyan'] },
  });

  scored.forEach((r, i) => {
    const color = GRADE_CHALK[r.grade] ?? chalk.white;
    const s     = r.scores ?? {};
    t2.push([
      color(String(i + 1)),
      color(String(s.skill_fit          ?? '—')),
      color(String(s.tool_compatibility ?? '—')),
      color(String(s.scope_feasibility  ?? '—')),
      color(String(s.dataset_access     ?? '—')),
      color(String(s.novelty            ?? '—')),
      color(String(s.reproducibility    ?? '—')),
      color(truncate(r.source ?? '—', 14)),
    ]);
  });

  console.log('\n' + chalk.dim('Scores (1–5 per dimension — cross-reference by #):'));
  console.log(t2.toString());

  // Fit-reason digest for top 5
  console.log(chalk.bold('\nTop matches:\n'));
  scored.slice(0, 5).forEach((r, i) => {
    console.log(`  ${chalk.bold(`${i + 1}.`)} ${r.fit_reason}`);
  });
  console.log();

  // ── Step 8: Inspect-then-shortlist loop ──────────────────────────────────

  const origByid       = new Map(unseen.map((p) => [p.paperId, p]));
  const shortlistedSet = new Set();
  let   committed      = false;

  const showShortlist = () => {
    if (shortlistedSet.size === 0) return;
    console.log(chalk.bold.green(`\nShortlisted so far (${shortlistedSet.size}):`));
    for (const i of [...shortlistedSet].sort((a, b) => a - b)) {
      const r = scored[i];
      console.log((GRADE_CHALK[r.grade] ?? chalk.white)(`  ✓  [${r.grade}]  ${truncate(r.title, 65)}`));
    }
    console.log();
  };

  while (true) {
    showShortlist();

    const { input } = await inquirer.prompt([{
      type:    'input',
      name:    'input',
      message: "Enter a paper number to inspect, 'done' when ready to shortlist, or 'skip' to exit:",
      validate: (v) => {
        const t = v.trim().toLowerCase();
        if (t === 'done' || t === 'skip') return true;
        const n = parseInt(t, 10);
        if (Number.isInteger(n) && n >= 1 && n <= scored.length) return true;
        return `Enter a number between 1 and ${scored.length}, 'done', or 'skip'.`;
      },
    }]);

    const cmd = input.trim().toLowerCase();

    // ── skip ───────────────────────────────────────────────────────────────
    if (cmd === 'skip') {
      markSeen(merged);
      console.log(chalk.gray('\nNo papers shortlisted.\n'));
      appendTracker({
        mode:         'discover',
        query:        queries.join('; '),
        result_count: scored.length,
        top_result:   truncate(scored[0]?.title ?? '', 60),
        score:        scored[0]?.weighted_score ?? '',
        decision:     'skipped',
        notes:        `${merged.length} fetched, ${unseen.length} new, 0 shortlisted`,
      });
      return;
    }

    // ── done ───────────────────────────────────────────────────────────────
    if (cmd === 'done') {
      if (shortlistedSet.size === 0) {
        console.log(chalk.yellow('\nNothing shortlisted yet. Inspect some papers first, or type skip to exit.\n'));
        continue;
      }

      console.log(chalk.bold(`\nReady to shortlist ${shortlistedSet.size} paper(s):\n`));
      for (const i of [...shortlistedSet].sort((a, b) => a - b)) {
        const r = scored[i];
        console.log((GRADE_CHALK[r.grade] ?? chalk.white)(`  ✓  [${r.grade}]  ${truncate(r.title, 65)}`));
      }
      console.log();

      const { confirmed } = await inquirer.prompt([{
        type:    'confirm',
        name:    'confirmed',
        message: `Confirm shortlist of ${shortlistedSet.size} paper(s)?`,
        default: true,
      }]);

      if (!confirmed) {
        console.log(chalk.yellow('\nReturning to inspection...\n'));
        continue;
      }

      committed = true;
      break;
    }

    // ── number: show card ──────────────────────────────────────────────────
    const idx  = parseInt(cmd, 10) - 1;
    const orig = origByid.get(scored[idx].paperId) ?? {};

    displayPaperCard(scored[idx], orig);

    const { addIt } = await inquirer.prompt([{
      type:    'confirm',
      name:    'addIt',
      message: shortlistedSet.has(idx)
        ? 'Already in shortlist — remove it?'
        : 'Add to shortlist?',
      default: !shortlistedSet.has(idx),
    }]);

    if (shortlistedSet.has(idx)) {
      if (addIt) { shortlistedSet.delete(idx); console.log(chalk.yellow('  — Removed from shortlist.\n')); }
    } else {
      if (addIt) { shortlistedSet.add(idx);    console.log(chalk.green('  ✓  Added to shortlist.\n'));     }
    }
  }

  // ── Save shortlisted papers ───────────────────────────────────────────────

  if (!committed || shortlistedSet.size === 0) return;

  markSeen(merged);
  mkdirSync(SHORTLISTED_DIR, { recursive: true });

  const today       = new Date().toISOString().slice(0, 10);
  const shortlisted = [...shortlistedSet].sort((a, b) => a - b).map((i) => scored[i]);

  for (const result of shortlisted) {
    const original = origByid.get(result.paperId) ?? {};
    const record   = {
      ...original,
      scoring: {
        scores:         result.scores,
        weighted_score: result.weighted_score,
        grade:          result.grade,
        fit_reason:     result.fit_reason,
      },
      shortlisted_at: today,
      stage:          'discovered',
    };
    writeFileSync(
      join(SHORTLISTED_DIR, sanitizeId(result.paperId) + '.json'),
      JSON.stringify(record, null, 2),
      'utf8'
    );
  }

  console.log(chalk.bold.green(`\n${shortlisted.length} paper${shortlisted.length === 1 ? '' : 's'} shortlisted.\n`));
  shortlisted.forEach((r) => console.log(`  ${chalk.green('[+]')} ${truncate(r.title, 72)}`));
  console.log(chalk.gray('\nRun `node src/index.js litreview` to analyze them.\n'));

  // ── Step 9: Append to tracker ────────────────────────────────────────────

  appendTracker({
    mode:         'discover',
    query:        queries.join('; '),
    result_count: scored.length,
    top_result:   truncate(scored[0]?.title ?? '', 60),
    score:        scored[0]?.weighted_score ?? '',
    decision:     `shortlisted: ${shortlisted.map((r) => truncate(r.title, 30)).join(', ')}`,
    notes:        `${merged.length} fetched, ${unseen.length} new, ${shortlisted.length} shortlisted`,
  });
}

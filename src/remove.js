import inquirer from 'inquirer';
import chalk from 'chalk';
import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT            = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHORTLISTED_DIR = join(ROOT, 'data', 'shortlisted');

function truncate(str, n) {
  const s = str ?? '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function loadPapers() {
  if (!existsSync(SHORTLISTED_DIR)) return [];

  return readdirSync(SHORTLISTED_DIR)
    .filter((f) => f.endsWith('.json') && !f.endsWith('_review.json') && f !== '.gitkeep')
    .map((f) => {
      const slug = f.replace(/\.json$/, '');
      let title  = slug;
      let grade  = null;

      try {
        const data = JSON.parse(readFileSync(join(SHORTLISTED_DIR, f), 'utf8'));
        title = data.title ?? slug;
        grade = data.scoring?.grade ?? null;
      } catch { /* malformed — use slug as label */ }

      const hasReview = existsSync(join(SHORTLISTED_DIR, `${slug}_review.json`));
      return { slug, title, grade, hasReview };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function runRemove() {
  console.log();

  const papers = loadPapers();

  if (papers.length === 0) {
    console.log(chalk.yellow('No shortlisted papers found.'));
    console.log(chalk.dim('Run: node src/index.js discover  to find papers.\n'));
    return;
  }

  const { selected } = await inquirer.prompt([
    {
      type:     'checkbox',
      name:     'selected',
      message:  'Select papers to remove  (Space to toggle, Enter to confirm):',
      pageSize: Math.min(papers.length + 2, 15),
      choices:  papers.map((p) => {
        const gradeTag  = p.grade  ? chalk.dim(` [${p.grade}]`)        : '';
        const reviewTag = p.hasReview ? chalk.dim(' +review')          : '';
        return {
          name:  truncate(p.title, 65) + gradeTag + reviewTag,
          value: p.slug,
        };
      }),
    },
  ]);

  if (selected.length === 0) {
    console.log(chalk.gray('\nNothing selected. No changes made.\n'));
    return;
  }

  // Preview what will be deleted
  console.log();
  console.log(chalk.bold(`Will remove ${selected.length} paper(s):`));

  for (const slug of selected) {
    const p          = papers.find((x) => x.slug === slug);
    const reviewNote = p.hasReview ? chalk.dim(' + review') : '';
    console.log('  ' + chalk.red('✕') + '  ' + truncate(p.title, 70) + reviewNote);
  }

  console.log();

  const { confirmed } = await inquirer.prompt([
    {
      type:     'input',
      name:     'confirmed',
      message:  chalk.yellow('Are you sure? This cannot be undone. (yes/no):'),
      validate: (v) => {
        const t = v.trim().toLowerCase();
        if (t === 'yes' || t === 'no') return true;
        return 'Please enter yes or no.';
      },
    },
  ]);

  if (confirmed.trim().toLowerCase() !== 'yes') {
    console.log(chalk.gray('\nRemoval cancelled.\n'));
    return;
  }

  console.log();

  let removed = 0;
  for (const slug of selected) {
    rmSync(join(SHORTLISTED_DIR, `${slug}.json`), { force: true });
    removed++;

    const reviewPath = join(SHORTLISTED_DIR, `${slug}_review.json`);
    if (existsSync(reviewPath)) rmSync(reviewPath, { force: true });
  }

  const remaining = papers.length - removed;
  console.log(chalk.green(`✔ Removed ${removed} paper(s).`) + chalk.dim(`  ${remaining} remain in shortlist.`));
  console.log(chalk.dim('  seen-papers.tsv preserved — removed papers will not resurface in future searches.'));
  console.log();
}

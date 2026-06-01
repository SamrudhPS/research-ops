import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  existsSync,
  readdirSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT            = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHORTLISTED_DIR = join(ROOT, 'data', 'shortlisted');
const COMPARISON_PATH = join(ROOT, 'data', 'comparison.json');
const GAPS_PATH       = join(ROOT, 'data', 'gaps.json');
const IDEAS_DIR       = join(ROOT, 'data', 'ideas');
const TRACKER_PATH    = join(ROOT, 'tracker.tsv');
const SEEN_PATH       = join(ROOT, 'data', 'seen-papers.tsv');

const TRACKER_HEADER    = 'run_id\ttimestamp\tmode\tquery\tresult_count\ttop_result\tscore\tdecision\tnotes\n';
const SEEN_HEADER       = 'paper_id\ttitle\tsource\tdate_added\n';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearDir(dir, keepGitkeep = true) {
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter(
    (f) => !(keepGitkeep && f === '.gitkeep'),
  );
  for (const f of files) rmSync(join(dir, f), { recursive: true, force: true });
  return files.length;
}

function deleteIfExists(filePath) {
  if (existsSync(filePath)) {
    rmSync(filePath, { force: true });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Reset scopes
// ---------------------------------------------------------------------------

function resetShortlisted() {
  const removed = clearDir(SHORTLISTED_DIR);
  return { shortlisted: removed };
}

function resetEntirePipeline() {
  const shortlisted = clearDir(SHORTLISTED_DIR);
  const ideas       = clearDir(IDEAS_DIR);

  deleteIfExists(COMPARISON_PATH);
  deleteIfExists(GAPS_PATH);

  writeFileSync(TRACKER_PATH, TRACKER_HEADER, 'utf8');
  writeFileSync(SEEN_PATH,    SEEN_HEADER,    'utf8');

  // Ensure idea dir survives (may not have existed before)
  if (!existsSync(IDEAS_DIR)) mkdirSync(IDEAS_DIR, { recursive: true });

  return { shortlisted, ideas };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runReset() {
  console.log();

  const { scope } = await inquirer.prompt([
    {
      type:    'list',
      name:    'scope',
      message: 'What do you want to reset?',
      choices: [
        {
          name:  '1. Shortlisted papers only',
          value: 'shortlisted',
        },
        {
          name:  '2. Entire pipeline  (shortlisted + reviews + gaps + ideas + tracker rows)',
          value: 'pipeline',
        },
        {
          name:  '3. Cancel',
          value: 'cancel',
        },
      ],
    },
  ]);

  if (scope === 'cancel') {
    console.log(chalk.gray('Reset cancelled.'));
    return;
  }

  const label = scope === 'shortlisted'
    ? 'shortlisted papers'
    : 'the entire pipeline';

  const { confirmed } = await inquirer.prompt([
    {
      type:    'input',
      name:    'confirmed',
      message: chalk.yellow(`Are you sure you want to reset ${label}? This cannot be undone. (yes/no):`),
      validate: (v) => {
        const t = v.trim().toLowerCase();
        if (t === 'yes' || t === 'no') return true;
        return 'Please enter yes or no.';
      },
    },
  ]);

  if (confirmed.trim().toLowerCase() !== 'yes') {
    console.log(chalk.gray('Reset cancelled.'));
    return;
  }

  console.log();

  if (scope === 'shortlisted') {
    const { shortlisted } = resetShortlisted();
    console.log(chalk.green('✔') + ` Cleared ${shortlisted} file(s) from data/shortlisted/`);
    console.log(chalk.dim('  seen-papers.tsv preserved — previously seen papers will not resurface.'));
  } else {
    const { shortlisted, ideas } = resetEntirePipeline();
    console.log(chalk.green('✔') + ` Cleared ${shortlisted} file(s) from data/shortlisted/`);
    console.log(chalk.green('✔') + ` Cleared ${ideas} file(s) from data/ideas/`);
    console.log(chalk.green('✔') + '  Removed data/comparison.json');
    console.log(chalk.green('✔') + '  Removed data/gaps.json');
    console.log(chalk.green('✔') + '  Reset tracker.tsv to headers only');
    console.log(chalk.green('✔') + '  Reset seen-papers.tsv to headers only');
  }

  console.log();
  console.log(chalk.bold('researcher.yml was not touched.') + chalk.dim(' Your profile is always preserved.'));
  console.log(chalk.cyan('\nRun: node src/index.js discover') + chalk.dim(' to start a fresh pipeline.'));
  console.log();
}

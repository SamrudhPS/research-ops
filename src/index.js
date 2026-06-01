#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import { runOnboard }  from './onboard.js';
import { runDiscover } from './discover.js';
import { runLitreview } from './litreview.js';
import { runCompare }  from './compare.js';
import { runGaps }     from './gaps.js';
import { runIdeate }   from './ideate.js';
import { runTracker }  from './tracker.js';
import { runReset }    from './reset.js';
import { runRemove }   from './remove.js';

// ---------------------------------------------------------------------------
// Custom help — shown when no command is given
// ---------------------------------------------------------------------------

if (process.argv.length <= 2) {
  const W   = 38;
  const bar = chalk.dim('─'.repeat(W));
  const cmds = [
    ['onboard',   'Set up your researcher profile'],
    ['discover',  'Find papers matching your profile'],
    ['litreview', 'Deep analysis of shortlisted papers'],
    ['compare',   'Cross-paper methodology comparison'],
    ['gaps',      'Extract research gaps from corpus'],
    ['ideate',    'Turn a gap into research ideas'],
    ['tracker',   'View your pipeline status'],
    ['remove',    'Delete selected shortlisted papers'],
    ['reset',     'Clear shortlisted papers or the full pipeline'],
  ];

  console.log('\n' + chalk.bold('RESEARCH-OPS · Find your research gap'));
  console.log(bar);
  for (const [cmd, desc] of cmds) {
    console.log(chalk.cyan(cmd.padEnd(12)) + desc);
  }
  console.log(bar);
  console.log(chalk.gray('Run: node src/index.js tracker to see where you are.\n'));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

program
  .name('research-ops')
  .description('From knowing your skills to finding research gaps you can act on')
  .version('0.1.0');

program
  .command('onboard')
  .description('Set up your researcher profile (researcher.yml)')
  .action(runOnboard);

program
  .command('discover')
  .description('Find papers matching your profile')
  .argument('[query]', 'Optional custom query — auto-generated from profile if omitted')
  .action(runDiscover);

program
  .command('litreview')
  .description('Deep analysis of shortlisted papers')
  .action(runLitreview);

program
  .command('compare')
  .description('Cross-paper methodology comparison')
  .action(() => runCompare());

program
  .command('gaps')
  .description('Extract research gaps from corpus')
  .action(runGaps);

program
  .command('ideate')
  .description('Turn a gap into research ideas')
  .argument('[gap_id]', 'Gap ID from data/gaps.json (e.g. GAP-001) — prompted if omitted')
  .action(runIdeate);

program
  .command('tracker')
  .description('View your pipeline status')
  .action(runTracker);

program
  .command('remove')
  .description('Delete selected shortlisted papers (and their reviews)')
  .action(runRemove);

program
  .command('reset')
  .description('Clear shortlisted papers or the full pipeline (researcher.yml is never touched)')
  .action(runReset);

program.parse();

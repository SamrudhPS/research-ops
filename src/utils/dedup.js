import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEEN_PATH = join(ROOT, 'data', 'seen-papers.tsv');
const HEADER    = 'paper_id\ttitle\tsource\tdate_added\n';

// Sanitize a single field so it never breaks the TSV row.
function sanitizeField(str) {
  return (str ?? '').replace(/[\t\n\r]/g, ' ').trim();
}

// ---------------------------------------------------------------------------

export function loadSeen() {
  if (!existsSync(SEEN_PATH)) return new Set();

  const lines = readFileSync(SEEN_PATH, 'utf8').split('\n');
  const seen  = new Set();

  for (const line of lines.slice(1)) {        // skip header row
    const id = line.split('\t')[0]?.trim();
    if (id) seen.add(id);
  }

  return seen;
}

export function markSeen(papers) {
  // Create file with headers if it doesn't exist yet.
  if (!existsSync(SEEN_PATH)) {
    writeFileSync(SEEN_PATH, HEADER, 'utf8');
  }

  const alreadySeen = loadSeen();
  const today       = new Date().toISOString().slice(0, 10);

  const newRows = papers
    .filter((p) => p.paperId && !alreadySeen.has(p.paperId))
    .map((p) =>
      [
        sanitizeField(p.paperId),
        sanitizeField(p.title),
        sanitizeField(p.source ?? 'unknown'),
        today,
      ].join('\t')
    );

  if (newRows.length > 0) {
    appendFileSync(SEEN_PATH, newRows.join('\n') + '\n', 'utf8');
  }
}

export function filterUnseen(papers) {
  const seen = loadSeen();
  return papers.filter((p) => p.paperId && !seen.has(p.paperId));
}

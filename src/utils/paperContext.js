import axios from 'axios';
import chalk from 'chalk';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// pdf-parse is CommonJS — createRequire is the reliable ESM bridge.
// A direct `import pdfParse from 'pdf-parse'` triggers its test-bootstrap
// side-effect and can fail in Node 18+.
const require    = createRequire(import.meta.url);
const pdfParse   = require('pdf-parse');

const ROOT            = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHORTLISTED_DIR = join(ROOT, 'data', 'shortlisted');

// Maximum characters kept per extracted section.
// Enough for gap analysis without bloating the context object.
const SECTION_LIMIT = 2_500;

// ---------------------------------------------------------------------------
// PDF helpers
// ---------------------------------------------------------------------------

async function downloadPdfBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20_000,
    headers: { 'User-Agent': 'research-ops/0.1.0 (open-source academic tool)' },
  });
  return Buffer.from(res.data);
}

// Returns the canonical section key for a line that looks like a heading,
// or null if the line is body text.
function detectHeading(line) {
  const t = line.trim();
  // Section headings are short and don't end with punctuation like periods.
  if (!t || t.length > 100 || t.endsWith('.')) return null;

  // Patterns are intentionally loose to handle "1 Introduction",
  // "1. Introduction", "2.1 Our Proposed Method", etc.
  if (/^abstract$/i.test(t))                                              return 'abstract';
  if (/^(?:\d[\d.]*\s+)?introduction\b/i.test(t))                        return 'introduction';
  if (/^(?:\d[\d.]*\s+)?(?:method(?:s|ology)?|approach|proposed(?:\s+\w+)?|our\s+(?:method|approach|model|framework))\b/i.test(t)) return 'methodology';
  if (/^(?:\d[\d.]*\s+)?(?:conclusion[s]?|concluding|summary\s+and\s+)/i.test(t)) return 'conclusion';
  return null;
}

function extractSections(rawText) {
  // Normalise whitespace and PDF artifacts before line-splitting.
  const text = rawText
    .replace(/\f/g, '\n')          // form feeds
    .replace(/\r\n?/g, '\n')       // CRLF
    .replace(/[ \t]+/g, ' ')       // collapse horizontal whitespace
    .replace(/\n{3,}/g, '\n\n');   // collapse blank lines

  const sections = { abstract: '', introduction: '', methodology: '', conclusion: '' };
  const buffers  = {};
  let current    = null;

  for (const line of text.split('\n')) {
    const heading = detectHeading(line);
    if (heading) {
      current             = heading;
      buffers[current]  ??= '';
    } else if (current && line.trim()) {
      buffers[current] += line.trim() + ' ';
    }
  }

  for (const key of Object.keys(sections)) {
    sections[key] = (buffers[key] ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, SECTION_LIMIT);
  }

  return sections;
}

// ---------------------------------------------------------------------------
// 1. loadShortlisted
// ---------------------------------------------------------------------------

export function loadShortlisted() {
  if (!existsSync(SHORTLISTED_DIR)) {
    console.error(chalk.red('\nNo shortlisted papers. Run `node src/index.js discover` first.\n'));
    process.exit(1);
  }

  const files = readdirSync(SHORTLISTED_DIR).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.error(chalk.red('\nNo shortlisted papers. Run `node src/index.js discover` first.\n'));
    process.exit(1);
  }

  return files.map((f) => {
    try {
      return JSON.parse(readFileSync(join(SHORTLISTED_DIR, f), 'utf8'));
    } catch {
      console.error(chalk.yellow(`  [!] Could not parse ${f} — skipping.`));
      return null;
    }
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 2. fetchFullAbstract
// ---------------------------------------------------------------------------

export async function fetchFullAbstract(paper) {
  // Baseline fallback: use whatever the API already gave us.
  const fallback = {
    abstract:     (paper.abstract     ?? '').trim(),
    introduction: '',
    methodology:  '',
    conclusion:   (paper.tldr?.text   ?? '').trim(),
    rawAvailable: false,
  };

  const pdfUrl = paper.openAccessPdf?.url ?? paper.pdfUrl ?? null;
  if (!pdfUrl) return fallback;

  try {
    const buffer   = await downloadPdfBuffer(pdfUrl);
    const parsed   = await pdfParse(buffer, { max: 12 }); // first 12 pages is enough
    const sections = extractSections(parsed.text);

    // PDF extraction may miss the abstract (e.g., two-column layout on page 1).
    // Fall back to the API abstract for that section specifically.
    if (!sections.abstract) {
      sections.abstract = paper.abstract ?? '';
    }

    return { ...sections, rawAvailable: true };
  } catch {
    // PDF download timed out, was encrypted, or had no text layer — use fallback.
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 3. buildPaperContext
// ---------------------------------------------------------------------------

export async function buildPaperContext(paper) {
  const sections = await fetchFullAbstract(paper);

  return {
    paperId:       paper.paperId                             ?? null,
    title:         paper.title                              ?? '',
    year:          paper.year                               ?? null,
    authors:       (paper.authors ?? []).map((a) => a.name ?? String(a)),
    citationCount: paper.citationCount                      ?? 0,
    source:        paper.source                             ?? 'unknown',
    sections,
    rawAvailable:  sections.rawAvailable,
    pdfUrl:        paper.openAccessPdf?.url ?? paper.pdfUrl ?? null,
    scores:        paper.scoring?.scores                    ?? null,
  };
}

// ---------------------------------------------------------------------------
// 4. buildCorpusContext
// ---------------------------------------------------------------------------

export async function buildCorpusContext(papers) {
  const contexts = [];

  for (let i = 0; i < papers.length; i++) {
    const paper  = papers[i];
    const label  = (paper.title ?? 'untitled').slice(0, 55);
    process.stdout.write(
      `\r  [${i + 1}/${papers.length}] Building context for "${label}"...` + ' '.repeat(10)
    );

    contexts.push(await buildPaperContext(paper));
  }

  // Clear the progress line before the caller prints anything.
  process.stdout.write('\r' + ' '.repeat(process.stdout.columns ?? 80) + '\r');

  return contexts;
}

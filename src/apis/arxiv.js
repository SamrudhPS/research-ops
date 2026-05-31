import axios from 'axios';
import chalk from 'chalk';
import { XMLParser } from 'fast-xml-parser';

const BASE_URL = 'http://export.arxiv.org/api/query';

const client = axios.create({ timeout: 10_000 });

// isArray ensures these tags are always arrays even when the feed has one entry.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (tagName) => ['entry', 'author', 'link'].includes(tagName),
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractArxivId(idUrl) {
  // "http://arxiv.org/abs/2301.00001v2" → "2301.00001"
  return (idUrl ?? '').replace(/^.*\/abs\//, '').replace(/v\d+$/, '');
}

function normalize(entry) {
  const arxivId = extractArxivId(entry.id);

  // Prefer the explicit PDF link from the feed; fall back to the canonical URL pattern.
  const links = entry.link ?? [];
  const pdfLink = links.find((l) => l['@_type'] === 'application/pdf');
  const pdfUrl = pdfLink?.['@_href'] ?? `https://arxiv.org/pdf/${arxivId}`;

  const year = entry.published
    ? new Date(entry.published).getFullYear()
    : null;

  return {
    paperId:       `arxiv:${arxivId}`,
    title:         (entry.title   ?? '').trim().replace(/\s+/g, ' '),
    abstract:      (entry.summary ?? '').trim().replace(/\s+/g, ' '),
    year,
    authors:       (entry.author  ?? []).map((a) => ({ name: (a.name ?? '').trim() })),
    citationCount: 0,           // arXiv API does not expose citation counts
    source:        'arxiv',
    arxivId,
    pdfUrl,
    openAccessPdf: { url: pdfUrl },
    fieldsOfStudy: [],
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function searchArxiv(query, maxResults = 15) {
  console.log(chalk.cyan(`[API] fetching "${query}" from arXiv...`));

  const res = await client.get(BASE_URL, {
    params: {
      search_query: `all:${query}`,
      max_results:  maxResults,
      sortBy:       'submittedDate',
      sortOrder:    'descending',
    },
  });

  const parsed = parser.parse(res.data);
  const entries = parsed?.feed?.entry ?? [];

  return entries.map(normalize);
}

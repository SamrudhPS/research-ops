import axios from 'axios';
import chalk from 'chalk';

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(paper) {
  if (!paper) return null;
  return {
    paperId:       paper.paperId       ?? null,
    title:         (paper.title        ?? '').trim(),
    abstract:      (paper.abstract     ?? '').trim(),
    year:          paper.year          ?? null,
    authors:       (paper.authors      ?? []).map((a) => ({ name: a.name ?? '' })),
    citationCount: paper.citationCount ?? 0,
    source:        'semanticscholar',
    openAccessPdf: paper.openAccessPdf ?? null,
    fieldsOfStudy: paper.fieldsOfStudy ?? [],
  };
}

// Wraps every GET: enforces 1100ms pre-request delay, retries once on 429.
async function get(path, params = {}) {
  await sleep(1_100);
  try {
    const res = await client.get(path, { params });
    return res.data;
  } catch (err) {
    if (err.response?.status === 429) {
      console.log(chalk.yellow('[API] rate limited by SemanticScholar — retrying in 5s...'));
      await sleep(5_000);
      const res = await client.get(path, { params });
      return res.data;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export async function searchPapers(query, limit = 20) {
  console.log(chalk.cyan(`[API] fetching "${query}" from SemanticScholar...`));
  const data = await get('/paper/search', {
    query,
    limit,
    fields: 'paperId,title,abstract,year,authors,citationCount,externalIds,openAccessPdf,fieldsOfStudy',
  });
  return (data.data ?? []).map(normalize).filter(Boolean);
}

export async function getPaperDetails(paperId) {
  console.log(chalk.cyan(`[API] fetching paper "${paperId}" from SemanticScholar...`));
  const data = await get(`/paper/${paperId}`, {
    fields: 'paperId,title,abstract,year,authors,citationCount,references,citations,openAccessPdf,tldr,fieldsOfStudy',
  });
  return normalize(data);
}

// Returns papers that cite this paper (forward traversal).
// The citations endpoint wraps each result in { citingPaper: {...} }.
export async function getCitationGraph(paperId, limit = 10) {
  console.log(chalk.cyan(`[API] fetching citations for "${paperId}" from SemanticScholar...`));
  const data = await get(`/paper/${paperId}/citations`, {
    fields: 'paperId,title,abstract,year,citationCount',
    limit,
  });
  return (data.data ?? [])
    .map((c) => normalize(c.citingPaper))
    .filter(Boolean);
}

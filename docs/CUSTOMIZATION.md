# Customization

Research-Ops is designed to be adapted. The skill files control AI behavior, the source files control data flow, and `researcher.yml` controls personalization. None of these require touching each other.

---

## Changing skill files for a new domain

Skill files in `skills/` are the fastest way to adapt Research-Ops to a different field. They require no code changes.

### Step-by-step: adapting for a new domain

**Example:** Adapting Research-Ops from Machine Learning to Computational Biology.

**Step 1 — Edit `skills/discover.md`**

Add domain-specific guidance for paper search. Tell Claude which venues matter, which databases to prioritize, and what kinds of papers to deprioritize.

```markdown
# Domain context for Computational Biology

Prioritize papers from: Nature Methods, Bioinformatics, RECOMB, ISMB, PLoS Computational Biology.
Deprioritize: general ML papers unless they are applied to biological sequences or structures.
When evaluating dataset_access, note that genomics data on GEO and SRA is open access.
Wet-lab datasets (imaging, proteomics) often require institutional access — flag these explicitly.
```

**Step 2 — Edit `skills/gaps.md`**

Add domain-specific gap signals. Computational biology has different failure modes than ML.

```markdown
# Domain-specific gap signals for Computational Biology

Common methodology gaps:
- Methods validated only on model organisms (mouse, E. coli) but not applied to human data
- Benchmarks built on reference genomes but not tested on clinical variants

Common population gaps:
- Tools developed for protein folding but not validated on RNA structure prediction
- Variant calling methods tested on germline variants only, not somatic mutations
```

**Step 3 — Edit `skills/ideate.md`**

Replace the publication target guidance with domain-appropriate venues.

```markdown
# Publication targets for Computational Biology

beginner    → ISMB/ECCB Proceedings (poster), bioRxiv preprint
intermediate → Bioinformatics, Briefings in Bioinformatics, PLoS Computational Biology
advanced    → Nature Methods, Genome Research, Cell Systems
```

**Step 4 — Edit `skills/advisor.md`**

The advisor prompt is mostly domain-agnostic, but you can add field-specific rigor expectations.

```markdown
# Domain-specific rigor for Computational Biology

When evaluating evaluation plans:
- Require comparison against the current gold-standard tool (e.g., GATK for variant calling)
- Require benchmarking on at least one held-out species or dataset not used in training
- Cross-validation splits must account for phylogenetic bias (sequences from the same organism are not independent)
```

**Step 5 — Test with `npm run doctor`**

The doctor script verifies all skill files are present. No further configuration needed.

---

## Adding a new gap type

The gap taxonomy is defined in two places: `skills/gaps.md` (which instructs Claude) and `src/gaps.js` (which renders the output with colors).

### Step 1 — Add the type to `skills/gaps.md`

Define the new type with the same structure as existing types:

```markdown
### replication_gap
**Definition:** A widely-cited result has never been independently replicated.
Signal phrases: "to our knowledge, no independent replication", "results reported by original authors only"
**Evidence standard:** Must cite the original paper and note absence of independent replications.
**Feasibility note:** Replication studies are often underestimated — budget 30-50% more time than the original paper reports.
```

### Step 2 — Add a color to `src/gaps.js`

Find the `TYPE_COLOR` object near the top of the file and add an entry:

```js
const TYPE_COLOR = {
  methodology_gap:          chalk.blue,
  contradiction_gap:        chalk.red,
  population_gap:           chalk.yellow,
  technology_gap:           chalk.cyan,
  evaluation_gap:           chalk.magenta,
  coverage_gap:             chalk.white,
  performance_tradeoff_gap: chalk.green,
  replication_gap:          chalk.magenta,   // ← add this
};
```

### Step 3 — Add the abbreviation to `src/ideate.js`

Find the `TYPE_ABBR` object and add an entry for the gap table display:

```js
const TYPE_ABBR = {
  // ... existing entries ...
  replication_gap: 'replication  ',
};
```

No other changes needed. The gaps prompt will now instruct Claude to identify this type, and the display code will color it correctly.

---

## Adjusting scoring weights

Scores are computed in `src/scoring.js`. By default all six dimensions are weighted equally (arithmetic mean). To weight certain dimensions more heavily, edit the `scorePaper` function.

### Current implementation (equal weights)

```js
const dims = [skill_fit, tool_compatibility, scope_feasibility,
              dataset_access, novelty, reproducibility];
const weighted_score = dims.reduce((a, b) => a + b, 0) / dims.length;
```

### Example: weighting reproducibility more heavily

For a student whose goal is `replication`, reproducibility matters more than novelty:

```js
const weighted_score = (
  skill_fit         * 1.0 +
  tool_compatibility * 1.0 +
  scope_feasibility  * 1.0 +
  dataset_access     * 1.0 +
  novelty            * 0.5 +   // reduced weight
  reproducibility    * 2.0     // increased weight
) / 7.5;                       // sum of weights
```

### Example: weighting by goal

To weight dynamically based on `profile.goals.north_star`:

```js
const weights = {
  conference_paper: { novelty: 1.5, reproducibility: 1.0 },
  replication:      { novelty: 0.5, reproducibility: 2.0 },
  thesis_chapter:   { novelty: 1.5, scope_feasibility: 1.5 },
};

const w = weights[profile.goals.north_star] ?? {};
const weighted_score = (
  skill_fit          * 1.0 +
  tool_compatibility * 1.0 +
  scope_feasibility  * (w.scope_feasibility  ?? 1.0) +
  dataset_access     * 1.0 +
  novelty            * (w.novelty            ?? 1.0) +
  reproducibility    * (w.reproducibility    ?? 1.0)
) / (4 + (w.scope_feasibility ?? 1) + (w.novelty ?? 1) + (w.reproducibility ?? 1));
```

---

## Changing API sources

Research-Ops searches two sources by default: Semantic Scholar (`src/apis/semanticScholar.js`) and arXiv (`src/apis/arxiv.js`). Both follow the same interface, making it straightforward to add new sources.

### The paper object interface

Every API module must return an array of objects with these fields:

```js
{
  paperId:      string,   // unique identifier (used for deduplication)
  title:        string,
  abstract:     string,
  year:         number,
  authors:      [{ name: string }],
  citationCount: number,
  openAccessPdf: { url: string } | null,
  tldr:         { text: string } | null,
  source:       string,   // display name, e.g. 'pubmed'
}
```

### Adding a new source (example: PubMed)

**Step 1 — Create `src/apis/pubmed.js`**

```js
import axios from 'axios';

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export async function searchPubMed(query, limit = 10) {
  // 1. Get IDs
  const searchResp = await axios.get(`${BASE}/esearch.fcgi`, {
    params: { db: 'pubmed', term: query, retmax: limit, retmode: 'json' },
  });
  const ids = searchResp.data.esearchresult.idlist;
  if (ids.length === 0) return [];

  // 2. Fetch summaries
  const summaryResp = await axios.get(`${BASE}/esummary.fcgi`, {
    params: { db: 'pubmed', id: ids.join(','), retmode: 'json' },
  });
  const results = summaryResp.data.result;

  return ids.map((id) => {
    const r = results[id];
    return {
      paperId:       `pubmed-${id}`,
      title:         r.title ?? '',
      abstract:      '',               // requires a second efetch call
      year:          parseInt(r.pubdate?.slice(0, 4), 10) || null,
      authors:       (r.authors ?? []).map((a) => ({ name: a.name })),
      citationCount: 0,                // not available from esummary
      openAccessPdf: null,
      tldr:          null,
      source:        'pubmed',
    };
  });
}
```

**Step 2 — Import and call in `src/discover.js`**

```js
import { searchPubMed } from './apis/pubmed.js';

// Inside runDiscover(), add alongside the existing API calls:
const pubmedPromise = searchPubMed(queries[0], 15).catch((err) => {
  console.error(chalk.red(`  [!] PubMed failed: ${err.message}`));
  return [];
});

const [ssResults, arxivResults, pubmedResults] = await Promise.all([
  Promise.all(ssPromises),
  arxivPromise,
  pubmedPromise,
]);

// Then merge pubmedResults into the paperMap alongside the others.
for (const paper of [...ssResults.flat(), ...arxivResults, ...pubmedResults]) {
  if (paper.paperId && !paperMap.has(paper.paperId)) {
    paperMap.set(paper.paperId, paper);
  }
}
```

The deduplication and scoring pipeline handles the rest automatically.

---

## Translating to another language

Research-Ops output is in English, but you can localize the user-facing text by editing two layers:

### Layer 1 — Skill files (AI-generated content)

Add a language instruction to the top of each skill file in `skills/`:

```markdown
# Language instruction
All output must be in Portuguese (Brazil). Use Brazilian academic register.
Technical terms (e.g., "federated learning", "gradient descent") may remain in English
if they are commonly used as-is in Brazilian ML research.
```

This controls the language of all Claude-generated content: paper summaries, gap descriptions, research questions, advisor feedback.

### Layer 2 — Source code (hardcoded strings)

User-facing strings in `.js` files include:
- Prompt messages in `inquirer.prompt()` calls
- `console.log` and `console.error` calls with labels and instructions
- Column headers in CLI tables
- The help menu in `src/index.js`

These strings are scattered across `src/onboard.js`, `src/discover.js`, `src/gaps.js`, `src/ideate.js`, `src/advisor.js`, `src/tracker.js`, and `src/index.js`.

There is no i18n library currently. The practical approach for a full translation is to search for `console.log(` and `message:` across `src/` and replace the string values. A future refactor could extract these into a `src/i18n/en.js` module.

### Files that do NOT need translation

- `researcher.yml` — YAML keys must stay in English (they are field names, not user-facing labels)
- `tracker.tsv` — mode names (discover, gaps, etc.) are identifiers
- `data/*.json` — JSON keys are internal identifiers
- `scripts/doctor.js` — diagnostic output; English is appropriate for technical setup issues

# discover — Research Direction Discovery

Skill file for `/research-ops discover`. Loaded as Claude's context when that command runs.

---

## Purpose

Discovery mode takes a researcher's profile and returns a ranked list of papers and research directions they are realistically positioned to pursue **right now** — not eventually, not with a different setup, but with their current skills, compute, and weekly hours.

Use this mode when the student:
- Has just completed onboarding and wants to know where to start
- Has finished reading a topic and wants to find adjacent gaps
- Feels stuck on their current direction and wants to explore alternatives
- Has a vague interest area but no concrete research question yet

This mode is **not** a literature review. It casts a wide net across the frontier of the student's domain, surfaces promising signals, and asks the student to pick threads worth pulling. The deep reading happens in `litreview`.

---

## How Scoring Works

Every paper is scored on six dimensions, each 1–5. Here is what each dimension measures and what signals to look for in the abstract, title, and metadata.

---

### 1. skill_fit (weight: 25%)

**What it measures:** How closely the paper's methods, framing, and field align with the student's declared domain and sub-areas.

**Scoring guide:**
- **5** — The paper is squarely in the student's declared domain. The abstract uses the same vocabulary the student used in their profile. Example: student lists "computer vision" and the abstract discusses "object detection on benchmark datasets."
- **4** — The paper is in a directly adjacent sub-field. The student could read it without first learning an entirely new area.
- **3** — The paper touches the student's domain but its primary contribution is in a different field. Worth considering but not a direct match.
- **2** — The field is different but the methods might transfer. The student would need to bridge a conceptual gap.
- **1** — Unrelated to the student's domain. Only include this score if the paper somehow ended up in results due to a broad query.

**Signals to scan for:**
- Do the paper's `fieldsOfStudy` tags match the student's domain?
- Does the abstract use terms the student listed in `domain.primary` or `domain.sub_areas`?
- Is the problem framing one the student would immediately recognise?

---

### 2. tool_compatibility (weight: 15%)

**What it measures:** Whether the student can engage with this paper using tools they already know, or tools close enough to learn quickly.

**Scoring guide:**
- **5** — The paper explicitly uses tools in the student's stack. They can run the experiments without installing anything unfamiliar.
- **4** — One tool in the paper is new, but it's from the same ecosystem (e.g., student knows PyTorch, paper uses HuggingFace Transformers — same paradigm, learnable in days).
- **3** — The paper uses tools the student doesn't know but that are learnable given their background. A Python developer could learn JAX; a scikit-learn user could learn XGBoost.
- **2** — The paper relies on a specialised toolchain that requires significant setup time (e.g., custom CUDA kernels, proprietary simulation software).
- **1** — The paper requires tools that are inaccessible, proprietary, or require hardware the student doesn't have.

**Signals to scan for:**
- Framework names in the abstract: PyTorch, TensorFlow, JAX, HuggingFace, scikit-learn, OpenCV, spaCy
- Platform mentions: "we implement on top of", "available as a library", "using the X framework"
- Negative signals: "our custom simulator", "proprietary codebase", "requires X hardware"

---

### 3. scope_feasibility (weight: 20%)

**What it measures:** Whether the student can reproduce or extend this work given their compute access and weekly hours.

**Scoring guide:**
- **5** — The methodology is clearly reproducible on the student's hardware in their available time. The abstract mentions open-source code, a single GPU, or lightweight models.
- **4** — Feasible with some effort. Might require a smaller version of the experiment or a subset of the dataset, but the core idea is replicable.
- **3** — Possible but a stretch. The student would need to either reduce scale significantly or invest in setup time that eats into their research hours.
- **2** — The paper requires resources meaningfully beyond what the student has. They could study the paper but not reproduce it.
- **1** — Not feasible. TPUs, hundreds of GPUs, billion-parameter pretraining, proprietary compute infrastructure.

**Signals to scan for:**

Infeasibility signals (lower the score):
- "billion parameters", "trillion tokens", "1000 GPUs", "TPU pod", "web-scale", "large-scale pretraining"
- "proprietary infrastructure", "internal cluster", "distributed training across N nodes"

Feasibility signals (raise the score):
- "single GPU", "single machine", "lightweight", "efficient", "parameter-efficient"
- "we release code", "open source", "publicly available", "reproducible baseline"
- "few-shot", "zero-shot", "fine-tuning" (implies lower compute than training from scratch)
- "edge device", "mobile", "CPU inference"

**Apply the compute tier:** A student with `university_cluster` access can handle papers that would be infeasible on a laptop. A `cloud_credits` student can handle moderate multi-GPU work. Adjust scores accordingly — the same paper can be a 5 for one student and a 2 for another.

---

### 4. dataset_access (weight: 15%)

**What it measures:** Whether the student can actually get the data the paper uses.

**Scoring guide:**
- **5** — The paper uses a well-known open dataset the student can download today (ImageNet, CIFAR, MNIST, COCO, Wikipedia, Common Crawl, HuggingFace Hub datasets, Kaggle, UCI).
- **4** — The dataset is openly available but requires registration, a form, or a one-time agreement that is typically approved quickly.
- **3** — Dataset access is unclear from the abstract. Might be open, might not be.
- **2** — The dataset requires institutional access the student may not have, or it is Kaggle-specific and the student has `open_access_only` profile access.
- **1** — The dataset is proprietary, restricted, "available upon request", or collected specifically by the authors and not released.

**Signals to scan for:**

Open access signals (raise the score):
- Named open datasets: "ImageNet", "CIFAR-10", "MNIST", "COCO", "SQuAD", "GLUE", "Wikipedia", "Common Crawl", "LibriSpeech", "HuggingFace", "Kaggle"
- "publicly available dataset", "open benchmark", "standard benchmark"

Restricted signals (lower the score):
- "proprietary dataset", "not publicly available", "available upon request"
- "collected by the authors", "internal dataset", "under NDA", "licensed dataset"
- "we scraped", "we collected" (without a release statement)

---

### 5. novelty (weight: 15%)

**What it measures:** Whether this paper represents a current, open research direction rather than solved or stale ground.

**Scoring guide:**
- **5** — Published 1–2 years ago with moderate citations (10–200). This is the signal for "the community noticed it but hasn't saturated the area yet." The best territory for a student to enter.
- **4** — Published recently (0–1 years) with early citations, or 2–3 years old with strong but not overwhelming citations. Still active.
- **3** — Either too new to judge (published this year, 0 citations), or 3–4 years old with moderate citations (still relevant but the low-hanging fruit may be gone).
- **2** — Published 4–6 years ago with high citations. Influential but the field has likely moved on. Could be foundational context, not a gap to fill.
- **1** — Old (>6 years) or old with low citations (suggests the direction was explored and abandoned).

**The sweet spot for gap-finding:** Papers from 1–2 years ago with 10–100 citations. Recent enough that the space is not crowded, validated enough that the problem is real.

---

### 6. reproducibility (weight: 10%)

**What it measures:** Whether the student can actually reimplement or build on this work.

**Scoring guide:**
- **5** — Code is explicitly available (GitHub link, "code released", "open source"). The student can clone and run.
- **4** — No link but strong signals: "we will release", "our implementation is available", "open-source library". Likely accessible.
- **3** — Methodology is described clearly enough to reimplement. Pseudocode, detailed algorithm descriptions, or supplementary material present.
- **2** — Methods are described at a high level but would require significant inference to reimplement.
- **1** — Black box. Results are reported but the methodology, architecture, or training details are withheld. "Proprietary", "not released", "closed source."

**Signals to scan for:**
- Open signals: "github.com/", "code available at", "we release", "open source", "our code is publicly available"
- Partial signals: "pseudocode in appendix", "supplementary material", "detailed in Section X"
- Closed signals: "proprietary", "not released", "available upon request", "internal codebase"

---

## Query Generation Strategy

Search queries determine the quality of what gets retrieved. Follow these rules:

### Base rules (apply to all researchers)

1. **Always combine domain + sub-area as the primary query.** `"machine learning computer vision"` retrieves more targeted results than `"machine learning"` alone. The sub-area is the anchor.

2. **Use interest keywords as modifiers, not primary terms.** If the student's interests include "model compression", the query should be `"computer vision model compression"` not just `"model compression"` (which would retrieve papers from fields the student doesn't work in).

3. **Run 3–4 queries per session, not one.** The first query is domain + sub-area. The second is domain + first interest keyword. The third combines the top two interest keywords. The fourth is domain alone as a fallback. Merge and deduplicate results.

4. **Never use filler phrases as queries.** "good papers", "interesting research", "my area" — these produce noise. Queries should be noun phrases describing a technical domain or problem.

### For beginner researchers (`skills.level: "beginner"`)

Add `"survey"` or `"review"` as a modifier to at least one query:
- `"machine learning computer vision survey"`
- `"NLP transformer review"`

Surveys give beginners the broadest possible map of an area before they dive into primary research. They also score well on reproducibility (nothing to reproduce) and scope_feasibility (reading is always feasible). Prioritise them in results.

### For intermediate researchers (`skills.level: "intermediate"`)

Include queries for tutorial or replication papers as well as primary research. Balance surveys with recent primary papers from 1–2 years ago. The student can read primary papers but benefits from a few anchoring surveys.

### For advanced researchers (`skills.level: "advanced"`)

Avoid survey queries. Focus on:
- Recent papers (last 12 months) with low citation counts — these are the papers closest to open gaps
- Papers from top venues that end with "future work" sections
- Queries like `"domain sub-area challenges"` or `"domain sub-area limitations"`

The advanced researcher's goal is to find the frontier, not the map. Low-citation recent papers are the signal.

### Query length

Keep queries to 2–4 words. Long natural language queries perform poorly on Semantic Scholar and arXiv. `"efficient transformer inference"` outperforms `"how to make transformer models run faster on small devices"`.

---

## Fit Reason Writing Rules

The `fit_reason` field is a single sentence explaining why a paper received the grade it did, written specifically for this researcher. It is the most important piece of text in the output — it tells the student whether to read the paper or skip it.

### Rules

1. **Mention at least one specific tool or skill from the student's profile.** Generic text like "aligns with your interests" is useless. The student already knows their interests. Name the tool: "uses PyTorch", "uses scikit-learn on tabular data", "implemented in Python with NumPy."

2. **Mention feasibility relative to their compute and hours.** A laptop user needs to know if they can run this. Always close with a feasibility clause when the score is A or B: "reproducible on a laptop in your 12 hrs/week window", "feasible on university cluster compute", "requires GPU cluster — out of reach for laptop."

3. **One sentence, no filler.** Do not use: "seems relevant", "might be interesting", "could be useful", "worth exploring", "appears to", "it seems that." Every word must carry information.

4. **Reference a specific detail from the abstract when possible.** If the paper uses ImageNet, say ImageNet. If it cites a specific GPU count, mention it. Specificity is the difference between a useful signal and noise.

5. **Lead with the verdict, not the justification.** The grade already tells the student the verdict, so the fit_reason should immediately explain the key reason, not repeat the grade.

### Examples

**Bad** (too vague, no profile references):
> "This paper seems relevant to your interests in machine learning."

**Bad** (correct information, wrong order — justification before verdict):
> "Because the paper uses public datasets and the methods are standard, this is a strong fit for you."

**Good** (tool named, feasibility stated, specific):
> "Uses scikit-learn on a public UCI dataset — reproducible on a laptop in your 8 hrs/week window."

**Good** (compute constraint surfaced clearly):
> "PyTorch implementation on CIFAR-10, but requires 8 GPUs for full training — feasible on university cluster, not on laptop."

**Good** (explains low score with specifics):
> "Interesting direction but uses a proprietary medical imaging dataset and requires TPU access — not feasible given your open-access-only and laptop constraints."

**Good** (survey paper flagged explicitly for beginner):
> "Comprehensive survey of transformer architectures — no code needed, ideal starting point given your beginner level and 12 hrs/week."

---

## Output Format

The discovery table has seven columns:

| Column | Contents |
|---|---|
| `#` | Row number — the student enters this number to shortlist the paper |
| `Grade` | A / B / C / D / F — coloured green / cyan / yellow / white / dim |
| `Title` | Paper title truncated to 52 characters |
| `Year` | Publication year |
| `Score` | Weighted score to 2 decimal places (e.g. `3.75`) |
| `Source` | `semanticscholar` or `arxiv` |
| `PDF` | `Y` if an open-access PDF is available, `N` if not |

Below the table, the top 5 `fit_reason` strings are printed as a digest so the student can read the key signal for each top paper without looking up abstracts.

**Row colours convey grade at a glance.** A student scanning 20 results should immediately see the green A-grade papers without reading the Grade column.

---

## What To Do If No Papers Score Above C

If all results are grade C or below, do not present the table as-is without comment. Tell the student:

> "No papers scored above C for your current profile. This usually means one of three things:
> 1. Your `domain.sub_areas` is too narrow — the papers that exist in this area require compute or tools you don't have yet.
> 2. Your `goals.interests` keywords don't match how the field describes itself — try different terminology.
> 3. The papers retrieved are older foundational work, not recent gaps.
>
> **Suggested fixes:**
> - Open `researcher.yml` and add a broader sub-area (e.g., add `"deep learning"` alongside `"federated learning"`)
> - Run `node src/index.js discover "survey machine learning <your sub-area>"` to find orientation papers first
> - Check `skills.programming` and `skills.tools` — more entries improve tool_compatibility scores

If the student has `skills.level: beginner` and all results are C, this is expected. Recommend running discover with a `"survey"` query modifier to find accessible entry points rather than primary research papers.

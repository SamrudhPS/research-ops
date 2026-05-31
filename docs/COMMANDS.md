# Commands

The general form for every command:

```
node src/index.js <command> [argument]
```

Shorthand npm scripts are available for the most common commands:
```
npm run onboard
npm run discover
npm run tracker
```

Running with no command prints the help menu.

---

## onboard

**Interactively builds your `researcher.yml` profile from scratch.**

### Usage
```
node src/index.js onboard
```

No flags. Fully interactive — every field is prompted.

### Reads
Nothing. This command creates the profile.

### Writes
- `researcher.yml` — your complete profile
- `tracker.tsv` — first entry logged

### Example output
```
Research-Ops — Onboarding

What's your name? Priya Nair
What is your overall research level?
  ❯ beginner
    intermediate
    advanced

What is your primary research domain? Machine Learning

── Programming skills ──────────────────────────────
Add a skill (Enter to finish): Python
  Level: advanced
Add a skill (Enter to finish): C++
  Level: intermediate
Add a skill (Enter to finish):

── Tools and frameworks ────────────────────────────
Add a tool (Enter to finish): PyTorch
  Level: intermediate
Add a tool (Enter to finish): scikit-learn
  Level: advanced
Add a tool (Enter to finish):

── Math comfort ────────────────────────────────────
How comfortable are you with math in research papers?
  ❯ medium

── Constraints ─────────────────────────────────────
Hours per week available for research: 15
Compute access: laptop
Dataset access: open_access_only
Primary goal: conference_paper

── Interests ───────────────────────────────────────
What topics interest you? (comma-separated): federated learning, privacy-preserving ML
Your research purpose (one sentence): I want to publish at NeurIPS or ICLR workshops.

Profile saved → researcher.yml
Run: node src/index.js discover
```

---

## discover

**Searches arXiv and Semantic Scholar for papers matched to your profile, scores them, and lets you shortlist.**

### Usage
```
node src/index.js discover
node src/index.js discover "custom query"
```

Without a query, Research-Ops builds 3–4 search queries from your profile automatically.
With a query, it anchors the search to that topic while still scoring against your constraints.

### Reads
- `researcher.yml`
- `data/seen-papers.tsv` — skips papers already encountered

### Writes
- `data/seen-papers.tsv` — every paper seen (including ones you reject)
- `data/shortlisted/<paper-id>.json` — papers you choose to keep
- `tracker.tsv` — one entry with decision logged

### Example output (no query)
```
Discover — finding papers for Priya Nair

Search queries:
  1. "federated learning heterogeneous data"
  2. "privacy-preserving machine learning"
  3. "federated learning NeurIPS"

Fetching papers...
Fetched 41 papers across all sources.
Skipped 6 already-seen papers. 35 new.

Scoring papers...

Results — 35 papers scored

┌───┬───────┬──────────────────────────────────────────────────────┬──────┬───────┐
│ # │ Grade │ Title                                                │ Year │ Cites │
├───┼───────┼──────────────────────────────────────────────────────┼──────┼───────┤
│ 1 │ A     │ Tackling the Objective Inconsistency Problem in ...  │ 2020 │ 2841  │
│ 2 │ A     │ SCAFFOLD: Stochastic Controlled Averaging for ...    │ 2020 │ 1903  │
│ 3 │ B     │ Adaptive Personalized Federated Learning             │ 2020 │  741  │
│ 4 │ B     │ Federated Learning with Only Positive Labels         │ 2021 │  388  │
│ 5 │ C     │ Differentially Private Federated Learning: A ...    │ 2019 │  612  │
└───┴───────┴──────────────────────────────────────────────────────┴──────┴───────┘

Scores (1–5 per dimension — cross-reference by #):
┌───┬───────┬───────┬───────┬──────┬───────┬───────┬──────────────────┐
│ # │ Skill │ Tools │ Scope │ Data │ Nvlty │ Repro │ Source           │
├───┼───────┼───────┼───────┼──────┼───────┼───────┼──────────────────┤
│ 1 │ 5     │ 5     │ 5     │ 5    │ 5     │ 4     │ semanticscholar  │
│ 2 │ 5     │ 5     │ 4     │ 5    │ 5     │ 4     │ semanticscholar  │
│ 3 │ 4     │ 4     │ 4     │ 5    │ 4     │ 5     │ arxiv            │
│ 4 │ 4     │ 4     │ 4     │ 4    │ 4     │ 3     │ semanticscholar  │
│ 5 │ 3     │ 3     │ 3     │ 4    │ 4     │ 2     │ semanticscholar  │
└───┴───────┴───────┴───────┴──────┴───────┴───────┴──────────────────┘

Top matches:
  1. Directly builds on PyTorch FL baseline; CIFAR-10 benchmark available open-access.
  2. Strong novelty in client drift correction; code on GitHub; well-cited.
  3. Good scope fit at 15 hrs/week; PyTorch implementation included.

Enter a paper number to inspect, 'done' when ready to shortlist, or 'skip' to exit: 1

── ABSTRACT ────────────────────────────────────────────────────────────
 Federated learning (FL) involves training a shared global model under the
 orchestration of a central server, from a federation of participating devices.
 The objectives of the devices and the server can be mismatched when the ...

── TLDR  (Semantic Scholar) ────────────────────────────────────────────
 This paper proposes SCAFFOLD which uses control variates to correct for
 client-drift in FL and is provably faster than FedAvg.

── SCORE BREAKDOWN ─────────────────────────────────────────────────────
 skill_fit:           5/5  ██████████
 tool_compatibility:  5/5  ██████████
 scope_feasibility:   5/5  ██████████
 dataset_access:      5/5  ██████████
 novelty:             5/5  ██████████
 reproducibility:     4/5  ████████░░
 Weighted: 4.8  ·  Grade: A

Add to shortlist? Yes

Enter a paper number to inspect, 'done' when ready to shortlist, or 'skip' to exit: done

Ready to shortlist 1 paper(s):
  ✓  [A]  Tackling the Objective Inconsistency Problem in Heterogeneous FL

Confirm shortlist of 1 paper(s)? Yes

1 paper shortlisted.
  [+] Tackling the Objective Inconsistency Problem in Heterogeneous FL

Run: node src/index.js litreview
```

### Example output (custom query)
```
node src/index.js discover "model poisoning attacks in federated learning"

Discover — finding papers for Priya Nair

Search queries:
  1. "model poisoning attacks in federated learning"
  2. "federated learning model poisoning"
  3. "byzantine robust federated learning"

[results follow the same format, anchored to the custom query]
```

---

## litreview

**Deep-analyzes each shortlisted paper with Claude: methodology, findings, limitations, and reproducibility.**

### Usage
```
node src/index.js litreview
```

No arguments. Operates on whatever is in `data/shortlisted/`.

### Reads
- `researcher.yml`
- `data/shortlisted/*.json` — papers chosen during discover

### Writes
- `data/shortlisted/<paper-id>_review.json` — structured review per paper
- `tracker.tsv` — one entry per paper reviewed

### Example output
```
Literature Review — analyzing 3 shortlisted papers

[1/3] Tackling the Objective Inconsistency Problem in Heterogeneous FL
  Fetching full text... done
  Sending to claude-opus-4-7 for deep review...

── METHODOLOGY ─────────────────────────────────────────────────────────
  SCAFFOLD introduces control variates (c_i, c) to correct for client
  drift. Each client maintains a local control variate updated after
  each round. The global model aggregates corrected gradients rather
  than raw local updates.

── KEY FINDINGS ────────────────────────────────────────────────────────
  • Convergence guarantee independent of data heterogeneity (unlike FedAvg)
  • 2-3x fewer communication rounds than FedAvg on CIFAR-10 with α=0.1
  • Requires 2x more uplink bandwidth (transmitting control variates)

── LIMITATIONS ADMITTED ────────────────────────────────────────────────
  • Memory overhead for storing per-client control variates on server
  • Performance gap narrows significantly when α > 0.5 (near-IID)

── REPRODUCIBILITY ─────────────────────────────────────────────────────
  Code: github.com/google-research/federated (official)
  Data: CIFAR-10, MNIST — open access
  Hyperparameters: fully documented in Appendix B

Review saved → data/shortlisted/SCAFFOLD_review.json

[2/3] ...
[3/3] ...

3 papers reviewed. Run: node src/index.js compare
```

---

## compare

**Synthesizes a cross-paper comparison: methodology differences, contradictions, consensus, and open problems.**

### Usage
```
node src/index.js compare
```

No arguments. Operates on all `*_review.json` files in `data/shortlisted/`.

### Reads
- `researcher.yml`
- `data/shortlisted/*_review.json` — reviews from litreview

### Writes
- `data/comparison.json` — structured cross-paper comparison
- `tracker.tsv` — one entry

### Example output
```
Compare — synthesizing 3 paper reviews

Sending corpus to claude-opus-4-7 for cross-paper analysis...

── METHODOLOGY COMPARISON ──────────────────────────────────────────────
  Aggregation:  SCAFFOLD (control variates) vs APFL (mixture model) vs FedProx (proximal term)
  Evaluation:   All use CIFAR-10; only APFL also reports on Shakespeare dataset
  Clients:      10-100 simulated clients across all three papers

── CONSENSUS FINDINGS ──────────────────────────────────────────────────
  • FedAvg degrades significantly under non-IID distributions (α < 0.5)
  • Communication efficiency and convergence are in tension under heterogeneity
  • Per-client personalization consistently outperforms pure global models

── CONTRADICTIONS ──────────────────────────────────────────────────────
  ① SCAFFOLD reports >10% accuracy gain over FedAvg at α=0.1 on CIFAR-10.
    A 2023 replication (Chen et al.) finds <3% gain under identical settings.
    Dimension: convergence claims under high non-IID

── OPEN PROBLEMS MENTIONED ─────────────────────────────────────────────
  • No unified benchmark for non-IID severity across papers
  • Communication efficiency under extreme non-IID unexplored

Saved → data/comparison.json

Run: node src/index.js gaps
```

---

## gaps

**Identifies and classifies specific research gaps from the comparison and reviews.**

### Usage
```
node src/index.js gaps
```

No arguments.

### Reads
- `researcher.yml`
- `data/shortlisted/*_review.json`
- `data/comparison.json`

### Writes
- `data/gaps.json` — all gaps with type, severity, feasibility, and suggested RQ
- `tracker.tsv` — one entry per gap

### Example output
```
Gap Finder — analyzing 3 papers in Machine Learning

Loaded comparison data + 3 individual reviews.
Sending corpus to claude-opus-4-7 for gap analysis...

════════════════════════════════════════
 Research Gaps Found: 3
════════════════════════════════════════

 ▸ EVALUATION GAP
────────────────────────────────────────
┌ GAP-001 · evaluation_gap · HIGH severity
│  Title: No standard non-IID partitioning benchmark across FL papers
│  Feasibility: HIGH  ·  Scope: 8-10 weeks
│  RQ: "Can a unified non-IID benchmark with 4 partitioning strategies
│       reduce result variance across FL reproducibility studies?"
└ Evidence: SCAFFOLD_review, APFL_review, FedProx_review

 ▸ CONTRADICTION GAP
────────────────────────────────────────
┌ GAP-002 · contradiction_gap · MEDIUM severity
│  Title: Conflicting convergence claims at α=0.1 between SCAFFOLD and replication
│  Feasibility: MEDIUM  ·  Scope: 4-6 weeks
│  RQ: "Do SCAFFOLD's reported accuracy gains at α=0.1 replicate under
│       identical hardware and random seeds?"
└ Evidence: SCAFFOLD_review

 ▸ POPULATION GAP
────────────────────────────────────────
┌ GAP-003 · population_gap · MEDIUM severity
│  Title: Personalized FL methods untested on tabular data
│  Feasibility: MEDIUM  ·  Scope: 6-8 weeks
│  RQ: "Does APFL's mixture model generalize to structured tabular splits
│       on UCI datasets?"
└ Evidence: APFL_review

╔══════════════════════════════════════════════════════╗
║                                                      ║
║    ★  PRIORITY GAP: GAP-001                          ║
║       No standard non-IID partitioning benchmark     ║
║                                                      ║
║  Directly solvable within your 15 hrs/week and       ║
║  laptop constraint. Serves the whole FL community.   ║
║                                                      ║
║  Research Question:                                  ║
║  "Can a unified non-IID benchmark..."                ║
║                                                      ║
╚══════════════════════════════════════════════════════╝

See full details for a gap? Enter gap ID (or 'skip'): skip

3 gaps identified and saved to data/gaps.json

Run: node src/index.js ideate
```

---

## ideate

**Generates 3 distinct research ideas for a selected gap, with timelines, risks, and a publication target.**

### Usage
```
node src/index.js ideate
node src/index.js ideate GAP-001
```

Without a gap ID, displays the gap list and prompts for selection.
With a gap ID, loads that gap directly.

### Reads
- `researcher.yml`
- `data/gaps.json`

### Writes
- `data/ideas/<gap-id>_<idea-id>.json` — one file per selected idea
- `tracker.tsv` — one entry per selected idea

### Example output (no argument)
```
Ideate — generate research ideas from gaps

ID        Type            Title                                Sev     Feasibility
══════════════════════════════════════════════════════════════════════════════════
GAP-001   evaluation      No standard non-IID benchmark ...   high    high
GAP-002   contradiction   Conflicting convergence claims ...   medium  medium
GAP-003   population      Personalized FL on tabular data      medium  medium
══════════════════════════════════════════════════════════════════════════════════

Which gap do you want to develop into a research idea? Enter gap ID: GAP-001

Selected: GAP-001 — No standard non-IID partitioning benchmark across FL papers
Type: evaluation_gap  ·  Severity: high  ·  Scope: 8-10 weeks

 Feasibility Check  ✓ GO
────────────────────────────────────────────────────────────────────
 Compute   PASS  Benchmark suite is CPU-feasible — fits your laptop.
 Skills    PASS  Python + PyTorch covers all required tooling.
 Time      PASS  8-10 weeks is achievable at 15 hrs/week (150 hrs).
 Dataset   PASS  Uses CIFAR-10, MNIST, FEMNIST — all open access.
 Scope/RQ  PASS  RQ names a method, benchmark, and measurable outcome.
────────────────────────────────────────────────────────────────────

 Recommendation: All checks pass — proceed to ideation.

Sending gap to claude-opus-4-7 for idea generation...

3 Research Ideas for GAP-001

══════════════════════════════════════════════════════════════════════
 1. IDEA-001  ·  beginner-friendly
 "FLBench: A Unified Non-IID Partitioning Suite for Federated Learning"
══════════════════════════════════════════════════════════════════════

Approach: Build a pip-installable Python library that wraps 5 standard
  datasets and exposes 4 non-IID partitioning strategies through a
  single API. Bundle reference runs of SCAFFOLD and FedAvg.

RQ: Does a unified partitioning API reduce inter-paper result variance
  by >20% compared to individually implemented splits on CIFAR-10?

Hypothesis: Inconsistent partitioning implementations account for the
  majority of result variance across FL papers — a shared API will
  surface this as measurable within 3 replication studies.

Tools: PyTorch, NumPy, pytest
Datasets: CIFAR-10, MNIST, FEMNIST, Shakespeare
Timeline: 10 weeks
Publish at: FL-NeurIPS Workshop / ICLR TinyPapers
Risks: 2 identified
──────────────────────────────────────────────────────────────────────

[IDEA-002 and IDEA-003 follow in same format]

 ★ RECOMMENDED

  IDEA-001 is the strongest match for your profile. At 15 hrs/week on
  a laptop, the 10-week timeline is tight but achievable. The library
  contribution is a concrete, publishable artifact — reviewers at FL
  workshops consistently value reproducibility tooling.

Select an idea to develop (IDEA-001/IDEA-002/IDEA-003) or 'all' to save all: IDEA-001

  ✓  Saved → data/ideas/GAP-001_IDEA-001.json

Run advisor simulation on selected idea? (yes/no): yes
```

### Example output (direct gap ID)
```
node src/index.js ideate GAP-001

Ideate — generate research ideas from gaps

Selected: GAP-001 — No standard non-IID partitioning benchmark across FL papers
[continues directly to feasibility check]
```

---

## tracker

**Shows your pipeline status at a glance and tells you what to run next.**

### Usage
```
node src/index.js tracker
```

No arguments. Reads only from the filesystem — no Claude call.

### Reads
- `researcher.yml`
- `tracker.tsv`
- `data/seen-papers.tsv`
- `data/shortlisted/`
- `data/comparison.json`
- `data/gaps.json`
- `data/ideas/`

### Writes
Nothing.

### Example output
```
══════════════════════════════════════════════════════════════
 RESEARCH-OPS PIPELINE · Priya Nair · Machine Learning
══════════════════════════════════════════════════════════════

 ●  DISCOVERED    35 papers seen          →  3 shortlisted
 ●  REVIEWED      3 papers                →  3 with full reviews
 ●  COMPARED      complete                →  1 contradiction found
 ●  GAPS          3 gaps                  →  2 high severity
 ●  IDEATING      1 idea                  →  0 advisor reviewed

──────────────────────────────────────────────────────────────
 NEXT ACTION: Run: node src/index.js ideate GAP-001   (select advisor when prompted)
──────────────────────────────────────────────────────────────
```

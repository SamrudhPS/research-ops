# Research-Ops

<div align="center">
  <img src="assets/banner.png" alt="Research-Ops — Cuz nobody wants to read 500 papers" width="800"/>
</div>

<br/>

<p align="center">
> The gap between "I know ML" and "I have a research question" shouldn't take a semester.
</p>
<br>
Structured pipeline that turns your skill profile into a scored shortlist of research gaps - with evidence, feasibility ratings, and a concrete first question — in one afternoon.

![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)
![Built with Claude Code](https://img.shields.io/badge/built%20with-Claude%20Code-blueviolet.svg)
![Stars](https://img.shields.io/github/stars/SamrudhPS/research-ops?style=flat)

---

## The problem

You finished your ML course. You know PyTorch, you've read a few papers, and you want to publish something real. But you don't know where the gaps are, which papers actually matter, or whether the idea you've had for three weeks is already solved. So you read 40 papers, feel more lost than when you started, and eventually pick a project because your advisor suggested it at a meeting — not because you understood the landscape.

Research-Ops exists for the period between "I have skills" and "I have a research question."

---

## What Research-Ops does

A seven-step pipeline. Each step feeds the next. You make every decision; Research-Ops handles the search, scoring, and structured reasoning.

1. **Onboard** → builds your researcher profile: skills, tools, compute, hours, goals
2. **Discover** → searches arXiv and Semantic Scholar; scores papers A–F against your profile
3. **Litreview** → deep per-paper analysis via Claude; extracts methods, assumptions, limitations
4. **Compare** → cross-paper methodology comparison; finds contradictions and consensus
5. **Gaps** → classifies research gaps by type, severity, and feasibility for you specifically
6. **Ideate** → turns a selected gap into 3 concrete research ideas, scoped to your constraints
7. **Tracker** → shows where you are in the pipeline and what to run next

---

## What Research-Ops is NOT

Three things students get wrong before they even install it:

**"It'll just summarize papers for me."**
Wrong. Summarizers exist. This isn't one. Research-Ops reads papers 
to find what's broken, missing, or contradicted in them — 
not to save you the reading.

**"The gap it finds is definitely publishable."**
No. A gap is a starting point, not a guarantee. 
Research-Ops finds where the door is. 
You still have to walk through it and prove something.

**"I don't need to understand my domain."**
You do. Research-Ops is a force multiplier, not a foundation. 
If you put in a vague profile, you get vague gaps. 
Garbage in, garbage out — even with AI in the middle.

---

## Real output

`research-ops gaps` on a federated learning corpus. Researcher: grad-ms, university cluster, 15 hrs/week, goal: thesis chapter.

```
╔══════════════════════════════════════════════════════════════╗
║  RESEARCH-OPS  ·  Gap Analysis                              ║
╚══════════════════════════════════════════════════════════════╝

  Researcher   Aisha Patel (grad-ms)  ·  15 hrs/week  ·  thesis-chapter
  Corpus       6 papers  ·  topic: federated learning on non-IID data
  Gaps found   4  (1 high severity, 2 medium, 1 low)

──────────────────────────────────────────────────────────────

  GAP-001  ★ PRIORITY                          contradiction_gap
  ─────────────────────────────────────────────────────────────
  Two papers directly contradict each other on FedAvg vs momentum.

  Lin et al. (2023) report +4.2% accuracy with FedMomentum on
  CIFAR-10 (α=0.1). Zhao et al. (2023) find no significant gain
  under identical non-IID conditions (same α, same split seed).

  Evidence         papers #3, #5
  Severity         HIGH — affects every non-IID FL paper that
                   cites either result without resolving the conflict
  Feasibility      HIGH for you — PyTorch, university cluster,
                   reproducible in 6–8 weeks at 15 hrs/week

  Suggested RQ ─────────────────────────────────────────────────
  "Does replacing FedAvg with Top-K gradient sparsification
  (K=0.01) reduce communication overhead by >30% on non-IID
  CIFAR-10 (α=0.1) while keeping accuracy drop below 2% vs.
  the dense FedAvg baseline?"

──────────────────────────────────────────────────────────────

  GAP-002                                        population_gap
  All 6 papers benchmark on CIFAR-10 or MNIST only.
  No paper applies non-IID FL methods to text classification.
  Evidence: papers #1–6  ·  Severity: MEDIUM  ·  Feasibility: LOW
  (NLP skills not in your profile — flag for future work)

──────────────────────────────────────────────────────────────

  GAP-003                                        technology_gap
  ViT-B/16 (Dosovitskiy 2021) outperforms CNNs on comparable
  benchmarks. No corpus paper applies it to federated CV tasks.
  Evidence: papers #2, #4  ·  Severity: MEDIUM  ·  Feasibility: MEDIUM
  (ViT fine-tuning feasible; memory overhead needs profiling first)

──────────────────────────────────────────────────────────────

  GAP-004                                       evaluation_gap
  No paper reports wall-clock communication time — only round
  count. Round count is a proxy metric that doesn't reflect
  real-world network conditions.
  Evidence: papers #1, #3, #5  ·  Severity: LOW  ·  Feasibility: HIGH

──────────────────────────────────────────────────────────────

  Priority recommendation: GAP-001

  This contradiction gives you a natural evaluation target:
  reproduce both results, then test the proposed fix. A
  publishable result is achievable even if the hypothesis is
  wrong — resolving a peer-reviewed contradiction is a
  contribution either way. Your PyTorch + cluster stack covers
  everything needed. Bounded scope: 6–8 weeks to first result.

──────────────────────────────────────────────────────────────

  Which gap do you want to carry into ideation?
  ❯ 1  GAP-001  contradiction — FedAvg vs momentum  (PRIORITY)
    2  GAP-003  technology — ViT backbone absent
    3  GAP-004  evaluation — communication metric proxy
    4  GAP-002  population — no text classification (LOW feasibility)
    5  None — go back to litreview
```

---

## Quickstart

```bash
git clone https://github.com/SamrudhPS/research-ops.git
cd research-ops && npm install
cp config/researcher.example.yml config/researcher.yml
npm run doctor
node src/index.js onboard
```

`npm run doctor` checks your Node version, API key, and required directories. Fix anything it flags before continuing.

Install globally to use `research-ops` anywhere:

```bash
npm install -g .
research-ops onboard
```

---

## Commands

| Command | What it does | Output |
|---|---|---|
| `onboard` | Interactive wizard that builds your `researcher.yml` | `config/researcher.yml` |
| `discover [query]` | Searches arXiv + Semantic Scholar; scores papers A–F against your profile | `data/seen-papers.tsv`, `data/shortlisted/` |
| `litreview` | Deep per-paper analysis; extracts methods, assumptions, and limitations | `data/shortlisted/*_review.json` |
| `compare` | Side-by-side methodology comparison across shortlisted papers | `data/comparison.json` |
| `gaps` | Classifies research gaps by type, severity, and feasibility for you | `data/gaps.json` |
| `ideate [gap_id]` | Generates 3 research ideas for a selected gap, scoped to your constraints | `data/shortlisted/<idea>.md` |
| `tracker` | Shows your pipeline state and suggests the next command | terminal |

---

## How it works

Research-Ops uses Claude as its agentic backbone. Each command loads a single isolated skill file — Claude's complete context and operating rules for that specific task — so the model stays focused and every output is grounded in the same rubric.

Full architecture, pipeline diagram, and skill file format: [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md)

---

## The gap taxonomy

Every gap is classified into one of seven types. The type determines how the gap is validated and what kind of research question it suggests.

| Type | A gap exists when… |
|---|---|
| **Contradiction** | Two papers reach opposing conclusions on the same claim under comparable conditions |
| **Methodology** | Existing methods are brittle, make restrictive assumptions, or fail to generalize |
| **Technology** | A specific tool or model exists but has never been applied to this task |
| **Population** | A problem is solved for one group (language, domain, sensor) but not another |
| **Evaluation** | The field is missing a standard benchmark, or existing metrics don't capture what matters |
| **Coverage** | An area simply hasn't been studied — no flaws in existing work, just absence |
| **Performance tradeoff** | A known solution sacrifices something important that no paper has quantified |

Contradiction gaps are prioritized when feasibility is equal — resolving a direct contradiction produces a publishable result whether the hypothesis holds or not.

---

## Paper scoring rubric

Every paper is scored on six dimensions, each 1–5. The breakdown is always shown — you can see exactly which dimensions drove the grade.

| Dimension | What it measures |
|---|---|
| `skill_fit` | How well the paper's methods match your existing skills |
| `tool_compatibility` | Whether the frameworks match your stack |
| `scope_feasibility` | Whether the work is achievable in your time and compute budget |
| `dataset_access` | Whether required data is freely accessible |
| `novelty` | How much new ground the work genuinely opens |
| `reproducibility` | Whether the work can be replicated and extended |

**Grades:** A (4.5–5.0) · B (3.5–4.4) · C (2.5–3.4) · D (1.5–2.4) · F (below 1.5)

---

## Data privacy

Research-Ops is a local tool. Your researcher profile, shortlisted papers, gap reports, and research ideas are stored only on your machine. The contents of those files are sent to Anthropic's API when you run a command — they are not stored by Research-Ops on any server, and are subject to [Anthropic's privacy policy](https://www.anthropic.com/privacy).

---

## Who this is for

Engineering students who know their tools but don't know what to research next.

**Works best for:** ML, CV, NLP, Systems, Robotics, HCI — fields with active arXiv presence and open-access papers.

**Works less well for:** Pure theory, humanities, fields where the literature lives behind paywalls or outside arXiv.

**Calibrated for:**
- Undergrads looking for their first research project
- Master's students searching for a thesis direction
- PhD students exploring problems adjacent to their dissertation
- Self-directed learners who want to contribute to a technical field

Research-Ops recommends. You decide. Every command ends at a decision point — the tool never auto-advances the pipeline on your behalf.

---

## Built on

- [Claude](https://anthropic.com) — agentic reasoning, paper analysis, gap classification
- [Semantic Scholar API](https://www.semanticscholar.org/product/api) — paper search and metadata
- [arXiv API](https://arxiv.org/help/api) — preprint search
- [Papers With Code](https://paperswithcode.com) — method and dataset cross-reference
- Inspired by [santifer's career-ops](https://github.com/santifer-dev/career-ops)



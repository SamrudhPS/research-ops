# How It Works

---

## The pipeline

Research-Ops is a linear pipeline. Each stage produces structured output that the next stage consumes. You can stop and restart at any stage — everything is saved to disk.

```
researcher.yml
     │
     ▼
 [DISCOVER] ──────────────────────► data/seen-papers.tsv
     │                               data/shortlisted/*.json
     ▼
 [LITREVIEW] ─────────────────────► data/shortlisted/*_review.json
     │
     ▼
 [COMPARE] ───────────────────────► data/comparison.json
     │
     ▼
 [GAPS] ──────────────────────────► data/gaps.json
     │
     ▼
 [IDEATE] ────────────────────────► data/ideas/*.json
     │                               data/ideas/*_advisor.json
     ▼
 Your research proposal
```

**tracker** can be run at any point. It reads the filesystem and tells you exactly where you are.

---

## How skill files work

Every command loads a corresponding Markdown file from `skills/` before calling Claude:

| Command | Skill file |
|---|---|
| discover | skills/discover.md |
| litreview | skills/litreview.md |
| compare | skills/advisor.md |
| gaps | skills/gaps.md |
| ideate | skills/ideate.md |
| advisor | skills/advisor.md |

These files are plain Markdown. They define how Claude behaves in that mode — what to prioritize, what rules to follow, what format to return. Editing a skill file changes how the mode works without touching source code.

This design means the AI's behavior is version-controlled, reviewable, and forkable. If you want Research-Ops to behave differently in a specific domain, you edit the skill file for that domain.

When a skill file is missing, the source code falls back to a hardcoded system prompt embedded in the `.js` file. The fallback exists so the CLI never crashes, but the skill file version is always more detailed and produces better results.

---

## The HITL philosophy

HITL stands for Human-in-the-Loop. It is the single most important design decision in Research-Ops.

**Claude evaluates and recommends. You decide and act.**

In practice:

- Every mode ends at a decision point where you choose what carries forward
- Claude never auto-selects a direction, paper, gap, or idea on your behalf
- Scores and rankings are recommendations, not verdicts — you can always override
- When you override, Research-Ops logs the override and continues without argument

**Why this matters:** Research direction is a high-stakes personal decision. It depends on your advisor's preferences, your lab's ongoing projects, your career goals, and your genuine curiosity — none of which Claude can fully observe. Claude provides structured information. You provide judgment.

A student who blindly follows an AI's research direction is not doing research. A student who uses AI to surface options and then decides for themselves is.

---

## The gap taxonomy

Every gap identified in the `gaps` command is classified as one of seven types. The type determines how you should approach addressing it.

### Methodology
**Definition:** Existing methods are limited, brittle, or fail to generalize.

Signal phrases: "only tested on X", "requires Y assumption", "breaks under Z condition"

**Example:** A federated learning aggregation method that works under IID data distribution but degrades significantly when client data is non-IID.

**How to address it:** Propose a method that relaxes the limiting assumption and show empirically that it works where the original fails.

---

### Contradiction
**Definition:** Two or more papers reach conflicting conclusions on the same claim.

Signal phrases: "Paper A reports improvement; Paper B finds no effect"

**Example:** One paper claims SCAFFOLD converges 3× faster than FedAvg at α=0.1; a replication study finds no statistically significant difference under the same conditions.

**How to address it:** Run a controlled replication experiment. Control every variable, report results transparently, and explain the source of the discrepancy.

---

### Population
**Definition:** A problem is solved for one setting but not transferred to another.

Signal phrases: "only evaluated on English", "only tested on image datasets", "only for adult subjects"

**Example:** Personalized federated learning methods are validated exclusively on image classification benchmarks. No paper evaluates them on tabular data.

**How to address it:** Apply the existing method to the new population or modality. Identify what changes (if anything) are required for it to transfer.

---

### Technology
**Definition:** A theoretical result exists but no practical, accessible implementation does.

Signal phrases: "no open-source code", "requires proprietary hardware", "inaccessible to most labs"

**Example:** A communication-efficient FL protocol is described in a paper but has no public implementation. Every subsequent paper that cites it reimplements it differently.

**How to address it:** Build the reference implementation. Document it thoroughly. Benchmark it against the paper's reported results.

---

### Evaluation
**Definition:** The field lacks a reliable, shared way to measure what actually matters.

Signal phrases: "no standard benchmark", "existing metrics don't capture X", "results not comparable across papers"

**Example:** Every federated learning paper implements non-IID data splits differently, making cross-paper comparisons meaningless.

**How to address it:** Propose a benchmark. Define the evaluation protocol precisely. Run at least three existing methods under the new protocol to demonstrate its value.

---

### Coverage
**Definition:** An area simply has not been studied yet — absence of work, not flaws in existing work.

Signal phrases: "no work applies X to Y", "to our knowledge, no prior work"

**Example:** Large language model fine-tuning is well studied in centralized settings. No paper has studied it in a federated setting with heterogeneous client data.

**How to address it:** Establish the baseline. This is often a "first paper on X" contribution — the bar is to show the problem is real, define the setup, and report initial results.

---

### Performance Tradeoff
**Definition:** A method improves on one dimension but degrades on another, and no work addresses the tradeoff explicitly.

Signal phrases: "accuracy-efficiency tradeoff", "improves X at the cost of Y"

**Example:** Gradient compression reduces communication cost but consistently degrades convergence under non-IID conditions. No paper proposes a method that handles both.

**How to address it:** Characterize the tradeoff empirically. Then propose a method that achieves a Pareto improvement — better on both dimensions, or a controllable tradeoff.

---

## The scoring rubric

Every paper and research direction is scored on six dimensions, each rated 1–5. Scores are arithmetic mean; grades follow fixed thresholds.

### skill_fit
Does the paper's core method require skills you already have?

| Score | Meaning |
|---|---|
| 5 | Directly uses skills you listed in your profile |
| 3 | Requires one skill you'd need to learn first |
| 1 | Requires expertise significantly above your current level |

### tool_compatibility
Do the paper's tools and frameworks match your stack?

| Score | Meaning |
|---|---|
| 5 | Uses tools you already have installed and practiced |
| 3 | Requires a tool in the same ecosystem (learnable in <1 week) |
| 1 | Uses proprietary, platform-specific, or unavailable tools |

### scope_feasibility
Can this be done in your available time on your hardware?

| Score | Meaning |
|---|---|
| 5 | Achievable within your timeline on your current hardware |
| 3 | Requires scope reduction or a learning phase |
| 1 | Requires 6+ months or hardware you don't have access to |

### dataset_access
Can you get the data without friction?

| Score | Meaning |
|---|---|
| 5 | Open, free, ready to download (HuggingFace, UCI, Kaggle) |
| 3 | Publicly available but requires registration or agreement |
| 1 | Proprietary, application-gated, or must be collected from scratch |

### novelty
How much new ground does this open?

| Score | Meaning |
|---|---|
| 5 | Opens a genuinely new territory or reframes an existing problem |
| 3 | Meaningful extension of prior work with a specific new contribution |
| 1 | Incremental variation on a well-solved problem |

### reproducibility
Can you replicate and build on this work?

| Score | Meaning |
|---|---|
| 5 | Full open-source code, clean data, detailed paper, active community |
| 3 | Paper is detailed; code exists but is incomplete or undocumented |
| 1 | No code, vague methodology, key details omitted |

### Grade thresholds

| Grade | Score | Interpretation |
|---|---|---|
| **A** | 4.5 – 5.0 | Pursue immediately — strong fit on all dimensions |
| **B** | 3.5 – 4.4 | Strong candidate — minor gaps worth addressing |
| **C** | 2.5 – 3.4 | Viable with preparation — specific barriers identified |
| **D** | 1.5 – 2.4 | Significant barriers — only if highly motivated |
| **F** | below 1.5 | Not viable given current profile |

---

## Data flow

Here is every file that gets created, what creates it, and what reads it next.

```
researcher.yml
  Created by: onboard
  Read by:    discover, litreview, compare, gaps, ideate, tracker

data/seen-papers.tsv
  Created by: discover (first run)
  Appended by: discover (every subsequent run)
  Read by:    discover (deduplication), tracker

data/shortlisted/<paper-id>.json
  Created by: discover
  Read by:    litreview, compare, tracker

data/shortlisted/<paper-id>_review.json
  Created by: litreview
  Read by:    compare, gaps, tracker

data/comparison.json
  Created by: compare
  Read by:    gaps, tracker

data/gaps.json
  Created by: gaps
  Read by:    ideate, tracker

data/ideas/<gap-id>_<idea-id>.json
  Created by: ideate
  Updated by: advisor (if student confirms revised RQ)
  Read by:    tracker

data/ideas/<gap-id>_<idea-id>_advisor.json
  Created by: advisor (called from ideate)
  Read by:    tracker

tracker.tsv
  Appended by: every command that completes a stage
  Read by:    tracker
```

All files are plain JSON or TSV — you can open them in any editor, diff them in git, and share them with collaborators.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is Research-Ops

Research-Ops is a CLI tool for engineering students who know their skills but don't know what to research next. It bridges the gap between "I know Python, ML, and some CV" and "here are 3 concrete, feasible research problems I can realistically start this semester."

**Target users:**
- Undergraduates looking for their first research experience
- Master's students searching for a thesis direction
- PhD students exploring problems adjacent to their dissertation
- Self-directed learners wanting to contribute meaningfully to a technical field

**The pipeline:** Onboard → Discover directions → Literature review → Identify gaps → Ideate solutions → Compare options → Track decisions

**Philosophy:** Research-Ops is a structured thinking aid, not an autonomous agent. It surfaces options, scores them, and forces tradeoff articulation — but the student makes every final decision. See the HITL rule below.

---

## System Architecture

```
researcher.yml          ← single source of truth: identity, skills, interests, constraints
skills/                 ← one Markdown context file per mode — loaded when that command runs
  onboard.md
  discover.md
  litreview.md
  gaps.md
  ideate.md
  advisor.md            ← used by the `compare` command
  tracker.md
data/
  seen-papers.tsv       ← append-only dedup log: every paper seen across all sessions
  shortlisted/          ← papers and concept notes the student has chosen to keep
tracker.tsv             ← append-only log of every pipeline run and decision made
src/
  index.js              ← CLI entry point (commander-based, ESM)
  utils/profile.js      ← read/write researcher.yml via js-yaml
```

**Execution model:** Each `research-ops <command>` loads the corresponding `skills/<command>.md` as context for the Claude Code session. The session reads `researcher.yml` for personalization, may query external APIs (via axios), and writes structured results to `tracker.tsv` and `data/`. All interactive prompts use `inquirer`; all tables use `cli-table3`; all terminal color uses `chalk`.

---

## Slash Commands

### `/research-ops onboard`
**Purpose:** First-time setup wizard. Interactively builds `researcher.yml` from scratch.

Workflow:
1. Ask for researcher identity (name, level, institution, field)
2. Walk through each skills subsection (programming, math, domain, tools) with proficiency prompts
3. Capture interests: primary focus areas, secondary areas, explicit avoid list
4. Capture constraints: time per week, compute access, goal, timeline in weeks
5. Capture context: current project, past projects, advisor name, target venues
6. Write the completed `researcher.yml`
7. Echo the profile back and ask: "Does this look right? Want to change anything?"

Skill file: `skills/onboard.md`

---

### `/research-ops discover`
**Purpose:** Takes the completed profile and returns a shortlist of research directions the student is positioned to pursue.

Workflow:
1. Read `researcher.yml` — fail clearly if missing or incomplete
2. Cluster skills into 2-3 coherent groups (e.g., "PyTorch + CV + Python/advanced")
3. Search the frontier of each cluster for open problems (surveys, workshop proceedings, GitHub issues)
4. Filter by hard constraints: `interests.avoid`, `constraints.compute`, `constraints.time_per_week`
5. Score each direction using the paper scoring rubric (adapted for directions, not just papers)
6. Present top 5 with per-dimension scores and a one-sentence rationale
7. **Student selects** which directions to explore → log to `tracker.tsv`

Skill file: `skills/discover.md`

---

### `/research-ops litreview`
**Purpose:** Given a direction (from discover or manually specified), systematically find and annotate the most relevant papers.

Workflow:
1. Accept a topic as argument or prompt for one
2. Build 4-6 targeted queries from the topic + researcher skill profile
3. Search arXiv, Semantic Scholar, relevant venue proceedings
4. Check `data/seen-papers.tsv` — skip papers already logged
5. Score each new paper on all six rubric dimensions
6. Present annotated results grouped by grade (A first, then B, C, etc.)
7. **Student selects** papers to shortlist → written to `data/shortlisted/`
8. All seen papers (including rejected ones) appended to `data/seen-papers.tsv`

Skill file: `skills/litreview.md`

---

### `/research-ops compare`
**Purpose:** Advisor-style side-by-side comparison of 2-4 research directions, papers, or gap ideas. Forces explicit tradeoff articulation before committing.

Workflow:
1. Accept 2-4 items to compare (directions, papers, or gap ideas — from prior outputs or manually specified)
2. Score each item across all six rubric dimensions
3. Render a side-by-side table with `cli-table3`
4. Identify the **key differentiating dimension**: the axis that separates them most
5. Ask the student: "What matters most to you right now?" — reweight and re-rank based on answer
6. State tradeoffs explicitly before presenting the recommendation
7. **Student decides** → decision and rationale logged to `tracker.tsv`

Skill file: `skills/advisor.md`

---

### `/research-ops gaps`
**Purpose:** Given a topic and its shortlisted literature, identify and classify specific research gaps.

Workflow:
1. Read papers from `data/shortlisted/` for the relevant topic (or accept paper list manually)
2. For each gap found: classify using the gap taxonomy, gather evidence from shortlisted papers
3. Assess each gap: Is it real? Has recent work closed it? Is it feasible given the researcher's constraints?
4. Present gaps organized by taxonomy type with a feasibility rating per gap
5. **Student selects** which gaps to carry into ideation → log to `tracker.tsv`

Skill file: `skills/gaps.md`

---

### `/research-ops ideate`
**Purpose:** Takes a selected gap and generates concrete, specific research ideas — specific enough to become a project proposal.

Workflow:
1. Accept a gap description (from gaps output or manually entered)
2. Generate 3-5 distinct approaches for addressing the gap
3. For each idea: describe the method, diff required vs. current skills, estimate timeline in weeks, name the single biggest risk
4. Score each idea on the full rubric
5. **Student selects** one idea to develop further
6. Write a one-page research concept note → saved to `data/shortlisted/<idea-slug>.md`

Skill file: `skills/ideate.md`

---

### `/research-ops tracker`
**Purpose:** Review and manage the pipeline. Shows what has been run, what decisions were made, and what comes next.

Workflow:
1. Read `tracker.tsv`
2. Render a summary table: timestamp | mode | query | decision | status
3. Infer where the student currently is in the pipeline
4. Suggest the logical next command based on current state
5. Allow the student to mark items as stale, re-run a stage, or export a summary

Skill file: `skills/tracker.md`

---

## researcher.yml — Field Reference

```yaml
version: "1.0"

researcher:
  name:           # Used in output headers and concept note filenames
  email:          # Optional — for future notification hooks
  level:          # undergrad | grad-ms | grad-phd | postdoc
                  # Calibrates difficulty and framing of all recommendations
  institution:    # Optional — used in context, not for filtering
  field:          # Primary field (e.g., "Computer Science", "Electrical Engineering")

skills:
  programming:    # Languages and scripting
    - name:       # e.g., "Python", "C++", "Julia"
      level:      # beginner | intermediate | advanced | expert
  math:           # Mathematical foundations
    - name:       # e.g., "Linear Algebra", "Probability Theory", "Optimization"
      level:
  domain:         # Domain knowledge areas
    - name:       # e.g., "Computer Vision", "NLP", "Control Systems"
      level:
  tools:          # Frameworks, platforms, infrastructure
    - name:       # e.g., "PyTorch", "ROS", "LLVM", "Kubernetes"
      level:

interests:
  primary:        # List, 1-2 items. Core focus for discover and litreview.
  secondary:      # List. Adjacent areas open to exploration.
  avoid:          # List. HARD FILTER — never appears in any mode output.

constraints:
  time_per_week:   # Integer, hours. Gates feasibility of all recommendations.
  compute:         # laptop | gpu-workstation | cloud-credits | hpc
                   # Hard filter: problems requiring more are excluded or flagged.
  goal:            # first-paper | thesis-topic | internship-project | side-project
                   # Shapes scope and framing of all outputs.
  timeline_weeks:  # Integer. Weeks until a result is needed.

context:
  current_project: # One-liner — modes avoid suggesting overlapping work
  past_projects:   # List of one-liners — surfaces adjacent angles
  advisor:         # Name or role — compare mode uses advisor framing if set
  target_venues:   # List, e.g., ["NeurIPS", "CVPR"] — calibrates novelty bar
```

**Skill proficiency levels:**
| Level | Meaning |
|---|---|
| `beginner` | Aware of the concept; limited hands-on practice |
| `intermediate` | Can use independently on structured problems |
| `advanced` | Can design solutions and debug non-obvious issues |
| `expert` | Can extend, critique, or teach the tool/concept |

---

## Human-in-the-Loop (HITL) Rule

**Claude evaluates and recommends. The student decides and acts.**

In practice this means:
- Every mode ends at a decision point where the student chooses what carries forward
- Claude never auto-selects a direction, paper, gap, or idea on behalf of the student
- Scores and rankings are recommendations, not verdicts — the student can always override
- When presenting options, Claude must state the tradeoffs explicitly, not just the scores
- Overrides are valid decisions; Claude logs them and continues without arguing

**Why this rule exists:** Research direction is a high-stakes, personal decision that depends on factors Claude cannot fully observe — advisor preferences, lab politics, personal motivation, career trajectory. Claude provides structured information; the student provides judgment.

---

## Gap Taxonomy

Every gap identified in `/gaps` mode must be classified as one of these six types:

| Type | Definition | Signal phrases |
|---|---|---|
| **Methodology** | Existing methods are limited, brittle, or don't generalize | "only tested on X", "requires Y assumption", "breaks under Z condition" |
| **Contradiction** | Two or more papers reach conflicting conclusions on the same claim | "Paper A reports improvement; Paper B finds no effect" |
| **Population** | A problem is solved for one group but not transferred to another | "only evaluated on English", "only tested on adult subjects", "only for RGB images" |
| **Technology** | A theoretical result exists but no practical, accessible implementation does | "no open-source code", "requires hardware inaccessible to most labs" |
| **Evaluation** | The field lacks a reliable way to measure what actually matters | "no standard benchmark", "existing metrics don't capture X property" |
| **Coverage** | An area simply hasn't been studied yet — absence of work, not flaws in existing work | "no work applies X to Y context" |

For each gap, the mode must record:
1. **Type** (from above)
2. **Evidence** — which shortlisted papers reveal it
3. **Feasibility** — given the researcher's specific constraints, can they address it?
4. **Status** — is the gap still open, or has recent work (past 6 months) closed it?

---

## Paper Scoring Rubric

All papers and directions scored in any mode use these six dimensions, each rated 1–5.

| Dimension | What it measures | Score 1 | Score 5 |
|---|---|---|---|
| **skill_fit** | How well the paper's methods match the researcher's existing skills | Requires skills far above current level | Directly uses skills already in their profile |
| **tool_compatibility** | Whether tools and frameworks match the researcher's stack | Uses incompatible, proprietary, or unavailable tools | Uses tools already installed and practiced |
| **scope_feasibility** | Whether the work is achievable in the researcher's time and compute budget | Requires 6+ months or HPC-level compute | Achievable within their timeline on their current hardware |
| **dataset_access** | Whether required data is accessible without friction | Proprietary, application-gated, or must be collected from scratch | Open, free, ready to download and use |
| **novelty** | How much new ground the work or direction genuinely opens | Incremental variation on well-solved problems | Opens a genuinely new territory or reframes an existing one |
| **reproducibility** | Whether the work can be replicated and extended | No code, no data, vague methodology | Full open-source code, clean data, detailed paper, active community |

**Overall score:** arithmetic mean of the six dimension scores.

**Grade thresholds:**
| Grade | Score range | Interpretation |
|---|---|---|
| **A** | 4.5 – 5.0 | Pursue immediately — strong fit on all dimensions |
| **B** | 3.5 – 4.4 | Strong candidate — minor gaps worth addressing |
| **C** | 2.5 – 3.4 | Viable with preparation — specific barriers identified |
| **D** | 1.5 – 2.4 | Significant barriers — only if highly motivated |
| **F** | below 1.5 | Not viable given current profile |

**Presentation rule:** Always show the per-dimension breakdown alongside the aggregate score and grade. The student must be able to see *which* dimensions drove the score — not just the number.

---

## Skills Folder

`skills/` contains one Markdown file per operational mode. When a `research-ops <command>` runs, the corresponding skill file is loaded as context for that Claude Code session. Each file encodes:
- The step-by-step workflow for that mode
- The expected input and output format
- Where decision points occur (what the student is asked to choose)
- What gets written to `tracker.tsv`, `data/seen-papers.tsv`, or `data/shortlisted/`

The skill files are the operational memory of Research-Ops. Editing a skill file changes how that mode behaves — they are the right place to iterate on workflows without touching source code.

---

## Non-Negotiable Rules

- **Never fabricate paper titles, authors, DOIs, or venue names.** If a paper cannot be confirmed via search, append `[unverified]`.
- **`interests.avoid` is a hard filter.** No topic from that list appears in any output, ever.
- **Constraints gate feasibility.** A direction requiring more compute or time than `constraints` specifies is excluded or explicitly flagged as out-of-reach — never silently included.
- **HITL is not optional.** Every mode must pause for a student decision before writing output to shortlisted or tracker. Claude does not auto-advance the pipeline.

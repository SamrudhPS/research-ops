# Case Study: One Weekend, One Research Proposal

## How Priya went from "I know Python and ML basics" to a federated learning research proposal

---

Priya Nair is a second-year Master's student at IIT Bombay. She knows Python well. She has used PyTorch for course projects. She has read maybe a dozen papers — carefully, but slowly. She has 15 hours a week and a laptop.

She has no research mentor yet. Her advisor is notionally assigned but hard to reach. She knows she wants to work on something in distributed machine learning, but "distributed ML" is a vast field and she doesn't know where the actual open problems are, versus the already-solved ones that look open if you haven't read enough.

On a Friday evening she runs:

```
node src/index.js onboard
```

---

## Friday evening — Onboard

```
Research-Ops — Onboarding

What's your name? Priya Nair
Research level? intermediate
Primary domain? Machine Learning
Sub-areas (comma-separated)? federated learning, distributed training

── Programming skills ──────────────────────────────
Add a skill: Python          Level: advanced
Add a skill: C++             Level: intermediate
Add a skill:

── Tools ───────────────────────────────────────────
Add a tool: PyTorch          Level: intermediate
Add a tool: scikit-learn     Level: advanced
Add a tool: NumPy            Level: advanced
Add a tool:

── Math comfort: medium

── Constraints ─────────────────────────────────────
Hours per week: 15
Compute: laptop
Dataset access: open_access_only
Goal: conference_paper

── Interests ───────────────────────────────────────
Topics: federated learning, privacy-preserving ML, non-IID data
Purpose: I want to submit a paper to a NeurIPS or ICLR workshop by end of semester.

Profile saved → researcher.yml
```

Ten minutes. She has a profile.

---

## Saturday morning — Discover

```
node src/index.js discover
```

```
Discover — finding papers for Priya Nair

Search queries:
  1. "federated learning heterogeneous data"
  2. "privacy-preserving machine learning federated"
  3. "non-IID federated learning convergence"
  4. "federated learning NeurIPS ICLR"

Fetching papers...
Fetched 52 papers across all sources.
Scoring papers...

Results — 52 papers scored

┌───┬───────┬─────────────────────────────────────────────────────────────┬──────┬───────┐
│ # │ Grade │ Title                                                       │ Year │ Cites │
├───┼───────┼─────────────────────────────────────────────────────────────┼──────┼───────┤
│ 1 │ A     │ Tackling the Objective Inconsistency Problem in Hetero...   │ 2020 │ 2841  │
│ 2 │ A     │ SCAFFOLD: Stochastic Controlled Averaging for Federat...    │ 2020 │ 1903  │
│ 3 │ B     │ APFL: Adaptive Personalized Federated Learning              │ 2020 │  741  │
│ 4 │ B     │ Communication-Efficient Federated Learning via Gradient...  │ 2021 │  428  │
│ 5 │ C     │ Differentially Private SGD: Tight Utility Bounds            │ 2019 │  612  │
│ 6 │ C     │ Federated Learning Under Arbitrary Communication Patterns   │ 2022 │  203  │
│ 7 │ C     │ HeteroFL: Computation and Communication Efficient FL...     │ 2021 │  389  │
│ … │ …     │ …                                                           │ …    │ …     │
└───┴───────┴─────────────────────────────────────────────────────────────┴──────┴───────┘

Top matches:
  1. Directly buildable from your PyTorch baseline; CIFAR-10 benchmark open-access.
  2. Strong novelty in client drift correction; code on GitHub; ~2000 citations.
  3. Good scope for 15 hrs/week; mixture model is learnable from your current skills.
  4. Gradient compression sits at the intersection of your interests; full PyTorch code.
  5. Heavy theory — math_comfort: medium may make this slow going.
```

Priya inspects papers 1, 2, and 3. She reads the abstracts, the TLDR summaries, the score breakdowns. She shortlists three:

```
Enter a paper number to inspect: 1
[reads SCAFFOLD card]
Add to shortlist? Yes

Enter a paper number to inspect: 2
[reads objective inconsistency card]
Add to shortlist? Yes

Enter a paper number to inspect: 3
[reads APFL card]
Add to shortlist? Yes

Enter a paper number to inspect: done

3 papers shortlisted.
  [+] Tackling the Objective Inconsistency Problem in Heterogeneous FL
  [+] SCAFFOLD: Stochastic Controlled Averaging for Federated Learning
  [+] APFL: Adaptive Personalized Federated Learning
```

She chose the two Grade A papers because they both have open-source code and concrete benchmarks. She chose APFL (Grade B) because the mixture model framing is something she could actually implement — it doesn't require a deep math background beyond what she already has.

She skipped paper 5 (DP-SGD) because the math comfort warning was accurate: she looked at the proof in the paper and didn't follow it. She is being honest with herself.

---

## Saturday afternoon — Litreview and Compare

```
node src/index.js litreview
```

Three papers. Three full reviews. Each one takes about 40 seconds.

```
Literature Review — analyzing 3 shortlisted papers

[1/3] Tackling the Objective Inconsistency Problem in Heterogeneous FL
  Sending to claude-opus-4-7...

── KEY FINDINGS ────────────────────────────────────────────────────────
  • Introduces SCAFFOLD with control variates to correct client drift
  • 2-3x fewer communication rounds than FedAvg on CIFAR-10 with α=0.1
  • Requires storing per-client control variates on server (memory overhead)
  • Performance gap vs FedAvg narrows significantly when α > 0.5

── LIMITATIONS ADMITTED ────────────────────────────────────────────────
  • Memory cost scales with number of clients
  • Control variate update requires full local SGD — incompatible with
    partial participation without modification

── REPRODUCIBILITY ─────────────────────────────────────────────────────
  Code: github.com/google-research/federated
  Hyperparameters: Appendix B, complete
  Data: CIFAR-10, MNIST — both open access

[2/3] SCAFFOLD: Stochastic Controlled Averaging for Federated Learning
  [review follows same format]

[3/3] APFL: Adaptive Personalized Federated Learning
  [review follows same format]

3 papers reviewed.
```

Then:

```
node src/index.js compare
```

```
Compare — synthesizing 3 paper reviews

── CONTRADICTIONS ──────────────────────────────────────────────────────
  ① Objective Inconsistency paper claims >10% accuracy improvement over
    FedAvg at α=0.1 on CIFAR-10.
    A 2023 replication study (Chen et al., arXiv:2312.09847) finds <3%
    improvement under identical settings with fixed random seeds.
    Dimension: convergence claims under high non-IID

── OPEN PROBLEMS MENTIONED ─────────────────────────────────────────────
  • No unified non-IID benchmark across FL papers
  • Communication efficiency and personalization are studied separately;
    no paper addresses both simultaneously under the same constraints
```

This contradiction catches her attention. Two papers, same experiment setup, very different results. That is a real problem.

---

## Saturday evening — Gaps

```
node src/index.js gaps
```

```
Gap Finder — analyzing 3 papers in Machine Learning

════════════════════════════════════════════════════
 Research Gaps Found: 3
════════════════════════════════════════════════════

 ▸ EVALUATION GAP
──────────────────────────────────────────────────
┌ GAP-001 · evaluation_gap · HIGH severity
│  Title: No standard non-IID partitioning benchmark across FL papers
│  Feasibility: HIGH  ·  Scope: 8-10 weeks
│  RQ: "Can a unified non-IID benchmark with 4 partitioning strategies
│       reduce result variance across FL reproducibility studies on
│       CIFAR-10 by >15%?"
└ Evidence: all three reviews

 ▸ CONTRADICTION GAP
──────────────────────────────────────────────────
┌ GAP-002 · contradiction_gap · MEDIUM severity
│  Title: Conflicting convergence claims at α=0.1 between SCAFFOLD
│         and independent replication
│  Feasibility: MEDIUM  ·  Scope: 4-6 weeks
│  RQ: "Do SCAFFOLD's reported accuracy gains at α=0.1 replicate
│       under fixed random seeds and identical hardware?"
└ Evidence: objective_inconsistency_review

 ▸ POPULATION GAP
──────────────────────────────────────────────────
┌ GAP-003 · population_gap · MEDIUM severity
│  Title: Personalized FL methods untested on tabular data distributions
│  Feasibility: MEDIUM  ·  Scope: 6-8 weeks
│  RQ: "Does APFL's mixture model generalize to non-IID tabular splits
│       on UCI datasets?"
└ Evidence: apfl_review

╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    ★  PRIORITY GAP: GAP-001                                  ║
║       No standard non-IID partitioning benchmark             ║
║                                                              ║
║  Directly solvable in your timeline at 15 hrs/week.          ║
║  Serves the entire FL research community. Library            ║
║  contribution is citable and maintainable.                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

She pauses here. She expected the tool to tell her to "do federated learning." Instead it is pointing at a benchmark gap — something unglamorous, tooling-adjacent, practical.

She almost dismisses it. Then she re-reads the contradiction gap. The reason that contradiction exists is that every paper implements non-IID splits differently. GAP-001 is not a distraction from the interesting research. GAP-001 is the reason the interesting research is so hard to compare.

She selects GAP-001.

---

## Sunday morning — Ideate

```
node src/index.js ideate GAP-001
```

```
 Feasibility Check  ✓ GO
────────────────────────────────────────────────────────────────────
 Compute   PASS  Benchmark suite runs on CPU — fits your laptop.
 Skills    PASS  Python/advanced + PyTorch/intermediate covers all tooling.
 Time      PASS  8-10 weeks is achievable at 15 hrs/week (120-150 hrs total).
 Dataset   PASS  CIFAR-10, MNIST, FEMNIST — all open access on HuggingFace.
 Scope/RQ  PASS  RQ names method, benchmark, and measurable variance reduction.
────────────────────────────────────────────────────────────────────

Sending gap to claude-opus-4-7 for idea generation...

══════════════════════════════════════════════════════════════════════════
 1. IDEA-001  ·  beginner-friendly
 "FLBench: A Unified Non-IID Partitioning Suite for Federated Learning"
══════════════════════════════════════════════════════════════════════════

Approach: Build a pip-installable Python library that wraps 5 standard
  datasets (CIFAR-10, MNIST, FEMNIST, Shakespeare, Sent140) and exposes
  4 non-IID partitioning strategies through a single consistent API.
  Bundle reference runs of SCAFFOLD and FedAvg so results are immediately
  comparable across any paper that adopts the library.

RQ: Does a shared partitioning API reduce cross-paper result variance
  by >15% compared to individually implemented splits on CIFAR-10
  with Dirichlet α=0.1, measured across 5 replication runs each?

Hypothesis: The majority of result variance in FL benchmarking comes
  from partitioning implementation differences, not algorithmic ones —
  a shared API will expose this directly and reduce noise to within
  expected stochastic bounds.

Tools: PyTorch, NumPy, pytest, setuptools
Datasets: CIFAR-10, MNIST, FEMNIST, Shakespeare — all HuggingFace Hub
Timeline: 10 weeks total
  Week 1-2:   Survey 10 existing FL repos; document partitioning differences
  Week 3-5:   Core library + 4 partitioning strategies + dataset adapters
  Week 6-8:   Reference SCAFFOLD and FedAvg baselines; run variance analysis
  Week 9:     Documentation, README, pip packaging
  Week 10:    Paper writeup (4 pages)
Publish at: FL-NeurIPS Workshop / NeurIPS Datasets & Benchmarks Track
Risks: 2 identified
  - A competing benchmark (FedScale, FedBench) may release before submission
  - Library adoption depends on community uptake; hard to measure at submission time
──────────────────────────────────────────────────────────────────────────

[IDEA-002: Contradiction replication study — intermediate, 6 weeks]
[IDEA-003: Adaptive partitioner with controllable heterogeneity — advanced, 14 weeks]

 ★ RECOMMENDED

  IDEA-001 is the strongest match for your profile. At 15 hrs/week on a laptop,
  the 10-week timeline is tight but realistic. The library contribution is a
  concrete artifact — FL workshop reviewers consistently value tooling that
  the community will actually use. IDEA-003 is worth revisiting if the thesis
  extends past this semester.

Select an idea to develop (IDEA-001/IDEA-002/IDEA-003) or 'all': IDEA-001

  ✓  Saved → data/ideas/GAP-001_IDEA-001.json

Run advisor simulation on selected idea? (yes/no): yes
```

---

## Sunday afternoon — Advisor simulation

Three rounds. Forty minutes.

**Round 1 — First impression:**

```
╔══════════════════════════════════════════════════════╗
 ROUND 1 — First Impression
══════════════════════════════════════════════════════

Advisor says:

  The core instinct here is right — the FL benchmarking problem is real
  and undersolved. What I'm skeptical of is the variance reduction claim.
  "Reduces variance by >15%" is a hypothesis that requires a careful
  experimental design to test fairly: you need a control condition
  (existing papers' implementations), and that control is genuinely hard
  to construct without reimplementing multiple papers' exact code.

Biggest weakness:

  THE CONTROL CONDITION IS UNDEFINED. You cannot measure variance
  reduction without a credible baseline representing "current practice."
  Right now, "current practice" is a moving target — each paper's
  implementation is different in ways that are not all documented.

Initial verdict: needs_work
```

**Round 2 — The five hard questions:**

```
Q1: Your novelty claim assumes no unified FL benchmark exists.
    Are you aware of FedScale (Lai et al., 2022) and LEAF (Caldas et al., 2018)?
    How does FLBench differ from these specifically?

    Why this matters: A reviewer will ask this in the first paragraph of their
    review. If you don't have a clear answer, the paper gets rejected immediately.

    Good answer: Names what FedScale covers (system heterogeneity, not data
    partitioning) and what LEAF covers (specific datasets, not partitioning API).
    Explains that FLBench targets the partitioning strategy layer specifically.

Q2: Your evaluation plan measures "cross-paper result variance" — but how?
    What is your unit of measurement and what is your statistical test?

    Why this matters: "Variance reduction by >15%" is a quantitative claim
    that requires a defined experimental protocol. Reviewers at NeurIPS
    Datasets & Benchmarks will want to see this clearly.

    Good answer: Defines variance as standard deviation of top-1 accuracy
    across 5 runs per method. Uses Levene's test for variance equality.
    Establishes the control condition as 3 paper-specific implementations
    selected for reproducibility.

Q3: At 15 hours per week, your timeline is 10 weeks — 150 hours total.
    Weeks 6-8 involve running SCAFFOLD and FedAvg baselines. On a laptop,
    a single CIFAR-10 non-IID run with 100 clients takes approximately
    4-8 hours. How many total runs does your variance analysis require,
    and does the math work?

    Why this matters: This is the most common way benchmark papers fail —
    the experimental design is sound but physically impossible in the
    available compute.

    Good answer: States that 5 runs × 2 methods × 3 α values × 3 implementations
    = 90 total runs. At 6 hours/run on CPU, this is 540 hours — not feasible.
    Adjusts to 10 clients, which reduces run time to ~20 minutes. Defends
    why 10 clients is sufficient to demonstrate the variance pattern.

Q4: You claim the library contribution is "citable and maintainable."
    Maintenance is a real cost — who maintains it after submission?
    Reviewers at workshop tracks increasingly ask this about tooling papers.

Q5: If the variance reduction you find is <5% rather than >15%,
    is that a null result or a publishable result?
```

Priya types her answers. She takes 25 minutes. She is honest about the compute question — she had not done the math. She adjusts the experimental design to 10 clients, defends why this is still ecologically valid. She names FedScale and LEAF and draws the distinction. She acknowledges the maintenance question and proposes a community maintenance model.

**Round 3 — Final verdict:**

```
Assessment of your answers:

  You handled Q1 and Q2 well — the FedScale/LEAF distinction is clean
  and defensible, and the revised statistical protocol is rigorous.
  Q3 was the important one: the fact that you caught the compute math
  problem and adjusted rather than defended it is exactly the right
  instinct. Your revised protocol (10 clients, 20 min/run) is feasible
  and the ecological validity argument holds for a workshop paper.
  Q4 and Q5 were underanswered — "community maintenance" is not a plan,
  and you should have a response ready for the null result scenario.

Revised research question:

  "Does a shared non-IID partitioning API reduce inter-implementation
   accuracy variance by a statistically significant margin (Levene's test,
   p < 0.05) on CIFAR-10 with Dirichlet α ∈ {0.1, 0.3, 0.5}, comparing
   3 existing paper-specific implementations against the unified FLBench
   API, measured across 5 independent runs at 10-client scale?"

Methodology improvements:
  • Add Levene's test for variance equality as the primary statistical test
  • Define the 3 control implementations explicitly: SCAFFOLD (Google), FedAvg
    (Bonawitz et al.), APFL (author release) — all have verifiable GitHub repos
  • Add a 10-client justification paragraph in the paper (system constraints)
  • Add a null result section: if variance is <5%, argue the benchmark still
    has value as a standardization contribution independent of variance reduction

 ✓ READY TO PROCEED

Next steps:
  1. Fork the 3 control implementations and document their partition code
  2. Implement the 4 partitioning strategies (Dirichlet, pathological, quantity skew, label skew)
  3. Run the 90-run experiment at 10-client scale (est. 30 hours compute)
  4. Write the variance analysis section before the rest of the paper

  Your instinct to catch the compute math problem and fix it rather than
  defend it — that's how you think about methodology. That's a real researcher's move.

Save revised RQ to your idea file? (yes/no): yes

  ✓  Idea file updated → data/ideas/GAP-001_IDEA-001.json
```

---

## The result

By Sunday evening, Priya has:

- A bibliography of 52 papers, 3 shortlisted and fully reviewed
- A gap taxonomy: 3 gaps classified, one selected
- A research idea with a specific, testable research question
- A revised RQ that survived a simulated thesis committee review
- A 10-week timeline that accounts for her actual compute constraints
- A clear next step: fork three GitHub repos

She did not have a research advisor. She had Research-Ops and fifteen hours.

The research question she committed to:

> **"Does a shared non-IID partitioning API reduce inter-implementation accuracy variance by a statistically significant margin on CIFAR-10 with Dirichlet α ∈ {0.1, 0.3, 0.5}, comparing 3 existing paper-specific implementations against a unified API, measured across 5 independent runs at 10-client scale?"**

That is a specific, testable, feasible, original research question from a student who one weekend ago had "federated learning" and a laptop.

---

This is what Research-Ops is for.

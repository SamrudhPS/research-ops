# Contributing to Research-Ops

Thanks for wanting to improve Research-Ops. This document covers the two main contribution paths: improving how the pipeline *reasons* (skill files) and extending what it *can do* (code).

---

## Setup

```bash
git clone https://github.com/SamrudhPS/research-ops.git
cd research-ops
npm install
cp config/researcher.example.yml config/researcher.yml
npm run doctor
```

`npm run doctor` checks your Node version, API key, and directory structure. Fix everything it flags before making changes.

---

## The fastest way to contribute: improve a skill file

The `skills/` directory contains one Markdown file per pipeline stage. These files are loaded directly into Claude's context when that command runs — they define the model's reasoning rules, output format, and quality constraints. No code changes required.

Good skill file improvements:
- Tightening a quality rule that produces vague output
- Adding a worked example to a section that's currently abstract
- Fixing a rule that's too strict or too permissive given real student constraints
- Improving the suggested research question format

To improve a skill file: edit `skills/<command>.md`, run the corresponding command against a real `researcher.yml`, verify the output improved, and submit a PR.

---

## How to add a new gap type

1. Add the type name and definition to the gap taxonomy table in `README.md`
2. Add it to the priority tiebreaker list in `skills/gaps.md` (place it in order of specificity — more specific types rank higher)
3. Add a validity check section in `skills/gaps.md` under **Type-specific validity checks**, following the format of existing types
4. Add it to the `gap_type` enum in the JSON schema your command validates against (in `src/gaps.js`)
5. Verify: run `research-ops gaps` on an existing shortlist and confirm the new type appears correctly classified in output
6. Update `CHANGELOG.md` under an `[Unreleased]` section

---

## How to add a new paper source API

1. Create `src/apis/<source-name>.js` — export a single async function `search(query, profile)` that returns an array of paper objects matching the shared schema (see `src/apis/semantic-scholar.js` for the shape)
2. Add the source to the API rotation in `src/discover.js`
3. Add a connectivity check for the new API in `scripts/doctor.js`
4. Add the source name to the **Built on** section of `README.md`
5. Verify: run `research-ops discover` and confirm papers from the new source appear in output with correct metadata

---

## PR checklist

Before opening a pull request:

- [ ] `npm run doctor` passes with no errors
- [ ] If you changed a command's behavior, test it end-to-end with a real `researcher.yml`
- [ ] If you added or renamed a command, update the commands table in `README.md`
- [ ] If you changed the output format of a command, update the **Real output** section in `README.md` if it's no longer accurate
- [ ] If you added a gap type, it appears in both `README.md` and `skills/gaps.md`
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]` describing the change

---

## What not to change

- `config/researcher.example.yml` — this is the canonical reference profile. Don't add fields that aren't supported by the pipeline.
- The HITL rule — every command must end at a student decision point. PRs that auto-advance the pipeline will not be merged.
- Paper fabrication guard — never add code or prompt language that would cause the model to invent paper titles, authors, or DOIs.

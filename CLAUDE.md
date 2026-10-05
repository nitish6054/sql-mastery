# CLAUDE.md — SQL Mastery

Personal, adaptive SQL trainer. Real PostgreSQL (PGlite/WASM) runs in the browser; all learning history lives in the
browser's IndexedDB. No backend, no build step, no framework, no network needed after load. **Practising must never
consume AI tokens** — grading, diagnosis and adaptation are all deterministic local code.

Owner: Nitish. Goal: SQL from zero → interview-ready (Data/Product/Business Analyst at top tech firms). PostgreSQL is the
primary dialect; flag MySQL differences, don't teach both at once.

**Git workflow:** after every set of changes, commit with a clear message; never push to a remote.

## Run / test
- `node server.js` → http://localhost:5173 (flag `--no-open`). It also serves `/api/backup` (local-only: Host check + `X-SQLM` header) writing to `user-data/` (git-ignored; `SQLM_DATA_DIR` overrides). Never commit that folder. The port matters: IndexedDB is per-origin, so a different
  port is a different (empty) database. Never change the default.
- `npm install` (dev-only deps) then `npm test`, which runs, in order:
  1. `tests/validate-content.mjs` — every problem vs real PostgreSQL: solution passes all its own cases, output columns match
     the spec, technique regexes match the solution, and the `trap` query FAILS at least one case.
  2. `tests/persistence.test.mjs` — submit → reload → export → wipe → import → verify, no duplicates on re-import.
  3. `tests/ui-e2e.mjs` — jsdom end-to-end: diagnostic, sessions, interview, assessments, every page.
  4. `tests/ui-zero.mjs` — zero-start journey (lesson 1 → sessions → unlocking → mastery needs multiple days).
- Extra: `node tests/diagnose-traps.mjs` prints the diagnosis each trap query receives (aim: no "Wrong result on …").
  `npm run validate-pack -- packs/x.json` checks a problem pack.
- jsdom cannot judge layout. For UI changes, check real-browser rendering (Playwright is fine; don't add it as a
  dependency) at 390, 820, 1280, 1512, 1920, 2560 and 3440 px wide and confirm there is no horizontal scrolling.

## Architecture (js/)
| File | Role |
|---|---|
| `main.js` | boot + hash router |
| `db.js` | versioned IndexedDB, atomic multi-store writes, export/import (validated, merge/replace) |
| `store.js` | in-memory state + actions. **One submission = one IndexedDB transaction** |
| `adaptive.js` | mastery, stages, spaced repetition, daily plan, unlocking, readiness score |
| `grader.js` | runs reference + learner SQL on sample data and every hidden dataset; compares; quality score |
| `diagnose.js` + `content/mistake_rules.js` | rule-based root-cause analysis of wrong answers |
| `sql/worker.js`, `sql/engine.js` | PGlite in a Web Worker; 8 s query timeout, worker restarts; `exclusive()` serialises reset→run pairs |
| `filebackup.js` | optional second copy: PUTs the export to `server.js` `/api/backup` → `user-data/` (git-ignored). Never autosaves from an empty state; offers restore into an empty browser |
| `packs.js` | install extra problem packs (validated against PostgreSQL first) |
| `views/*` | dashboard, workspace, flows (sessions/diagnostic/interview/assessments), learn, insights, settings |
| `content/*` | curriculum (topics + lessons + prerequisites), datasets, problems_*.js, patterns, references |
| `vendor/pglite/` | bundled PostgreSQL WASM (Apache-2.0). Do not edit |

## Hard rules
1. **Never lose learner data.** Attempts are append-only. Schema changes = a NEW entry in `MIGRATIONS` in `db.js` plus a
   `DB_VERSION` bump; never edit an old migration. Resets only move a cutoff timestamp in the profile; only
   "Delete all data" erases anything. Keep export/import round-tripping.
2. **Don't store learning state in localStorage** (UI prefs and editor drafts only). IndexedDB is the source of truth.
3. **Problem IDs are stable forever.** Never reuse or renumber. If a problem's logic changes, bump its `v`.
4. **Don't tell the learner the technique.** Prompts describe the business question; `skills` is revealed only after
   the first submission (except in Learn mode).
5. **No inflated progress.** Mastery needs evidence on different days and an unseen hard problem solved first try with
   no hints (see `computeTopicMastery`). Don't loosen without a reason, and keep `tests/ui-zero.mjs` green.
6. **Never serve problems from locked topics** (`chooseProblem` with `unlocked`).
7. No framework, bundler or runtime dependency. Dev-only dependencies are fine.
8. UI: sizes in `rem` (root font-size is fluid in `css/app.css`), colours via CSS variables with light + dark themes,
   layouts must collapse cleanly below 960 px.

## Adding problems (the main ongoing work)
Each problem in `js/content/problems_*.js` needs: stable `id`, `title`, `dataset`, `difficulty`, `topics` (ids from
`curriculum.js`), `skills`, `domain`, a business `prompt` that doesn't name the technique, `output` columns (must equal
the solution's columns), `orderMatters`, `solution`, 1+ hidden `tests` (`{name, category, why, patch}` — `patch` is SQL
applied on top of the dataset to probe an edge case), 3 progressive `hints`, `explain`, and a `trap` (a *realistic* wrong
query the tests must catch). Also add: `techniques` (regexes for the idiomatic approach), `patterns`, optional
`reasoning` (metric-definition MCQs), `clarifications`, and a rule in `content/mistake_rules.js` for the classic mistake.
Data must be realistic and messy (NULLs, ties, duplicates, users with no activity, boundary dates).
Workflow: write → `node tests/validate-content.mjs` → `node tests/diagnose-traps.mjs` (the trap should get a specific
diagnosis) → hand-check expected rows on the sample data → `npm test`.
Prefer shipping in `problems_*.js` (built in) over packs; packs are for optional extras.

## Content status and roadmap
Built (326 problems): Level 0 (26 beginner problems, 11 topics), Level 1 (13), Level 2 (50, `problems_e.js`, ids P300–P367:
inner P30x, outer P31x, anti/semi P32x + P357–P358, self P33x + P359, scaffolds P34x, fan-out P35x, multi-table/debug P36x), plus
Levels 3–4 (45, `problems_f.js` + `problems_g.js`, ids P400–P465: subqueries P40x, correlated P41x, EXISTS/NOT IN P42x, set ops P43x, CTEs P44x, recursive P45x), Level 5 (45, `problems_h.js`, P500–P544: ranking, LAG/LEAD, running/share, frames, gaps & islands), Level 6 (39, `problems_i.js`, P600–P638: dates, dedup, percentiles, JSON, LATERAL, pivot), Level 7 (56 new in `problems_j.js` + `problems_k.js`, P700–P777: funnels, cohorts, churn, sessions, rolling metrics, segmentation, anomalies, attribution/conversion; plus the original Level 7 problems). New files use the compact `Q(...)` builder in `js/content/q.js`; rules use `R(...)` in `mistake_rules.js`. Zero-start is the default path; the diagnostic is an optional link on the
welcome screen. Datasets added: `campus` and `recon` (Level 2), `billing` (subscriptions/churn) and `ads` (attribution) for Level 7.
Roadmap: all levels now have full coverage. Possible next work: more Level 7 interview/ambiguity cases and a support-tickets dataset.

## Known limitations / ideas
- Mistake diagnosis is rule-based. P040 falls back to a generic message; improve rules as new wrong answers show up.
- Explain-it-back and interview communication are self-graded by checklist (no AI in the loop, by design).
- Verified in Safari and Chromium. Firefox untested.

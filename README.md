# SQL Mastery

A personal, adaptive SQL training environment. Real PostgreSQL 18 runs inside your browser (PGlite, WebAssembly). Your entire learning history is stored locally in IndexedDB. No account, no server, no AI calls: **practising costs zero tokens, forever.**

## Setup (once)

1. **Put the folder somewhere permanent**, e.g. `~/sql-mastery` or `C:\sql-mastery`. You don't need a Claude Project or anything else.
2. **Install Node.js** (LTS) from https://nodejs.org if you don't have it. Check with `node -v`.
   - No Node? Python 3.10+ works too: `python3 -m http.server 5173 --bind 127.0.0.1`
3. **Start it**:
   - macOS / Linux: double-click `start-mac-linux.command` (first time on macOS: right-click → Open), or run `node server.js` in the folder.
   - Windows: double-click `start-windows.bat`, or run `node server.js`.
4. Your browser opens **http://localhost:5173**. Bookmark it.

Keep the terminal window open while you practise. No `npm install` is needed to use the app; the PostgreSQL engine is already in `vendor/`.

### ⚠ Always use the same address

Browsers store IndexedDB per *origin* (protocol + host + port). `http://localhost:5173` and `http://127.0.0.1:5173` or `:8000` are **different, empty databases**. If you ever end up on the wrong one, export from the right one and import into the other.

## Screen sizes

The interface scales with your screen: text and spacing grow on large monitors (about 21px base text on a 2560-wide display, 16px on a laptop), content is centred, and layouts collapse to one column on tablets and phones. Tested in Chromium from 390px to 3440px wide.

## Daily use

- **First run**: your path → lesson 1 (what SQL and databases are) → first session of three easy problems. Topics unlock as you show you can use the earlier ones; each new topic opens with a short lesson. (If you already know SQL, a placement diagnostic is tucked under the start button.)
- **Mastery is earned over days**: one sitting caps a topic at 70%. Mastery needs a successful re-solve on a later day plus an unseen problem solved first try without hints.
- **Dashboard → Start today's session**: warm-up (reviews) → weak areas → one new concept with a short lesson → main practice → one challenge. One problem at a time.
- **Run** freely against the sample data (`Ctrl/Cmd+Enter`). **Submit** (`Ctrl/Cmd+Shift+Enter`) grades against the sample *and* hidden edge-case datasets.
- Wrong answers get a diagnosis (category, root cause, concept), not the answer. Hints come in 3 levels, and the solution only appears on request.
- **Other modes:** Review (spaced repetition queue), Challenge, Interview (2 problems, 45 minutes, clarifying questions, self-explanation, debrief), Assessments (milestones, mixed review, capstones), Problem bank (free practice).

## Backups

Your data lives in the browser profile, not in this folder. **Settings → Export my learning data** downloads a complete JSON backup. The dashboard reminds you weekly. Import validates the file, shows what will change, and applies it in one transaction (merge or replace). Clearing site data, uninstalling the browser or using another browser/profile means starting empty unless you import a backup.

## Updating the app

Replace the files in the folder (keep the same address). Your history is untouched. Problem IDs are stable; if a problem's logic changes its `v` is bumped, and old attempts stay valid. Schema changes go through versioned IndexedDB migrations (`js/db.js → MIGRATIONS`).

## Adding problems (the only thing that ever uses Claude tokens)

The bank has 91 verified problems (Level 0–1: 51, Levels 2–7: 40, with more being added) plus `packs/example-attribution-pack.json`. Solved problems come back through spaced repetition. When you want more, ask Claude for a **problem pack**, then install it in **Settings → Add problem pack**. The app runs every solution and hidden test against PostgreSQL before accepting the pack.

Prompt you can paste into Claude (attach `packs/example-attribution-pack.json` as the format reference):

> Create a SQL Mastery problem pack JSON in exactly the format of the attached example. Pack id: `<short-id>`. 8 problems on `<topic, e.g. sessionization / attribution / gaps-and-islands>`, difficulty Medium to Very Hard, realistic `<domain>` data with NULLs, ties, duplicates and boundary dates. Use built-in datasets (shop, rides, saas, hr, bank) or define a new dataset. Use only these topic ids: `<copy ids from js/content/curriculum.js>`. Each problem needs: a business prompt that doesn't name the technique, an output column list matching the solution exactly, 3 progressive hints, at least one hidden test (`patch` SQL that adds rows probing an edge case, with `category` and `why`), an explanation, and IDs prefixed `X-<pack-id>-`.

Optional pre-check before installing: `npm install && npm run validate-pack -- packs/your-pack.json`

## What is (and isn't) automated

- **Grading** is exact: your result is compared with the reference result on the sample data plus every hidden dataset. Numbers are compared to 2 decimals, column order matters, and row order is checked only when the problem says so.
- **Mistake diagnosis** is rule-based: PostgreSQL error codes, result diffs, the hidden test that failed, and detectors for each problem's classic wrong approach. It is right most of the time. When it isn't, set the real cause in the diagnosis card.
- **Explain-it-back and interview communication are self-graded** against key-point checklists. Without an AI the app can't judge free text, so it doesn't pretend to.
- **Readiness** is a weighted model of your own record (shown component by component), scaled down until there's enough evidence. It does not guarantee interview outcomes.
- **Mastery** needs repeated evidence on different days, the hardest available difficulty, and an unseen problem solved first try without hints. Reading lessons never counts as mastery.

## PostgreSQL vs MySQL

The app teaches PostgreSQL. MySQL differences are flagged in explanations, and a comparison table sits in the Notebook. Results come from real PostgreSQL 18, so there are no compatibility caveats for PostgreSQL syntax.

## Privacy

Nothing leaves your machine. The optional network requests are Google Fonts (system fonts are used offline) and, only if `vendor/pglite` were missing, the jsDelivr CDN for the engine.

## License

MIT (see `LICENSE`). The bundled PostgreSQL engine is Apache-2.0; see `THIRD_PARTY_NOTICES.md`.

## For developers

```
npm install        # dev-only: PGlite, fake-indexeddb, jsdom
npm test           # 1) every problem vs PostgreSQL, incl. proving each hidden test catches a realistic wrong query
                   # 2) persistence acceptance test: submit → reload → export → wipe → import → verify
                   # 3) end-to-end UI tests in jsdom: zero-start journey, diagnostic, sessions, interview, assessments, all pages
```

```
index.html, css/app.css
js/main.js            boot + router
js/db.js              versioned IndexedDB, atomic writes, export/import
js/store.js           state + actions (each submission = one transaction)
js/adaptive.js        mastery, stages, spaced repetition, planning, readiness
js/grader.js          multi-case grading, result comparison, quality score
js/diagnose.js        rule-based root-cause analysis (+ content/mistake_rules.js)
js/sql/               PGlite in a Web Worker with timeouts
js/views/             dashboard, workspace, flows, learn, insights, settings
js/content/           curriculum, datasets, problems, patterns, references
vendor/pglite/        PostgreSQL WebAssembly build (Apache-2.0 / PostgreSQL licence)
```

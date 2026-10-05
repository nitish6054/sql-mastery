// Persistence acceptance test (spec §40) using fake-indexeddb + real PostgreSQL (PGlite).
import 'fake-indexeddb/auto';
import * as db from '../js/db.js';
import * as S from '../js/store.js';
import { PROBLEM_BY_ID } from '../js/content/problems.js';
import { DATASETS } from '../js/content/datasets.js';
import { gradeProblem, scoreQuality } from '../js/grader.js';
import { diagnose } from '../js/diagnose.js';
import { makeRunner } from './node-runner.mjs';

const ok = (c, m) => { if (!c) { console.log('✗ ' + m); process.exitCode = 1; } else console.log('✓ ' + m); };
const runner = await makeRunner();
const reload = async () => { db.closeDB(); for (const k of Object.keys(S.state)) S.state[k] = Array.isArray(S.state[k]) ? [] : (k === 'reviews' || k === 'masteryRows' || k === 'patternRows') ? {} : null; await S.loadState(); };

await S.loadState();
await S.startSession('free');
const p = PROBLEM_BY_ID['P021'];
const ep = await S.openEpisode(p.id, 'practice');
// 1. wrong attempt
let g = await gradeProblem(runner, p, DATASETS[p.dataset].setup, p.trap);
let d = diagnose({ problem: p, sql: p.trap, grade: g });
await S.recordSubmission(ep, { sql: p.trap, grade: g, quality: scoreQuality({ problem: p, sql: p.trap, grade: g }), diagnosis: d, confidence: 4 });
// 2. correct attempt
g = await gradeProblem(runner, p, DATASETS[p.dataset].setup, p.solution);
await S.recordSubmission(ep, { sql: p.solution, grade: g, quality: scoreQuality({ problem: p, sql: p.solution, grade: g }), diagnosis: [] });
await S.closeEpisode(ep);
await S.endSession();
S.state.profile.onboarded = true; await S.saveProfile();
const before = { attempts: S.state.attempts.length, mistakes: S.state.mistakes.length, mastery: S.state.derived.mastery.j_left.masteryScore };
console.log('diagnosis of trap →', d.map(x => `${x.category}: ${x.specific}`));

await reload();   // simulates closing/reopening the browser
ok(S.state.attempts.length === 2, `attempts persisted (${S.state.attempts.length})`);
ok(S.state.attempts.some(a => !a.correct) && S.state.attempts.some(a => a.correct), 'historical wrong attempt kept alongside the correct one');
ok(S.state.mistakes.length >= 1, `mistake recorded: ${S.state.mistakes.map(m => m.specific).join('; ')}`);
ok(S.state.masteryRows.j_left?.masteryScore > 0, `mastery changed (j_left = ${S.state.masteryRows.j_left?.masteryScore})`);
ok(!!S.state.reviews['topic:j_left']?.nextReviewAt, 'review scheduled for j_left');
ok(S.state.sessions.length === 1 && S.state.sessions[0].endedAt && S.state.sessions[0].solved === 1, 'session history with summary persisted');
ok(S.state.snapshots.length === 1, 'progress snapshot persisted');

const backup = await db.exportAll({ theme: 'dark' });
const json = JSON.parse(JSON.stringify(backup)); // through a file
ok(json.app === 'sql-mastery-platform' && json.schemaVersion === 1, 'export has versioned envelope');

await db.deleteDatabase();
await reload();
ok(S.state.attempts.length === 0, 'database wiped (fresh environment)');

// malformed import must be rejected without touching data
const bad = await db.analyzeImport({ app: 'other', data: {} });
ok(!bad.ok, 'foreign file rejected: ' + bad.errors[0]);
const analysis = await db.analyzeImport(json);
ok(analysis.ok, 'backup validated; summary: ' + Object.entries(analysis.summary).filter(([, v]) => v.incoming).map(([k, v]) => `${k}:${v.new} new/${v.duplicates} dup`).join(', '));
await db.applyImport(analysis, 'merge');
await reload();
ok(S.state.attempts.length === before.attempts, `attempts restored (${S.state.attempts.length})`);
ok(S.state.mistakes.length === before.mistakes, 'mistakes restored');
ok(S.state.profile.onboarded === true && S.state.profile.submitCount === 2, 'profile from backup preferred over fresh install profile');
ok(S.state.derived.mastery.j_left.masteryScore === before.mastery, 'mastery recomputes identically after restore');
// importing twice must not duplicate
const again = await db.analyzeImport(json); await db.applyImport(again, 'merge'); await reload();
ok(S.state.attempts.length === before.attempts, 'second import skipped duplicate IDs');

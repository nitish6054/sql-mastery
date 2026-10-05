// Validates every problem against real PostgreSQL (PGlite):
// solution runs on all cases, output columns match the spec, technique regexes match the solution,
// and the trap query (a realistic wrong answer) FAILS at least one case.
import { PROBLEMS } from '../js/content/problems.js';
import { DATASETS } from '../js/content/datasets.js';
import { TOPIC_BY_ID } from '../js/content/curriculum.js';
import { PATTERN_BY_ID } from '../js/content/patterns.js';
import { gradeProblem } from '../js/grader.js';
import { makeRunner } from './node-runner.mjs';

const runner = await makeRunner();
const show = process.argv.includes('--show');
let errors = 0; const ids = new Set();
const fail = (p, m) => { errors++; console.log(`✗ ${p.id} ${p.title}: ${m}`); };
for (const p of PROBLEMS) {
  if (ids.has(p.id)) fail(p, 'duplicate id'); ids.add(p.id);
  const ds = DATASETS[p.dataset]; if (!ds) { fail(p, 'unknown dataset'); continue; }
  for (const t of p.topics) if (!TOPIC_BY_ID[t]) fail(p, 'unknown topic ' + t);
  for (const pt of p.patterns || []) if (!PATTERN_BY_ID[pt]) fail(p, 'unknown pattern ' + pt);
  if (!p.hints || p.hints.length !== 3) fail(p, 'needs 3 hints');
  if (!p.tests?.length) fail(p, 'needs hidden tests');
  // solution grades itself perfectly
  let g;
  try { g = await gradeProblem(runner, p, ds.setup, p.solution, { noCache: true }); }
  catch (e) { fail(p, 'solution/patch error: ' + e.message); continue; }
  if (!g.allPassed) { fail(p, 'solution does not pass itself: ' + JSON.stringify(g.cases.map(c=>[c.name,c.passed,c.error?.message]))); continue; }
  const exp = g.cases[0].expected;
  const names = exp.fields.map(f => f.name);
  if (names.join(',') !== p.output.join(',')) fail(p, `output columns ${names} ≠ spec ${p.output}`);
  if (!exp.rows.length) fail(p, 'empty result on sample data');
  for (const t of p.techniques || []) new RegExp(t, 'i');
  if ((p.techniques||[]).length && !p.techniques.some(t => new RegExp(t,'i').test(p.solution))) fail(p, 'solution does not match its own technique regex');
  for (const m of p.mistakes || []) { const re = new RegExp(m.re, 'i'); if (re.test(p.solution)) fail(p, 'mistake regex matches the solution: ' + m.re); if (p.trap && !re.test(p.trap) && m.cat !== 'Business logic') console.log(`  note ${p.id}: mistake regex doesn't match trap (${m.msg})`); }
  // each hidden test should change the expected output vs sample (otherwise it tests nothing new) — warn only
  // trap must fail
  if (!p.trap) fail(p, 'missing trap');
  else {
    const tg = await gradeProblem(runner, p, ds.setup, p.trap, { noCache: true });
    if (tg.allPassed) fail(p, 'TRAP PASSES — hidden tests have no teeth');
    else if (tg.error) console.log(`  note ${p.id}: trap errors (${tg.error.message})`);
    else if (show) console.log(`  ${p.id} trap fails on: ${tg.cases.filter(c=>!c.passed).map(c=>c.name).join(', ')}`);
  }
  if (show) { console.log(`\n${p.id} ${p.title} → ${names.join(' | ')}`); for (const r of exp.rows) console.log('   ', r.map(v => v instanceof Date ? v.toISOString().slice(0,16).replace('T00:00','') : v).join(' | ')); }
}
console.log(`\n${PROBLEMS.length} problems checked, ${errors} error(s).`);
process.exit(errors ? 1 : 0);

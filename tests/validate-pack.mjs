// Validate a problem pack file with real PostgreSQL: node tests/validate-pack.mjs packs/your-pack.json
import { readFileSync } from 'node:fs';
import { gradeProblem } from '../js/grader.js';
import { makeRunner } from './node-runner.mjs';
const pack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { DATASETS } = await import('../js/content/datasets.js');
const ds = { ...DATASETS, ...(pack.datasets || {}) };
const runner = await makeRunner(); let bad = 0;
for (const p of pack.problems) {
  const g = await gradeProblem(runner, { tests: [], ...p }, ds[p.dataset].setup, p.solution, { noCache: true });
  const cols = g.cases[0].expected?.fields.map(f => f.name) || [];
  const okCols = cols.join(',') === p.output.join(',');
  console.log(`${g.allPassed && okCols ? '✓' : '✗'} ${p.id} ${p.title}`);
  if (g.allPassed) for (const r of g.cases[0].expected.rows) console.log('    ', r.join(' | '));
  if (!g.allPassed || !okCols) { bad++; console.log('   ', JSON.stringify(g.cases.map(c => [c.name, c.passed, c.error?.message]))); }
}
process.exit(bad ? 1 : 0);

import { PROBLEMS } from '../js/content/problems.js';
import { DATASETS } from '../js/content/datasets.js';
import { gradeProblem } from '../js/grader.js';
import { diagnose } from '../js/diagnose.js';
import { makeRunner } from './node-runner.mjs';
const runner = await makeRunner();
for (const p of PROBLEMS) {
  const g = await gradeProblem(runner, p, DATASETS[p.dataset].setup, p.trap);
  const d = diagnose({ problem: p, sql: p.trap, grade: g });
  console.log(`${p.id.padEnd(5)} ${d.map(x => `[${x.category}] ${x.specific}`).join(' | ')}`);
}

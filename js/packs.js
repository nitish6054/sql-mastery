// Optional problem packs: extra problems (and datasets) as JSON. Validated against real PostgreSQL
// before they are accepted, stored in IndexedDB (meta store, so they're included in backups).
import * as db from './db.js';
import { PROBLEMS, PROBLEM_BY_ID } from './content/problems.js';
import { DATASETS } from './content/datasets.js';
import { TOPIC_BY_ID } from './content/curriculum.js';
import { PATTERN_BY_ID } from './content/patterns.js';
import { gradeProblem } from './grader.js';
import { exclusive } from './sql/engine.js';

export const PACK_APP = 'sql-mastery-pack';
const DIFFS = ['Easy', 'Medium', 'Hard', 'Very Hard'];

export async function loadPacks() {
  const meta = await db.getAll('meta');
  const packs = meta.filter(m => m.key.startsWith('pack:')).map(m => m.pack);
  packs.forEach(register);
  return packs;
}

function register(pack) {
  Object.assign(DATASETS, pack.datasets || {});
  for (const p of pack.problems) {
    if (PROBLEM_BY_ID[p.id]) continue;
    const prob = { tests: [], hints: ['', '', ''], patterns: [], ...p, pack: pack.id };
    PROBLEMS.push(prob); PROBLEM_BY_ID[p.id] = prob;
  }
}

export async function validatePack(pack, onProgress = () => {}) {
  const errors = [];
  if (pack?.app !== PACK_APP) return { ok: false, errors: [`"app" must be "${PACK_APP}".`] };
  if (!pack.id || !/^[a-z0-9-]+$/.test(pack.id)) errors.push('Pack "id" must be lowercase letters, digits and dashes.');
  if (!Array.isArray(pack.problems) || !pack.problems.length) errors.push('Pack needs a non-empty "problems" list.');
  if (errors.length) return { ok: false, errors };
  const ds = { ...DATASETS, ...(pack.datasets || {}) };
  for (const [k, d] of Object.entries(pack.datasets || {})) if (DATASETS[k]) errors.push(`Dataset "${k}" already exists — use a new name.`); else if (!d.setup || !Array.isArray(d.tables)) errors.push(`Dataset "${k}" needs "setup" SQL and a "tables" list.`);
  let i = 0;
  for (const p of pack.problems) {
    onProgress(++i, pack.problems.length);
    const where = `Problem ${p.id || '(no id)'}`;
    if (!p.id || PROBLEM_BY_ID[p.id]) { errors.push(`${where}: missing or duplicate id (pack ids should be prefixed, e.g. "X-${pack.id}-01").`); continue; }
    for (const f of ['title', 'dataset', 'difficulty', 'topics', 'prompt', 'output', 'solution']) if (p[f] == null) errors.push(`${where}: missing "${f}".`);
    if (!ds[p.dataset]) { errors.push(`${where}: unknown dataset "${p.dataset}".`); continue; }
    if (!DIFFS.includes(p.difficulty)) errors.push(`${where}: difficulty must be one of ${DIFFS.join(', ')}.`);
    for (const t of p.topics || []) if (!TOPIC_BY_ID[t]) errors.push(`${where}: unknown topic "${t}".`);
    for (const t of p.patterns || []) if (!PATTERN_BY_ID[t]) errors.push(`${where}: unknown pattern "${t}".`);
    if (p.hints && p.hints.length !== 3) errors.push(`${where}: provide exactly 3 hints.`);
    try {
      const g = await exclusive(r => gradeProblem(r, { tests: [], ...p, v: p.v || 1 }, ds[p.dataset].setup, p.solution, { noCache: true }));
      if (!g.allPassed) errors.push(`${where}: the solution fails its own tests (${g.cases.filter(c => !c.passed).map(c => c.name + (c.error ? ': ' + c.error.message : '')).join('; ')}).`);
      else {
        const cols = g.cases[0].expected.fields.map(f => f.name);
        if (cols.join(',') !== (p.output || []).join(',')) errors.push(`${where}: output ${JSON.stringify(p.output)} doesn't match solution columns ${JSON.stringify(cols)}.`);
        if (!g.cases[0].expected.rows.length) errors.push(`${where}: solution returns no rows on the sample data.`);
      }
    } catch (e) { errors.push(`${where}: ${e.message}`); }
  }
  return { ok: errors.length === 0, errors };
}

export async function installPack(pack) {
  await db.put('meta', { key: 'pack:' + pack.id, pack, addedAt: Date.now() });
  register(pack);
}

export async function listInstalledPacks() {
  return (await db.getAll('meta')).filter(m => m.key.startsWith('pack:')).map(m => ({ id: m.pack.id, name: m.pack.name || m.pack.id, count: m.pack.problems.length, addedAt: m.addedAt }));
}

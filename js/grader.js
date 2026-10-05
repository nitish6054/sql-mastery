// Grading: run the reference solution and the learner's query on the sample data and on every
// hidden test dataset, then compare results. Pure logic + a `runner` interface:
//   runner.reset(setupSql)  → recreate an isolated schema with the dataset
//   runner.run(sql)         → { fields:[{name,dataTypeID}], rows:[[...]] } for the LAST statement
//   runner.explainCost(sql) → total plan cost (number) or null

const NUMERIC_TYPES = new Set([20, 21, 23, 26, 700, 701, 1700]);

function canonNum(n) {
  if (typeof n === 'bigint') n = Number(n);
  if (!Number.isFinite(n)) return String(n);
  let r = Math.round((n + (n >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
  if (Object.is(r, -0)) r = 0;
  return String(r);
}

function pad(n) { return String(n).padStart(2, '0'); }

function canonDate(d) {
  const ymd = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) return ymd;
  return `${ymd} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

export function canonCell(v, typeId) {
  if (v === null || v === undefined) return '∅';
  if (v instanceof Date) return canonDate(v);
  if (typeof v === 'number' || typeof v === 'bigint') return canonNum(v);
  if (typeof v === 'boolean') return v ? 't' : 'f';
  if (typeof v === 'string') {
    if (NUMERIC_TYPES.has(typeId) && v.trim() !== '' && !isNaN(Number(v))) return canonNum(Number(v));
    return v.replace(/\s+$/, '');
  }
  if (typeof v === 'object') return stableStringify(v);
  return String(v);
}

// Pretty value for display tables.
export function displayCell(v, typeId) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (typeId === 1082) return canonDate(v).slice(0, 10);
    return canonDate(v);
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function rowKey(row, fields) {
  return row.map((c, i) => canonCell(c, fields[i]?.dataTypeID)).join('\u241F');
}

export function compareResults(expected, actual, orderMatters) {
  const ef = expected.fields, af = actual.fields;
  if (af.length !== ef.length) {
    return { ok: false, kind: 'columns', expectedCols: ef.map(f => f.name), actualCols: af.map(f => f.name),
      message: `Your result has ${af.length} column${af.length === 1 ? '' : 's'}; expected ${ef.length} (${ef.map(f => f.name).join(', ')}).` };
  }
  const nameMismatch = ef.some((f, i) => f.name.toLowerCase() !== af[i].name.toLowerCase());
  const ek = expected.rows.map(r => rowKey(r, ef));
  const ak = actual.rows.map(r => rowKey(r, af));
  const counts = new Map();
  ek.forEach(k => counts.set(k, (counts.get(k) || 0) + 1));
  const extra = [];
  ak.forEach((k, i) => {
    const c = counts.get(k) || 0;
    if (c > 0) counts.set(k, c - 1); else extra.push(actual.rows[i]);
  });
  const missing = [];
  const remaining = new Map(counts);
  ek.forEach((k, i) => { const c = remaining.get(k) || 0; if (c > 0) { missing.push(expected.rows[i]); remaining.set(k, c - 1); } });
  const base = { expectedCount: ek.length, actualCount: ak.length, nameMismatch,
    expectedCols: ef.map(f => f.name), actualCols: af.map(f => f.name) };
  if (missing.length === 0 && extra.length === 0) {
    if (orderMatters && ek.some((k, i) => k !== ak[i])) {
      return { ...base, ok: false, kind: 'order', message: 'Right rows, wrong order. Re-read the sorting requirement (including tie-breakers).' };
    }
    return { ...base, ok: true, kind: 'match', message: nameMismatch ? `Correct values. Column names differ from the spec (${ef.map(f => f.name).join(', ')}) — fine here, but match them in interviews.` : 'Match.' };
  }
  let message;
  if (ak.length > ek.length && missing.length === 0) message = `${ak.length - ek.length} extra row(s): your result contains rows that shouldn't be there.`;
  else if (ak.length < ek.length && extra.length === 0) message = `${ek.length - ak.length} row(s) missing from your result.`;
  else if (ak.length === ek.length) message = `Same number of rows (${ak.length}) but ${missing.length} row(s) have different values.`;
  else message = `Expected ${ek.length} rows, got ${ak.length}; ${missing.length} expected row(s) not found.`;
  return { ...base, ok: false, kind: ak.length === ek.length ? 'values' : 'rowcount', message,
    missing: missing.slice(0, 5), extra: extra.slice(0, 5), fields: ef };
}

export function splitStatements(sql) {
  // Splits on semicolons outside quotes/comments/dollar-quotes. Good enough for learner SQL.
  const out = []; let cur = ''; let i = 0; let q = null; let dollar = null;
  while (i < sql.length) {
    const ch = sql[i], nx = sql[i + 1];
    if (dollar) { if (sql.startsWith(dollar, i)) { cur += dollar; i += dollar.length; dollar = null; continue; } cur += ch; i++; continue; }
    if (q) { cur += ch; if (ch === q) { if (nx === q) { cur += nx; i += 2; continue; } q = null; } i++; continue; }
    if (ch === '-' && nx === '-') { const e = sql.indexOf('\n', i); const end = e === -1 ? sql.length : e; cur += sql.slice(i, end); i = end; continue; }
    if (ch === '/' && nx === '*') { const e = sql.indexOf('*/', i + 2); const end = e === -1 ? sql.length : e + 2; cur += sql.slice(i, end); i = end; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; i++; continue; }
    if (ch === '$') { const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i)); if (m) { dollar = m[0]; cur += dollar; i += dollar.length; continue; } }
    if (ch === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  if (stripComments(cur).trim()) out.push(cur.trim());
  return out;
}

export function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

const expectedCache = new Map();

export async function gradeProblem(runner, problem, datasetSetup, userSql, opts = {}) {
  const cases = [{ name: 'Sample data', patch: '', isSample: true }, ...(problem.tests || []).map(t => ({ ...t, isSample: false }))];
  const results = [];
  let firstError = null, sampleActual = null;
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const key = `${problem.id}@${problem.v}#${i}`;
    let expected = opts.noCache ? null : expectedCache.get(key);
    await runner.reset(datasetSetup + '\n' + (c.patch || ''));
    if (!expected) {
      expected = await runner.run(problem.solution);
      if (!opts.noCache) expectedCache.set(key, expected);
    }
    let actual;
    try {
      actual = await runner.run(userSql);
    } catch (err) {
      firstError = firstError || err;
      results.push({ name: c.name, category: c.category, why: c.why, isSample: c.isSample, passed: false, error: errInfo(err) });
      // An error on the sample data will repeat on every case: stop early.
      if (c.isSample) break;
      continue;
    }
    if (c.isSample) sampleActual = actual;
    const cmp = compareResults(expected, actual, problem.orderMatters);
    results.push({ name: c.name, category: c.category, why: c.why, isSample: c.isSample, passed: cmp.ok, cmp, expected: c.isSample ? expected : undefined });
  }
  const hidden = results.filter(r => !r.isSample);
  const sample = results.find(r => r.isSample);
  return {
    cases: results,
    allPassed: results.length === cases.length && results.every(r => r.passed),
    samplePassed: !!sample?.passed,
    hiddenPassed: hidden.filter(r => r.passed).length,
    hiddenTotal: cases.length - 1,
    totalCases: cases.length,
    error: firstError ? errInfo(firstError) : null,
    sampleActual,
  };
}

export function errInfo(err) {
  return { message: err?.message || String(err), code: err?.code || null, position: err?.position ? Number(err.position) : null, timeout: !!err?.timeout };
}

// Query quality score (0–100): correctness 40, logic 20, readability 10, robustness 10, efficiency 10, technique 10.
export function scoreQuality({ problem, sql, grade, costRatio }) {
  const total = grade.totalCases;
  const passed = grade.cases.filter(c => c.passed).length;
  const correctness = Math.round(40 * (total ? passed / total : 0));
  const logic = grade.allPassed ? 20 : grade.samplePassed ? 10 : 0;
  const robustness = grade.hiddenTotal ? Math.round(10 * grade.hiddenPassed / grade.hiddenTotal) : (grade.samplePassed ? 10 : 0);
  const clean = stripComments(sql);
  const lines = sql.split('\n').filter(l => l.trim());
  const clauses = (clean.match(/\b(select|from|join|where|group\s+by|having|order\s+by|with|union)\b/gi) || []).length;
  let readability = 0; const notes = [];
  if (lines.length >= Math.min(clauses, 4)) readability += 4; else notes.push('Put major clauses on their own lines.');
  if (!/select\s+\*/i.test(clean)) readability += 2; else notes.push('Avoid SELECT * in final answers.');
  const joins = (clean.match(/\bjoin\b/gi) || []).length;
  if (joins === 0 || /\b(from|join)\s+\w+\s+(as\s+)?\w+\s+(on|join|where|left|inner|cross|group|order|,|\))/i.test(clean) || /\busing\s*\(/i.test(clean)) readability += 2; else notes.push('Use short table aliases when joining.');
  if (!lines.some(l => l.length > 140)) readability += 2; else notes.push('Some lines are very long.');
  let efficiency = 8;
  if (costRatio != null && grade.allPassed) efficiency = costRatio <= 1.5 ? 10 : costRatio <= 3 ? 7 : 4;
  if (costRatio != null && costRatio > 3) notes.push(`Estimated plan cost is ${costRatio.toFixed(1)}× the reference — look for repeated scans or correlated subqueries.`);
  const techs = problem.techniques || [];
  const idiomatic = techs.length === 0 || techs.some(t => new RegExp(t, 'i').test(clean));
  const technique = grade.allPassed ? (idiomatic ? 10 : 6) : (idiomatic ? 5 : 0);
  if (grade.allPassed && !idiomatic) notes.push('Works, but not the most common approach for this pattern — compare with the reference solution.');
  const total100 = correctness + logic + readability + robustness + efficiency + technique;
  return { total: total100, parts: { correctness, logic, readability, robustness, efficiency, technique }, notes };
}

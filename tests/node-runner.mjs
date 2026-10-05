import { PGlite } from '@electric-sql/pglite';
export async function makeRunner() {
  const db = await PGlite.create();
  const pick = (res) => { const withF = res.filter(r => r.fields && r.fields.length); const r = withF.length ? withF[withF.length-1] : res[res.length-1]; return { fields: r?.fields || [], rows: r?.rows || [] }; };
  return {
    db,
    async reset(sql) { try { await db.exec('ROLLBACK'); } catch {} await db.exec(`DROP SCHEMA IF EXISTS ws CASCADE; CREATE SCHEMA ws; SET search_path TO ws;\n${sql}`); },
    async run(sql) { return pick(await db.exec(sql, { rowMode: 'array' })); },
    async explainCost(sql) { const r = await db.query('EXPLAIN (FORMAT JSON) ' + sql); return r.rows[0]['QUERY PLAN'][0].Plan['Total Cost']; },
  };
}

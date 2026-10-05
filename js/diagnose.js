// Rule-based diagnosis. No AI calls: uses the PostgreSQL error, the result diff on each test case,
// the hidden test that failed (each carries a category + reason), problem-specific detectors and
// static checks on the SQL. Returns candidate mistakes; the learner can override the root cause.
import { TOPIC_CATEGORY } from './content/curriculum.js';
import { stripComments } from './grader.js';
import { MISTAKE_RULES } from './content/mistake_rules.js';

const D = (category, key, specific, rootCause, concept, severity = 2) => ({ category, key, specific, rootCause, concept, severity });

function fromError(err, sql) {
  const msg = (err.message || '').toLowerCase();
  const code = err.code;
  const clean = stripComments(sql);
  if (err.timeout) return D('Performance', 'timeout', 'Query did not finish within the time limit',
    'Runaway computation: an infinite recursive CTE, a missing join condition (cartesian product) or a correlated subquery over a large set.',
    'Check recursive CTEs terminate and every JOIN has an ON condition.', 3);
  if (code === '42803' && msg.includes('aggregate functions are not allowed in where'))
    return D('Aggregation', 'agg_in_where', 'Used an aggregate inside WHERE', 'Confused row-level filtering (WHERE) with group-level filtering (HAVING).', 'WHERE runs before GROUP BY; filter aggregates with HAVING or in an outer query.', 3);
  if (code === '42803' || msg.includes('must appear in the group by'))
    return D('Aggregation', 'non_grouped_col', 'Selected a column that is neither grouped nor aggregated', 'The output grain (GROUP BY list) does not match the selected columns.', 'Every selected column must be in GROUP BY or inside an aggregate.', 2);
  if (code === '42P20' || msg.includes('window functions are not allowed in where'))
    return D('Window functions', 'window_in_where', 'Filtered on a window function in the same query level', 'Window functions are computed after WHERE.', 'Compute the window in a CTE/subquery and filter in the outer query.', 3);
  if (code === '42703') {
    const m = /column "([^"]+)" does not exist/.exec(err.message || '');
    const col = m?.[1];
    if (col && new RegExp(`\\bas\\s+"?${col}"?\\b`, 'i').test(clean) && /\b(where|having)\b/i.test(clean))
      return D('Syntax', 'alias_in_where', `Referenced the SELECT alias "${col}" in WHERE/HAVING`, 'Assumed SELECT runs before WHERE; logically it runs after.', 'Repeat the expression, or compute it in a CTE and filter outside.', 2);
    return D('Syntax', 'unknown_column', `Referenced a column that doesn't exist${col ? ` ("${col}")` : ''}`, 'Mismatch between the query and the schema (wrong table alias or column name).', 'Check the schema panel and which alias owns the column.', 1);
  }
  if (code === '42P01') return D('Syntax', 'unknown_table', 'Referenced a table or CTE that does not exist', 'Typo in a table name or a CTE used outside its WITH clause.', 'Check table names in the schema panel.', 1);
  if (code === '42702') return D('Joins', 'ambiguous_column', 'Ambiguous column reference after a join', 'Both joined tables have a column with that name.', 'Qualify columns with table aliases (o.order_id).', 1);
  if (code === '42883') {
    if (/round\(double precision/.test(msg)) return D('Syntax', 'round_double', 'ROUND(double precision, n) does not exist', 'PostgreSQL only rounds numeric to n places.', 'Cast first: ROUND(x::numeric, 2).', 1);
    if (/date|timestamp|interval/.test(msg)) return D('Dates/time', 'date_operator', 'Invalid operation on date/time types', 'Mixed date, timestamp, interval or text types in an operation.', 'date − date = integer days; timestamp − timestamp = interval; cast explicitly.', 2);
    return D('Syntax', 'type_mismatch', 'Function or operator not defined for these types', 'Type mismatch between operands.', 'Cast operands to compatible types.', 1);
  }
  if (code === '22012') return D('Edge cases', 'div_zero', 'Division by zero', 'A denominator can be zero for some groups.', 'Wrap the denominator in NULLIF(x, 0).', 2);
  if (code === '21000') return D('Logic', 'scalar_multi', 'A subquery used as a single value returned several rows', 'The subquery is not correlated or not aggregated.', 'Correlate it with the outer row or aggregate it.', 2);
  if (code === '42804' || code === '22P02' || code === '22007' || code === '22008') return D('Syntax', 'datatype', 'Data type mismatch or invalid literal', 'Mixed types (e.g. text vs number, invalid date literal).', 'Use typed literals: DATE \'2026-01-01\', and consistent CASE branch types.', 1);
  if (code === '42601') return D('Syntax', 'syntax', 'SQL syntax error', 'Malformed SQL near the reported position.', 'Check commas, parentheses and clause order (WITH … SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY).', 1);
  if (code === '42P10' || msg.includes('order by expressions must appear in select list')) return D('Syntax', 'distinct_order', 'ORDER BY expression not in SELECT DISTINCT list', 'With DISTINCT the sort keys must be selected.', 'Select the sort column or sort in an outer query.', 1);
  if (msg.includes('ordered-set aggregate') && msg.includes('over')) return D('Aggregation', 'percentile_over', 'Used PERCENTILE_CONT as a window function', 'Ordered-set aggregates do not support OVER in PostgreSQL.', 'Compute percentiles with GROUP BY and join back.', 2);
  return D('Syntax', 'other_error', 'Query raised an error', err.message, 'Read the error message and position carefully.', 1);
}

function hasJoin(sql) { return /\bjoin\b/i.test(sql); }

export function diagnose({ problem, sql, grade }) {
  const clean = stripComments(sql);
  const out = [];
  if (grade.error && !grade.samplePassed && grade.cases[0]?.error) {
    out.push(fromError(grade.error, sql));
    return finalize(out, problem);
  }
  // Problem-specific detectors first (most precise).
  for (const m of [...(problem.mistakes || []), ...(MISTAKE_RULES[problem.id] || [])]) {
    const hit = new RegExp(m.re, 'i').test(clean);
    if (m.absent ? !hit : hit) out.push(D(m.cat, 'p_' + m.msg.toLowerCase().replace(/\W+/g, '_').slice(0, 40), m.msg, m.concept, m.concept, 2));
  }
  // Generic: a business filter the reference applies (col = 'literal') is missing entirely.
  for (const [, col, lit] of problem.solution.matchAll(/(\w+)\s*=\s*'([^']+)'/g)) {
    if (!new RegExp(`'${lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'i').test(clean)) {
      out.push(D('Business logic', 'missing_filter_' + col + '_' + lit, `Didn't apply the business rule ${col} = '${lit}'`, 'Answered a broader question than the one asked — the population was not restricted.', `Re-read the requirement and list every filter it implies (here: ${col} = '${lit}').`, 2));
      break;
    }
  }
  // Beginner-level generic rules, derived by comparing with the reference solution.
  if (!grade.allPassed) {
    const sol = stripComments(problem.solution);
    const B = (cat, key, specific, root, concept) => out.push(D(cat, key, specific, root, concept, 2));
    const cmpRe = /([\w.]+(?:\(\*\)|\([\w.]*\))?)\s*(>=|<=|<>|<|>|=)\s*(-?\d+(?:\.\d+)?)/g;
    const userCmps = [...clean.matchAll(cmpRe)].map(m => [m[1].toLowerCase(), m[2], m[3]]);
    for (const [, c, op, v] of sol.matchAll(cmpRe)) {
      const hit = userCmps.find(u => u[0] === c.toLowerCase() && u[2] === v && u[1] !== op && [op, u[1]].every(o => ['<', '<=', '>', '>='].includes(o)));
      if (hit) { B('Edge cases', 'boundary_' + c + v, `Boundary: used ${c} ${hit[1]} ${v} where the question means ${c} ${op} ${v}`, 'Translated "at least / more than / under / up to" loosely.', '"At least" and "up to" include the boundary (>=, <=); "more than", "under" and "shorter than" exclude it (>, <).'); break; }
    }
    if (/=\s*null|<>\s*null|!=\s*null/i.test(clean)) B('NULL handling', 'eq_null', 'Compared with NULL using = or <>', 'Treated NULL like a value.', 'Use IS NULL / IS NOT NULL.');
    if (/\bdesc\b/i.test(sol) && /\blimit\b/i.test(clean) && !/\bdesc\b/i.test(clean)) B('Logic', 'limit_no_desc', 'Took the smallest rows instead of the largest', 'ORDER BY sorts ascending unless you add DESC.', 'Largest/newest first → ORDER BY … DESC before LIMIT.');
    if (/\bdistinct\b/i.test(sol) && !/\bdistinct\b|\bgroup\s+by\b/i.test(clean)) B('Logic', 'no_distinct', 'Duplicate values were not removed', 'Several rows share the same value.', 'SELECT DISTINCT … (or GROUP BY) returns each value once.');
    if (/\band\b/i.test(clean) && /\bor\b/i.test(clean) && /\(\s*[^()]*\bor\b[^()]*\)/i.test(sol) && !/\(\s*[^()]*\bor\b[^()]*\)/i.test(clean)) B('Logic', 'and_or_parens', 'Mixed AND and OR without parentheses', 'AND is evaluated before OR, so the conditions grouped differently than intended.', 'Wrap the OR alternatives in parentheses: a AND (b OR c).');
    if (/\bbetween\b/i.test(clean) && !/\bbetween\b/i.test(sol) && /</.test(sol)) B('Dates/time', 'between_ts', 'BETWEEN on a timestamp cut off the last day', "BETWEEN '…' AND '2026-03-05' stops at 2026-03-05 00:00.", 'Use >= start AND < the day after the end.');
    if (/\bilike\b|\blower\s*\(/i.test(sol) && /\blike\b/i.test(clean) && !/\bilike\b|\blower\s*\(|\bupper\s*\(/i.test(clean)) B('Logic', 'like_case', 'Case-sensitive match missed some values', 'LIKE is case-sensitive in PostgreSQL.', 'ILIKE, or compare LOWER(col) with a lowercase pattern.');
    if (/count\s*\(\s*(distinct\s+)?\w+\s*\)/i.test(sol) && !/count\s*\(\s*\*\s*\)/i.test(sol) && /count\s*\(\s*\*\s*\)/i.test(clean)) B('Aggregation', 'count_star', 'COUNT(*) counted rows the question excludes', 'COUNT(*) counts every row; COUNT(col) skips NULLs and COUNT(DISTINCT col) counts unique values.', 'Choose the COUNT form that matches the question.');
    if (/count\s*\(\s*distinct/i.test(sol) && /count\s*\(\s*(?!distinct)[\w.]+\s*\)/i.test(clean) && !/count\s*\(\s*distinct/i.test(clean)) B('Aggregation', 'count_not_distinct', 'Counted rows instead of distinct entities', 'One customer can appear in many rows.', 'COUNT(DISTINCT customer_id) counts people.');
    if (/extract\s*\(\s*minute/i.test(clean) && /epoch/i.test(sol)) B('Dates/time', 'extract_minute', 'EXTRACT(MINUTE …) returned only the minutes part of the duration', 'An interval of 1h10m has a minute field of 10.', 'EXTRACT(EPOCH FROM interval) / 60 gives total minutes.');
    if (/current_date|now\s*\(/i.test(clean) && /date\s*'/i.test(sol)) B('Dates/time', 'current_date', 'Used today instead of the stated date', 'The question fixes an as-of date.', 'Use the literal date given in the question.');
    if (/is\s+null/i.test(sol) && !/is\s+null|coalesce|is\s+distinct/i.test(clean)) B('NULL handling', 'null_dropped', 'Rows with missing values were dropped or mislabelled', 'Comparisons with NULL are neither true nor false.', 'Handle NULL explicitly with IS NULL (or COALESCE).');
    if (/coalesce/i.test(sol) && !/coalesce|case|is\s+null/i.test(clean)) B('NULL handling', 'no_coalesce', 'Missing values were not replaced with the default', 'NULL stays NULL unless you replace it.', 'COALESCE(col, default).');
    if (/\bceil/i.test(sol) && !/\bceil/i.test(clean)) B('Logic', 'not_ceil', 'Rounded to the nearest instead of rounding up', 'ROUND goes to the nearest value.', 'CEIL rounds up; FLOOR rounds down.');
    if (/\bhaving\b/i.test(sol) && /\bwhere\b/i.test(sol) && !/\bwhere\b/i.test(clean) && /\bhaving\b/i.test(clean)) B('Aggregation', 'missing_where', 'Row filter missing before grouping', 'Rows that should not count were included in the groups.', 'Filter rows in WHERE, then test groups in HAVING.');
  }
  // Generic technique gaps.
  const solHas = (re) => re.test(problem.solution), userHas = (re) => re.test(clean);
  if (!grade.allPassed) {
    if (solHas(/with\s+recursive/i) && !userHas(/with\s+recursive/i))
      out.push(D('Logic', 'no_recursion', 'Used a fixed number of self-joins for a hierarchy of unknown depth', 'Assumed the hierarchy depth from the sample data.', 'WITH RECURSIVE walks any depth.', 2));
    if (solHas(/generate_series|cross\s+join/i) && !userHas(/generate_series|cross\s+join/i))
      out.push(D('Dates/time', 'no_spine', 'No scaffold / date spine: combinations without data disappear', 'Grouped the fact table only, so periods or entities with zero activity have no row.', 'Generate every period × dimension first, then LEFT JOIN the facts.', 2));
    if (problem.topics.some(t => t.startsWith('w_') || t === 'an_session') && /\bover\s*\(\s*order\s+by/i.test(clean) && solHas(/partition\s+by/i))
      out.push(D('Window functions', 'no_partition', 'Window function without PARTITION BY', 'Compared rows across different entities.', 'Partition the window by the entity (customer, user, account…).', 2));
    if (/\b(lag|lead)\s*\(/i.test(clean) && !/\bwith\b|\(\s*select/i.test(clean) && /\bwhere\b/i.test(clean) && solHas(/\bwith\b/i))
      out.push(D('Window functions', 'filter_before_window', 'Filtered rows before computing LAG/LEAD', 'WHERE runs before window functions, so "previous/next" ignored the filtered-out rows.', 'Compute the window over all rows in a CTE, then filter outside.', 3));
    if (/row_number/i.test(clean) && /rank/i.test(problem.solution) && !/row_number/i.test(problem.solution))
      out.push(D('Window functions', 'row_number_ties', 'ROW_NUMBER broke ties the spec wanted kept', 'Did not check how ties should be handled.', 'RANK/DENSE_RANK keep ties; ROW_NUMBER picks one arbitrarily.', 2));
  }
  const sample = grade.cases.find(c => c.isSample);
  const cmp = sample?.cmp;
  if (sample && !sample.passed && cmp && !out.length) {
    if (cmp.kind === 'columns') out.push(D('Problem decomposition', 'output_shape', 'Returned the wrong set of output columns', 'Did not pin down the required output before writing the query.', `Write the output columns first: ${cmp.expectedCols.join(', ')}.`, 1));
    else if (cmp.kind === 'order') out.push(D('Logic', 'ordering', 'Correct rows in the wrong order', 'Overlooked the sorting requirement or a tie-breaker.', 'Implement every ORDER BY key the spec lists, including tie-breakers.', 1));
    else {
      const more = cmp.actualCount > cmp.expectedCount, fewer = cmp.actualCount < cmp.expectedCount;
      if (/\bnot\s+in\s*\(\s*select/i.test(clean) && cmp.actualCount === 0 && cmp.expectedCount > 0)
        out.push(D('NULL handling', 'not_in_null', 'NOT IN against a list that contains NULL returned nothing', 'x NOT IN (…, NULL) is never TRUE.', 'Use NOT EXISTS or exclude NULLs in the subquery.', 3));
      else if (fewer && /\bleft\s+(outer\s+)?join\b/i.test(clean) && /\bwhere\b/i.test(clean))
        out.push(D('Joins', 'left_join_where', 'LEFT JOIN turned into an INNER JOIN by a WHERE filter', 'A WHERE condition on the optional side discards unmatched (NULL) rows.', 'Move conditions on the right-hand table into the ON clause.', 3));
      else if (fewer && hasJoin(clean) && !/\b(left|full|right)\b/i.test(clean) && (cmp.missing || []).some(r => r.some(v => v === null || v === 0 || v === '0' || v === '0.00')))
        out.push(D('Joins', 'inner_drops', 'INNER JOIN dropped entities with no matching rows', 'Did not consider entities with zero activity.', 'Start from the entity table and LEFT JOIN the activity.', 2));
      else if (more && hasJoin(clean))
        out.push(D('Joins', 'fanout_rows', 'Extra rows from a one-to-many join (fan-out) or a missing filter', 'Did not track table grain through the joins.', 'State each table\'s grain; aggregate children to the parent grain before joining, and apply all filters.', 3));
      else if (cmp.kind === 'values' && /\/\s*count\s*\(|\/\s*\w+\s*\)|\/\s*\d+\b/i.test(clean) && !/100\.0|::numeric|::decimal|::float|\*\s*1\.0/i.test(clean) && looksTruncated(cmp))
        out.push(D('Aggregation', 'integer_division', 'Integer division truncated a ratio', 'integer / integer is integer in PostgreSQL.', 'Multiply by 100.0 or cast to numeric before dividing.', 2));
      else if (cmp.kind === 'values' && hasJoin(clean) && inflated(cmp))
        out.push(D('Joins', 'fanout_sum', 'Aggregates inflated by duplicated rows after a join', 'Summed a measure after a join that repeated rows.', 'Pre-aggregate before joining, or join at the correct grain.', 3));
    }
  }
  // Hidden tests: sample passes but an edge case fails → use the test's own category and reason.
  if (grade.samplePassed) {
    for (const c of grade.cases.filter(x => !x.isSample && !x.passed)) {
      out.push(D(c.category || 'Edge cases', 'edge_' + (c.name || '').toLowerCase().replace(/\W+/g, '_').slice(0, 40),
        `Missed an edge case: ${c.name}`, c.why || 'The query only works on the sample data.', c.why || 'Test boundary values, NULLs, ties and duplicates.', 2));
    }
  }
  if (!out.length && !grade.allPassed) {
    const cat = TOPIC_CATEGORY[problem.topics[0]] || 'Logic';
    out.push(D(cat, 'generic_' + problem.topics[0], `Wrong result on ${problem.title}`, 'Not pinned down automatically — compare your output with the expected rows and pick a root cause.', 'Re-read the requirement, then check grain, filters and edge cases step by step.', 1));
  }
  return finalize(out, problem);
}

function looksTruncated(cmp) {
  const rows = cmp.missing || [];
  return rows.some(r => r.some(v => typeof v === 'string' && /^-?\d+\.\d*[1-9]/.test(v)));
}
function inflated(cmp) {
  const m = cmp.missing || [], e = cmp.extra || [];
  if (!m.length || !e.length) return false;
  for (let i = 0; i < Math.min(m.length, e.length); i++) {
    for (let j = 0; j < m[i].length; j++) {
      const a = Number(m[i][j]), b = Number(e[i]?.[j]);
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > a && Math.abs(b / a - Math.round(b / a)) < 1e-6) return true;
    }
  }
  return false;
}

// Keep only the most specific tier of explanations so one root cause isn't logged twice.
const tier = (d) => d.key.startsWith('p_') ? 0 : d.key.startsWith('generic_') ? 3 : d.key.startsWith('edge_') ? 2 : 1;
function finalize(list, problem) {
  const seen = new Set();
  const uniq = list.filter(d => { if (seen.has(d.key)) return false; seen.add(d.key); return true; });
  const best = Math.min(...uniq.map(tier));
  return uniq.filter(d => tier(d) === best).slice(0, 2)
    .map(d => ({ ...d, topic: problem.topics[0], signature: `${d.category}|${d.key}` }));
}

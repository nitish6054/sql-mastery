// Curriculum: levels → topics. `prereqs` builds the dependency graph used for
// unlocking, the dependency map, and root-cause routing (struggling with a topic
// sends you to its weakest prerequisite). Lessons are deliberately short.

export const LEVELS = [
  { id: 0, name: 'Foundations', goal: 'Read a table, filter it, shape the output.' },
  { id: 1, name: 'Aggregation', goal: 'Collapse rows into metrics without losing track of grain.' },
  { id: 2, name: 'Joins', goal: 'Predict exactly what happens to row counts after every join.' },
  { id: 3, name: 'Subqueries & set operations', goal: 'Ask questions about other questions; handle NULL traps.' },
  { id: 4, name: 'CTEs', goal: 'Decompose hard problems into readable steps.' },
  { id: 5, name: 'Window functions', goal: 'Compare each row with its neighbours and its group.' },
  { id: 6, name: 'Advanced SQL', goal: 'Dates, dedup, percentiles, JSON, LATERAL, pivots.' },
  { id: 7, name: 'Real-world analytics', goal: 'Funnels, cohorts, churn, sessions, rolling metrics.' },
];

// minProblems: distinct problems needed before mastery can exceed ~70%.
export const TOPICS = [
  // Level 0 — written for someone who has never written SQL
  { id: 'f_intro', level: 0, name: 'What SQL is (start here)', prereqs: [], lesson: {
    idea: 'A database stores data in tables. A table looks like a spreadsheet: each column has a name and a type (numbers, text, dates), and each row is one record — one customer, one order, one trip. SQL (Structured Query Language) is how you ask a database questions. You describe WHAT you want ("names of customers in Mumbai"), and the database works out HOW to get it. A query never changes the data; it just returns a result table. Every question in this app is answered with one query that starts with SELECT. In the workspace: the Schema tab lists the tables and their columns, the Data tab shows the actual rows, Run executes your query on that data (as often as you like), and Submit grades it.',
    example: `-- Everything after two dashes is a comment, ignored by the database.
-- "Show me every column (*) of every row in the products table":
SELECT * FROM products;`, dataset: 'shop',
    traps: ['SQL keywords are not case-sensitive (select = SELECT), but text values are: \'Mumbai\' is not \'mumbai\'.', 'Text values go in single quotes: \'Mumbai\'. Double quotes are for column names.', 'A query ends with a semicolon (;). Optional for a single query, required between several.'],
    objectives: ['Explain what a table, row and column are', 'Read a table in the Schema and Data tabs', 'Run your first query'] } },
  { id: 'f_select', level: 0, name: 'SELECT columns & aliases', prereqs: ['f_intro'], lesson: {
    idea: 'SELECT lists the columns you want, FROM names the table. You can compute new columns with arithmetic (+ − * /) and name them with AS. The result has exactly the columns you listed, in that order. Prefer listing columns over SELECT * — interviewers notice.',
    example: `SELECT name,
       price,
       price * 0.9 AS sale_price   -- a computed column named sale_price
FROM products;`, dataset: 'shop',
    traps: ['Commas go BETWEEN columns, never after the last one.', 'Arithmetic with a NULL value gives NULL.', 'ROUND(x, 2) needs a numeric value; ROUND(x::numeric, 2) if it complains.'],
    objectives: ['Pick columns', 'Compute and rename columns'] } },
  { id: 'f_sort', level: 0, name: 'DISTINCT, ORDER BY, LIMIT', prereqs: ['f_select'], lesson: {
    idea: 'ORDER BY sorts the result (ASC is the default; DESC for largest first). Sort by several columns to break ties: ORDER BY price DESC, name. LIMIT n keeps the first n rows after sorting. DISTINCT removes duplicate rows from the result — duplicates across ALL selected columns. Without ORDER BY, the database may return rows in any order.',
    example: `SELECT DISTINCT category FROM products ORDER BY category;

SELECT name, price FROM products ORDER BY price DESC, name LIMIT 3;`, dataset: 'shop',
    traps: ['LIMIT without ORDER BY returns arbitrary rows.', 'Ties: "top 3" is ambiguous unless you add a tie-breaker column.', 'DISTINCT applies to the whole row, not just the first column.'],
    objectives: ['Sort with tie-breakers', 'Take the top N', 'Remove duplicate rows'] } },
  { id: 'f_filter', level: 0, name: 'WHERE: filtering with AND / OR / NOT', prereqs: ['f_select'], lesson: {
    idea: 'WHERE keeps only rows for which a condition is true. Comparisons: =, <> (not equal), <, <=, >, >=. Combine with AND (both true), OR (either true), NOT. AND is evaluated before OR, so use parentheses whenever you mix them. Dates are written as DATE \'2026-01-31\'.',
    example: `SELECT order_id, order_date, status
FROM orders
WHERE status = 'completed'
  AND (coupon_code = 'NEW10' OR order_date >= DATE '2026-03-01');`, dataset: 'shop',
    traps: ['a OR b AND c means a OR (b AND c) — add parentheses.', '"At least 600" is >= 600; "more than 600" is > 600. Re-read boundaries.'],
    objectives: ['Write precise conditions', 'Combine conditions safely'] } },
  { id: 'f_match', level: 0, name: 'IN, BETWEEN, LIKE / ILIKE', prereqs: ['f_filter'], lesson: {
    idea: 'IN (…) matches any value in a list. BETWEEN a AND b is inclusive on both ends. LIKE matches patterns: % = any characters, _ = one character; ILIKE is the case-insensitive version (PostgreSQL only — MySQL LIKE is usually case-insensitive already).',
    example: `SELECT name, cuisine FROM restaurants WHERE cuisine IN ('Biryani', 'Desserts');
SELECT name FROM restaurants WHERE name ILIKE '%burger%';`, dataset: 'food',
    traps: ["BETWEEN '2026-03-03' AND '2026-03-05' on a timestamp stops at 2026-03-05 00:00 — later that day is excluded. Use >= start AND < next_day.", 'LIKE is case-sensitive in PostgreSQL.'],
    objectives: ['Match lists, ranges and text patterns', 'Write safe date ranges'] } },
  { id: 'f_null', level: 0, name: 'NULL & COALESCE', prereqs: ['f_filter'], lesson: {
    idea: 'NULL means "unknown / missing" — not zero, not empty text. Any comparison with NULL (=, <>, >) is neither true nor false, so WHERE drops the row. Test with IS NULL / IS NOT NULL. COALESCE(a, b) returns the first value that isn\'t NULL — handy for defaults: COALESCE(tip, 0).',
    example: `SELECT name, COALESCE(city, 'Unknown') AS city
FROM customers
WHERE email IS NULL OR city IS NULL;`, dataset: 'shop',
    traps: ["col = NULL is never true.", "col <> 'x' also drops rows where col is NULL.", 'Replacing NULL with 0 changes averages — only do it when the business says missing means zero.'],
    objectives: ['Find and replace missing values correctly'] } },
  { id: 'f_case', level: 0, name: 'CASE WHEN (if / then logic)', prereqs: ['f_null'], lesson: {
    idea: 'CASE works like if / else-if / else: branches are checked top to bottom and the first true one wins. Without ELSE, unmatched rows get NULL. Use it to label and bucket rows.',
    example: `SELECT name, price,
       CASE WHEN price < 1000 THEN 'budget'
            WHEN price < 2500 THEN 'mid'
            ELSE 'premium' END AS band
FROM products;`, dataset: 'shop',
    traps: ['Branch order matters: put the most specific condition first.', 'NULL fails every comparison, so it falls through to ELSE unless you test IS NULL first.'],
    objectives: ['Build complete, non-overlapping buckets'] } },
  { id: 'f_functions', level: 0, name: 'Text functions', prereqs: ['f_select'], lesson: {
    idea: 'LOWER/UPPER change case, TRIM removes spaces, LENGTH counts characters, LEFT(s, n) takes the first n characters, REPLACE(s, a, b) swaps text, SPLIT_PART(s, \'@\', 2) splits on a delimiter, and || joins text together.',
    example: `SELECT name,
       LOWER(name) AS lower_name,
       SPLIT_PART(email, '@', 2) AS domain,
       LEFT(name, 1) || '.' AS initial
FROM customers;`, dataset: 'shop',
    traps: ["Joining text with NULL using || gives NULL.", 'Normalise case before comparing text from users.'],
    objectives: ['Clean and reshape text'] } },
  { id: 'f_math', level: 0, name: 'Math functions', prereqs: ['f_select', 'f_null'], lesson: {
    idea: 'ROUND(x, 2) rounds; CEIL rounds up, FLOOR rounds down; ABS removes the sign; % is the remainder. Integer ÷ integer drops the decimals in PostgreSQL (7/2 = 3), so write 100.0 * a / b for percentages.',
    example: `SELECT order_value, tip,
       ROUND(100.0 * tip / order_value, 1) AS tip_pct,
       CEIL(order_value / 100) * 100 AS rounded_up_to_100
FROM deliveries WHERE tip IS NOT NULL;`, dataset: 'food',
    traps: ['7 / 2 = 3 for integers.', 'Dividing by zero is an error; NULLIF(x, 0) avoids it.'],
    objectives: ['Round, scale and compute percentages'] } },
  { id: 'f_dates', level: 0, name: 'Dates & times', prereqs: ['f_filter'], lesson: {
    idea: 'date − date gives whole days. timestamp − timestamp gives an interval (e.g. 1 hour 10 mins); EXTRACT(EPOCH FROM interval) turns it into seconds. EXTRACT(HOUR FROM ts), EXTRACT(ISODOW FROM d) (1 = Monday … 7 = Sunday), DATE_TRUNC(\'month\', d) and TO_CHAR(d, \'YYYY-MM\') bucket dates. ::date drops the time part.',
    example: `SELECT delivery_id, ordered_at,
       ordered_at::date AS order_day,
       EXTRACT(HOUR FROM ordered_at) AS hour,
       EXTRACT(EPOCH FROM delivered_at - ordered_at) / 60 AS minutes_taken
FROM deliveries;`, dataset: 'food',
    traps: ['EXTRACT(MINUTE FROM interval) is only the minutes field (1h10m → 10), not total minutes.', 'DOW numbers Sunday 0; ISODOW numbers Sunday 7.', 'Use the stated "as of" date, not CURRENT_DATE, so results are reproducible.'],
    objectives: ['Compute durations', 'Bucket by hour, weekday and month'] } },
  { id: 'f_model', level: 0, name: 'Keys, relationships & grain', prereqs: ['f_filter'], lesson: {
    idea: 'A primary key (PK) uniquely identifies each row (order_id). A foreign key (FK) points to a row in another table (orders.customer_id → customers.customer_id). That creates relationships: one customer has many orders (one-to-many). The grain is what ONE row represents — one order, one order line, one payment attempt. Always check the grain before counting or summing; most wrong analytics answers start there.',
    example: `-- payments is one row per payment ATTEMPT, so an order can appear several times:
SELECT payment_id, order_id, status, paid_at
FROM payments
WHERE order_id = 1009
ORDER BY paid_at;`, dataset: 'shop',
    traps: ['Assuming one payment per order — the table stores attempts, including failures.'],
    objectives: ['State the grain of any table', 'Follow a foreign key by hand'] } },
  // Level 1
  { id: 'a_basic', level: 1, name: 'COUNT, SUM, AVG, MIN, MAX', prereqs: ['f_null'], lesson: {
    idea: 'Aggregates collapse many rows into one value. COUNT(*) counts rows; COUNT(col) counts non-NULL values; AVG ignores NULLs (so AVG(col) ≠ SUM(col)/COUNT(*) when NULLs exist).',
    example: `SELECT COUNT(*) AS trips, COUNT(fare) AS trips_with_fare, AVG(fare) AS avg_fare
FROM trips;`, dataset: 'rides',
    traps: ['Before aggregating, ask: what does one row represent? COUNT(*) after a join counts joined rows, not entities.'],
    objectives: ['Pick the right COUNT', 'Predict NULL effects on averages'] } },
  { id: 'a_groupby', level: 1, name: 'GROUP BY (multiple dimensions)', prereqs: ['a_basic'], lesson: {
    idea: 'GROUP BY produces one output row per distinct combination of the grouping columns. Every selected column must be grouped or aggregated. The output grain is the GROUP BY list.',
    example: `SELECT city, status, COUNT(*) AS trips
FROM trips
GROUP BY city, status
ORDER BY city, status;`, dataset: 'rides',
    traps: ['Selecting a non-grouped column is an error in PostgreSQL (MySQL may silently allow it with ONLY_FULL_GROUP_BY off).'],
    objectives: ['Choose grouping columns from the required output grain'] } },
  { id: 'a_having', level: 1, name: 'HAVING', prereqs: ['a_groupby'], lesson: {
    idea: 'WHERE filters rows before grouping; HAVING filters groups after aggregation. Filter as early as possible (WHERE), and use HAVING only for conditions on aggregates.',
    example: `SELECT customer_id, COUNT(*) AS completed_orders
FROM orders
WHERE status = 'completed'
GROUP BY customer_id
HAVING COUNT(*) >= 2;`, dataset: 'shop',
    traps: ['Aggregates in WHERE are an error.', 'Putting a row-level filter in HAVING changes semantics when it references grouped columns only by accident.'],
    objectives: ['Separate row filters from group filters'] } },
  { id: 'a_conditional', level: 1, name: 'Conditional aggregation', prereqs: ['a_groupby', 'f_case'], lesson: {
    idea: 'Count or sum only some rows inside one GROUP BY: SUM(CASE WHEN … THEN 1 ELSE 0 END), or PostgreSQL\'s cleaner COUNT(*) FILTER (WHERE …). This turns "rows by status" into "one row with a column per status" and is the basis of rates.',
    example: `SELECT city,
       COUNT(*) AS requests,
       COUNT(*) FILTER (WHERE status = 'completed') AS completed,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 1) AS completion_pct
FROM trips GROUP BY city;`, dataset: 'rides',
    traps: ['Integer division: 3/4 = 0. Multiply by 100.0 or cast to numeric first.', 'FILTER is PostgreSQL; MySQL uses SUM(CASE …).'],
    objectives: ['Compute rates in one pass', 'Avoid integer division'] } },
  { id: 'a_distinct', level: 1, name: 'COUNT DISTINCT & NULL behaviour', prereqs: ['a_basic'], lesson: {
    idea: 'COUNT(DISTINCT col) counts unique non-NULL values. It is how you count entities (users, customers) when the table grain is events or orders.',
    example: `SELECT COUNT(*) AS events, COUNT(DISTINCT user_id) AS users
FROM events WHERE event_name = 'login';`, dataset: 'saas',
    traps: ['COUNT(DISTINCT col) ignores NULL — a NULL group is not counted.'],
    objectives: ['Count entities from event-grain data'] } },
  // Level 2
  { id: 'j_inner', level: 2, name: 'INNER JOIN', prereqs: ['a_groupby'], lesson: {
    idea: 'INNER JOIN keeps pairs of rows that satisfy ON. Rows without a partner disappear. The result grain is the finer of the two sides when one side has many matches.',
    example: `SELECT o.order_id, c.name, o.status
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
ORDER BY o.order_id LIMIT 5;`, dataset: 'shop',
    traps: ['Silently losing rows that have no match.'],
    objectives: ['Write joins with explicit ON keys and aliases'] } },
  { id: 'j_left', level: 2, name: 'LEFT/RIGHT/FULL OUTER JOIN', prereqs: ['j_inner', 'f_null'], lesson: {
    idea: 'LEFT JOIN keeps every left row; unmatched right columns become NULL. A WHERE condition on a right-table column throws those NULL rows away — effectively an INNER JOIN. Put right-side filters in ON. FULL JOIN keeps unmatched rows from both sides.',
    example: `SELECT c.customer_id, c.name, COUNT(o.order_id) AS completed_orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status = 'completed'
GROUP BY c.customer_id, c.name
ORDER BY c.customer_id;`, dataset: 'shop',
    traps: ['WHERE right.col = … after LEFT JOIN drops unmatched rows.', 'COUNT(*) counts the NULL-padded row as 1; COUNT(right.key) counts 0.'],
    objectives: ['Keep entities with zero activity', 'Place filters in ON vs WHERE deliberately'] } },
  { id: 'j_fanout', level: 2, name: 'Grain, fan-out & many-to-many', prereqs: ['j_inner', 'a_basic'], lesson: {
    idea: 'Joining a one-to-many relationship repeats the "one" side for each match. Join two independent "many" tables to the same parent and you multiply them (items × payments). Fix: aggregate each child to the parent\'s grain first, then join.',
    example: `-- Safe: pre-aggregate each child table to order grain, then join
WITH items AS (SELECT order_id, SUM(quantity) AS units FROM order_items GROUP BY order_id),
     paid  AS (SELECT order_id, SUM(amount) AS paid FROM payments WHERE status='success' GROUP BY order_id)
SELECT o.order_id, i.units, p.paid
FROM orders o LEFT JOIN items i USING (order_id) LEFT JOIN paid p USING (order_id)
ORDER BY o.order_id;`, dataset: 'shop',
    traps: ['SUM after a fan-out join double counts.', 'COUNT(DISTINCT) can hide fan-out for counts but not for sums.'],
    objectives: ['Predict output row count before running a join', 'Pre-aggregate to the right grain'] } },
  { id: 'j_self', level: 2, name: 'SELF JOIN', prereqs: ['j_inner'], lesson: {
    idea: 'Join a table to itself with two aliases to compare rows within the same table: employee ↔ manager, event ↔ later event, customer ↔ referrer.',
    example: `SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.emp_id = e.manager_id;`, dataset: 'hr',
    traps: ['Forgetting that the top of a hierarchy has no manager (needs LEFT JOIN if it must appear).'],
    objectives: ['Model hierarchical and pairwise comparisons'] } },
  { id: 'j_cross', level: 2, name: 'CROSS JOIN & scaffolds', prereqs: ['j_left'], lesson: {
    idea: 'CROSS JOIN pairs every row with every row. Its main analytics use: build a complete scaffold (every city × every date) and LEFT JOIN facts onto it so missing combinations show as zero.',
    example: `SELECT c.city, d::date AS day
FROM (SELECT DISTINCT city FROM drivers WHERE city IS NOT NULL) c
CROSS JOIN generate_series(DATE '2026-02-01', DATE '2026-02-03', INTERVAL '1 day') d;`, dataset: 'rides',
    traps: ['Accidental cross joins (missing ON) explode row counts.'],
    objectives: ['Build complete grids so zeros appear'] } },
  { id: 'j_anti_semi', level: 2, name: 'Anti-joins & semi-joins', prereqs: ['j_left'], lesson: {
    idea: 'Semi-join: keep rows that HAVE a match (EXISTS) without multiplying them. Anti-join: keep rows with NO match (NOT EXISTS, or LEFT JOIN … WHERE right.key IS NULL).',
    example: `SELECT c.customer_id, c.name
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id);`, dataset: 'shop',
    traps: ['Using JOIN for "has any" multiplies rows.', 'NOT IN breaks if the subquery returns a NULL (covered in Level 3).'],
    objectives: ['Answer "never did X" and "did X at least once" questions cleanly'] } },
  { id: 'j_multi', level: 2, name: 'Multi-table joins & debugging', prereqs: ['j_left', 'j_fanout'], lesson: {
    idea: 'Add one table at a time and check the row count after each join. Write down the grain after every step. When a number looks too big, suspect fan-out; too small, suspect an INNER join or a WHERE on an outer-joined table.',
    example: `SELECT COUNT(*) FROM trips;                                            -- 20
SELECT COUNT(*) FROM trips t JOIN ratings r ON r.trip_id = t.trip_id; -- grain changed!`, dataset: 'rides',
    traps: ['Debugging the final query instead of each intermediate step.'],
    objectives: ['Debug joins incrementally'] } },
  // Level 3
  { id: 's_subquery', level: 3, name: 'Subqueries (scalar, IN, derived tables)', prereqs: ['a_groupby', 'f_filter'], lesson: {
    idea: 'A scalar subquery returns one value (compare against it). IN (subquery) tests membership. A subquery in FROM is a derived table — a temporary result you can query.',
    example: `SELECT name, price FROM products
WHERE price > (SELECT AVG(price) FROM products WHERE is_active);`, dataset: 'shop',
    traps: ['A "scalar" subquery that returns 2 rows errors at runtime.'],
    objectives: ['Compare rows with an aggregate of a set'] } },
  { id: 's_correlated', level: 3, name: 'Correlated subqueries', prereqs: ['s_subquery'], lesson: {
    idea: 'A correlated subquery references the outer row, so it is evaluated per row: "salary above MY department\'s average". Often replaceable by a window function or a pre-aggregated join.',
    example: `SELECT e.name, e.salary
FROM employees e
WHERE e.salary > (SELECT AVG(x.salary) FROM employees x WHERE x.dept_id = e.dept_id);`, dataset: 'hr',
    traps: ['Forgetting the correlation condition turns it into a global comparison.'],
    objectives: ['Compare a row with its own group'] } },
  { id: 's_exists', level: 3, name: 'EXISTS / NOT EXISTS / NOT IN pitfalls', prereqs: ['s_subquery', 'j_anti_semi'], lesson: {
    idea: 'x NOT IN (list) is NULL — not TRUE — if the list contains a NULL, so the whole filter returns nothing. NOT EXISTS has no such trap. Prefer NOT EXISTS for anti-joins.',
    example: `-- Safe anti-join
SELECT d.driver_id FROM drivers d
WHERE NOT EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = d.driver_id);`, dataset: 'rides',
    traps: ['NOT IN with a nullable subquery column.'],
    objectives: ['Write NULL-safe membership tests'] } },
  { id: 's_setops', level: 3, name: 'UNION, UNION ALL, INTERSECT, EXCEPT', prereqs: ['f_null', 'f_sort', 'a_basic'], lesson: {
    idea: 'Set operations stack result sets with the same column count/types. UNION removes duplicates (costs a sort); UNION ALL keeps them. INTERSECT keeps common rows; EXCEPT keeps rows in the first but not the second.',
    example: `SELECT home_city AS city FROM riders
INTERSECT
SELECT city FROM drivers;`, dataset: 'rides',
    traps: ['UNION when you needed UNION ALL silently drops legitimate duplicate rows (e.g. two equal transactions).'],
    objectives: ['Choose between UNION and UNION ALL deliberately'] } },
  // Level 4
  { id: 'c_cte', level: 4, name: 'CTEs: layered transformations', prereqs: ['s_subquery', 'j_left'], lesson: {
    idea: 'WITH name AS (…) names an intermediate result. Build analysis as a pipeline: base facts → per-entity metrics → final aggregation. Each CTE should have one clear grain. In PostgreSQL 12+ CTEs are inlined unless MATERIALIZED, so readability is mostly free.',
    example: `WITH per_customer AS (
  SELECT customer_id, COUNT(*) AS orders
  FROM orders WHERE status = 'completed' GROUP BY customer_id
)
SELECT orders, COUNT(*) AS customers
FROM per_customer GROUP BY orders ORDER BY orders;`, dataset: 'shop',
    traps: ['Mixing grains inside one CTE.'],
    objectives: ['Decompose a problem into named steps'] } },
  { id: 'c_recursive', level: 4, name: 'Recursive CTEs', prereqs: ['c_cte', 'j_self'], lesson: {
    idea: 'WITH RECURSIVE = anchor query UNION ALL a step that joins back to the CTE itself. It walks hierarchies (org charts, referral trees) or generates sequences. It stops when the step returns no rows — make sure it does.',
    example: `WITH RECURSIVE chain AS (
  SELECT emp_id, name, manager_id, 1 AS depth FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.emp_id, e.name, e.manager_id, c.depth + 1
  FROM employees e JOIN chain c ON e.manager_id = c.emp_id
)
SELECT * FROM chain ORDER BY depth, emp_id;`, dataset: 'hr',
    traps: ['A cycle in the data makes recursion infinite (the app stops queries after a few seconds).'],
    objectives: ['Traverse hierarchies of unknown depth'] } },
  // Level 5
  { id: 'w_ranking', level: 5, name: 'ROW_NUMBER, RANK, DENSE_RANK, top-N per group', prereqs: ['a_groupby', 'c_cte'], lesson: {
    idea: 'Window functions compute across related rows without collapsing them. ROW_NUMBER gives unique positions (ties broken arbitrarily unless you add tie-breakers); RANK leaves gaps after ties (1,1,3); DENSE_RANK doesn\'t (1,1,2). Filter on the rank in an outer query/CTE — not in WHERE of the same level.',
    example: `SELECT name, dept_id, salary,
       ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rn,
       RANK()       OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rnk,
       DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS drnk
FROM employees;`, dataset: 'hr',
    traps: ['Choosing ROW_NUMBER when the business rule says "include ties".', 'Filtering a window result in WHERE.'],
    objectives: ['Pick the ranking function from the tie rule'] } },
  { id: 'w_offset', level: 5, name: 'LAG / LEAD: previous & next events', prereqs: ['w_ranking'], lesson: {
    idea: 'LAG(col) reads the previous row in the window order; LEAD reads the next. With PARTITION BY user, you get "this user\'s previous event" — the basis of time-between-events, churn gaps and sequence analysis.',
    example: `SELECT rider_id, trip_id, requested_at,
       LAG(requested_at) OVER (PARTITION BY rider_id ORDER BY requested_at) AS prev_request
FROM trips ORDER BY rider_id, requested_at;`, dataset: 'rides',
    traps: ['Forgetting PARTITION BY compares across different users.'],
    objectives: ['Compute time between consecutive events per entity'] } },
  { id: 'w_aggregate', level: 5, name: 'Running totals & % of total', prereqs: ['w_ranking'], lesson: {
    idea: 'SUM(x) OVER (ORDER BY d) is a running total; SUM(x) OVER () is the grand total on every row, so x / SUM(x) OVER () is a share of total. You can window over an aggregate: SUM(SUM(x)) OVER (…).',
    example: `SELECT category, SUM(quantity * unit_price) AS revenue,
       ROUND(100.0 * SUM(quantity * unit_price) / SUM(SUM(quantity * unit_price)) OVER (), 2) AS pct
FROM order_items JOIN products USING (product_id)
GROUP BY category;`, dataset: 'shop',
    traps: ['With ORDER BY, the default frame is RANGE … CURRENT ROW, so rows with equal sort keys are summed together.'],
    objectives: ['Running totals at the right grain', 'Shares of total'] } },
  { id: 'w_frames', level: 5, name: 'Window frames, moving averages, FIRST/LAST_VALUE', prereqs: ['w_aggregate'], lesson: {
    idea: 'ROWS BETWEEN 2 PRECEDING AND CURRENT ROW defines a moving window by row count — only correct as "3 days" if there is exactly one row per day (build a date spine first). LAST_VALUE needs ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING, otherwise it returns the current row.',
    example: `SELECT txn_id, account_id, amount,
       AVG(amount) OVER (PARTITION BY account_id ORDER BY txn_time
                         ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS ma3
FROM transactions;`, dataset: 'bank',
    traps: ['Row-based frames over gappy dates.', 'LAST_VALUE with the default frame.'],
    objectives: ['Control frames explicitly'] } },
  { id: 'w_gaps', level: 5, name: 'Gaps & islands', prereqs: ['w_offset', 'x_dedup'], lesson: {
    idea: 'Consecutive runs: for dates in a run, date − ROW_NUMBER() is constant. Group by that key to get each island\'s start, end and length. Deduplicate first — duplicates break the arithmetic.',
    example: `WITH d AS (SELECT DISTINCT user_id, activity_date FROM user_activity)
SELECT user_id, activity_date,
       activity_date - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_date))::int AS island_key
FROM d ORDER BY user_id, activity_date;`, dataset: 'saas',
    traps: ['Duplicate dates within a user.'],
    objectives: ['Find streaks and runs'] } },
  // Level 6
  { id: 'x_dates', level: 6, name: 'Date/time analysis & date spines', prereqs: ['f_dates', 'j_cross'], lesson: {
    idea: 'generate_series(start, end, interval) creates a calendar; LEFT JOIN facts onto it so empty periods show zero. DATE_TRUNC buckets timestamps; intervals do arithmetic. Always state the time window and its boundaries explicitly.',
    example: `SELECT d::date AS day, COUNT(t.trip_id) AS trips
FROM generate_series(DATE '2026-02-01', DATE '2026-02-07', INTERVAL '1 day') d
LEFT JOIN trips t ON t.requested_at::date = d::date
GROUP BY d ORDER BY d;`, dataset: 'rides',
    traps: ['Missing periods vanish from GROUP BY output.', 'Off-by-one on inclusive end dates.'],
    objectives: ['Produce complete time series'] } },
  { id: 'x_dedup', level: 6, name: 'Deduplication', prereqs: ['w_ranking'], lesson: {
    idea: 'Define what "duplicate" means (same key? same values within N minutes?), pick a survivor rule (earliest, latest, most complete), then ROW_NUMBER() … = 1 or DISTINCT ON (PostgreSQL).',
    example: `SELECT DISTINCT ON (user_id, event_name) user_id, event_name, event_time
FROM events
ORDER BY user_id, event_name, event_time;  -- first occurrence of each event per user`, dataset: 'saas',
    traps: ['DISTINCT ON keeps the first row by the ORDER BY — the ORDER BY must start with the DISTINCT ON columns.'],
    objectives: ['Write explicit survivor rules'] } },
  { id: 'x_percentile', level: 6, name: 'Percentiles & median', prereqs: ['a_groupby'], lesson: {
    idea: 'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x) is the interpolated median; PERCENTILE_DISC returns an actual value. They are ordered-set aggregates (use with GROUP BY, not OVER). MySQL has no direct equivalent.',
    example: `SELECT city, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fare) AS median_fare
FROM trips WHERE status = 'completed' GROUP BY city;`, dataset: 'rides',
    traps: ['Mean ≠ median when data is skewed.', 'PERCENTILE_CONT returns double precision — cast before ROUND.'],
    objectives: ['Describe distributions robustly'] } },
  { id: 'x_json', level: 6, name: 'JSONB, arrays & string aggregation', prereqs: ['a_groupby'], lesson: {
    idea: "->> extracts a JSON field as text; -> keeps it as JSON. Missing keys return NULL. STRING_AGG(x, ', ' ORDER BY x) concatenates; ARRAY_AGG builds arrays; UNNEST expands them back to rows.",
    example: `SELECT event_name, properties ->> 'device' AS device, COUNT(*)
FROM events GROUP BY 1, 2 ORDER BY 1, 2;`, dataset: 'saas',
    traps: ['A NULL properties column and a missing key both produce NULL.'],
    objectives: ['Query semi-structured columns'] } },
  { id: 'x_lateral', level: 6, name: 'LATERAL joins', prereqs: ['s_correlated', 'w_ranking'], lesson: {
    idea: 'JOIN LATERAL (subquery) lets the subquery reference columns of earlier tables — like a correlated subquery that can return several rows and columns. Classic use: "top 2 orders for each customer".',
    example: `SELECT c.name, last_o.order_id, last_o.order_date
FROM customers c
CROSS JOIN LATERAL (
  SELECT order_id, order_date FROM orders o
  WHERE o.customer_id = c.customer_id ORDER BY order_date DESC LIMIT 1
) last_o;`, dataset: 'shop',
    traps: ['CROSS JOIN LATERAL drops outer rows with no results; use LEFT JOIN LATERAL … ON true to keep them.'],
    objectives: ['Per-row top-N and dependent subqueries'] } },
  { id: 'x_pivot', level: 6, name: 'Pivot & unpivot', prereqs: ['a_conditional'], lesson: {
    idea: 'Pivot = conditional aggregation: one column per category value. Unpivot = UNION ALL or VALUES/LATERAL to turn columns into rows. Standard SQL has no dynamic pivot — you list the columns.',
    example: `SELECT city,
       COUNT(*) FILTER (WHERE status = 'completed') AS completed,
       COUNT(*) FILTER (WHERE status LIKE 'cancelled%') AS cancelled
FROM trips GROUP BY city;`, dataset: 'rides',
    traps: ['Forgetting that categories absent from the data still need a column (with 0).'],
    objectives: ['Reshape long ↔ wide'] } },
  // Level 7
  { id: 'an_funnel', level: 7, name: 'Funnels & conversion', prereqs: ['a_conditional', 'c_cte', 'j_left'], lesson: {
    idea: 'Define each step precisely (which event, first occurrence?), whether steps must happen in order, and the denominator (all entrants vs previous step). Compute per-user step timestamps first, then aggregate.',
    example: `SELECT user_id,
       MIN(event_time) FILTER (WHERE event_name = 'signup') AS signup_at,
       MIN(event_time) FILTER (WHERE event_name = 'create_project') AS project_at
FROM events GROUP BY user_id ORDER BY user_id;`, dataset: 'saas',
    traps: ['Counting users who did a later step without the earlier one.', 'Mixing "% of start" and "% of previous step".'],
    objectives: ['Write precise metric definitions before SQL'] } },
  { id: 'an_cohort', level: 7, name: 'Cohorts & retention', prereqs: ['x_dates', 'c_cte', 'a_distinct'], lesson: {
    idea: 'A cohort groups users by when they started. Retention in period N = users active in period N ÷ cohort size. Periods that haven\'t fully happened yet are not 0% — they are unknown.',
    example: `SELECT DATE_TRUNC('month', signup_date)::date AS cohort, COUNT(*) AS users
FROM users GROUP BY 1 ORDER BY 1;`, dataset: 'saas',
    traps: ['Reporting immature cohorts as 0% retention.', 'Using a rolling window when the spec says calendar month.'],
    objectives: ['Build cohort tables'] } },
  { id: 'an_churn', level: 7, name: 'Churn & subscription metrics', prereqs: ['x_dates', 'c_cte'], lesson: {
    idea: 'Define "active" (on a date) and the unit (customer vs subscription). Churn rate = customers active at period start who are not active at next period start ÷ active at start. Plan changes are not churn at the customer level.',
    example: `SELECT user_id, start_date, end_date FROM subscriptions ORDER BY user_id, start_date;`, dataset: 'saas',
    traps: ['Counting a plan change as churn.', 'Wrong denominator (end of period instead of start).'],
    objectives: ['Define active/churn precisely'] } },
  { id: 'an_session', level: 7, name: 'Sessionization & event sequences', prereqs: ['w_offset', 'w_aggregate'], lesson: {
    idea: 'Mark a row as a session start when the gap from the previous event (LAG) exceeds the timeout; a running SUM of those flags numbers the sessions. Then aggregate per session.',
    example: `SELECT user_id, viewed_at,
       viewed_at - LAG(viewed_at) OVER (PARTITION BY user_id ORDER BY viewed_at) AS gap
FROM page_views ORDER BY user_id, viewed_at;`, dataset: 'saas',
    traps: ['Splitting sessions at midnight.', 'Off-by-one on the timeout boundary (> vs >=).'],
    objectives: ['Turn event streams into sessions'] } },
  { id: 'an_rolling', level: 7, name: 'Rolling metrics & time series', prereqs: ['x_dates', 'w_frames', 'a_distinct'], lesson: {
    idea: 'Rolling sums/averages can use window frames over a complete date spine. Rolling DISTINCT counts (7-day active users) cannot use COUNT(DISTINCT) OVER in PostgreSQL — join each day to the activity in its window instead.',
    example: `SELECT d::date AS day
FROM generate_series(DATE '2026-03-01', DATE '2026-03-03', INTERVAL '1 day') d;`, dataset: 'saas',
    traps: ['Summing daily distinct users to get weekly distinct users.'],
    objectives: ['Rolling metrics with correct definitions'] } },
  { id: 'an_segment', level: 7, name: 'Customer segmentation', prereqs: ['f_case', 'j_left', 'c_cte'], lesson: {
    idea: 'Compute per-entity features (recency, frequency, monetary) at a fixed as-of date, then apply ordered business rules with CASE. Rule precedence is part of the spec — confirm it.',
    example: `SELECT customer_id, COUNT(*) AS orders, MAX(order_date) AS last_order
FROM orders WHERE status = 'completed' GROUP BY customer_id;`, dataset: 'shop',
    traps: ['Using CURRENT_DATE instead of the stated as-of date.', 'Overlapping rules evaluated in the wrong order.'],
    objectives: ['Translate business rules into deterministic logic'] } },
  { id: 'an_anomaly', level: 7, name: 'Anomaly & fraud signals', prereqs: ['w_frames'], lesson: {
    idea: 'Compare each event with that entity\'s own history (prior average, prior max, time since last). Exclude the current row from its own baseline, and require a minimum history before flagging.',
    example: `SELECT txn_id, account_id, amount,
       AVG(amount) OVER (PARTITION BY account_id ORDER BY txn_time
                         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior_avg
FROM transactions;`, dataset: 'bank',
    traps: ['Including the current row in its own baseline.'],
    objectives: ['Build per-entity baselines'] } },
  { id: 'an_conversion', level: 7, name: 'Time-bound conversion & attribution', prereqs: ['an_funnel', 'an_cohort'], lesson: {
    idea: '"Converted within N days of X" needs: the anchor event (first X), a window (X, X + N days], and an eligibility rule for anchors too recent to have a full window.',
    example: `SELECT user_id, MIN(event_time) AS first_invite
FROM events WHERE event_name = 'invite_teammate' GROUP BY user_id;`, dataset: 'saas',
    traps: ['Including users whose window has not finished.'],
    objectives: ['Handle censoring/immature windows'] } },
];

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map(t => [t.id, t]));

// Error category used when a mistake can't be pinned more precisely.
export const TOPIC_CATEGORY = {
  f_intro: 'Logic', f_sort: 'Logic', f_match: 'Logic', f_math: 'Logic', f_dates: 'Dates/time',
  f_model: 'Problem decomposition', f_select: 'Logic', f_filter: 'Logic', f_null: 'NULL handling', f_case: 'Logic', f_functions: 'Logic',
  a_basic: 'Aggregation', a_groupby: 'Aggregation', a_having: 'Aggregation', a_conditional: 'Aggregation', a_distinct: 'Aggregation',
  j_inner: 'Joins', j_left: 'Joins', j_fanout: 'Joins', j_self: 'Joins', j_cross: 'Joins', j_anti_semi: 'Joins', j_multi: 'Joins',
  s_subquery: 'Logic', s_correlated: 'Logic', s_exists: 'NULL handling', s_setops: 'Logic', c_cte: 'Problem decomposition', c_recursive: 'Logic',
  w_ranking: 'Window functions', w_offset: 'Window functions', w_aggregate: 'Window functions', w_frames: 'Window functions', w_gaps: 'Window functions',
  x_dates: 'Dates/time', x_dedup: 'Edge cases', x_percentile: 'Aggregation', x_json: 'Logic', x_lateral: 'Joins', x_pivot: 'Aggregation',
  an_funnel: 'Business logic', an_cohort: 'Business logic', an_churn: 'Business logic', an_session: 'Window functions', an_rolling: 'Dates/time',
  an_segment: 'Business logic', an_anomaly: 'Business logic', an_conversion: 'Business logic',
};

export const ERROR_CATEGORIES = ['Syntax', 'Logic', 'Joins', 'Aggregation', 'NULL handling', 'Window functions', 'Dates/time',
  'Business logic', 'Problem decomposition', 'Edge cases', 'Performance'];

export const PROCESS_STEPS = [
  'Understood the business question', 'Defined the required output', 'Identified table grain', 'Identified relevant tables',
  'Understood relationships', 'Considered duplicates', 'Considered NULLs', 'Broke the problem into steps',
  'Chose the technique deliberately', 'Validated the result', 'Tested edge cases', 'Considered performance'];

// Problem bank (part B: Levels 4–7, including capstones).
export const PROBLEMS_B = [
  {
    id: 'P040', v: 1, title: 'First-purchase cohorts', dataset: 'shop', difficulty: 'Medium', topics: ['c_cte', 'a_groupby'],
    skills: 'Layered CTEs: entity metrics → cohort metrics', domain: 'E-commerce', diagnostic: true, timeTarget: 12,
    prompt: 'Group customers by the month of their FIRST completed order. For each such month, report the number of customers and their average lifetime completed spend (sum of quantity × unit price across all their completed orders), rounded to 2 decimals.\n\nShow the month as `YYYY-MM`. Sort by month.',
    output: ['first_month', 'customers', 'avg_lifetime_spend'], orderMatters: true,
    solution: `WITH order_totals AS (
  SELECT o.customer_id, o.order_id, o.order_date, SUM(oi.quantity * oi.unit_price) AS total
  FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
  WHERE o.status = 'completed'
  GROUP BY o.customer_id, o.order_id, o.order_date
), per_customer AS (
  SELECT customer_id, MIN(order_date) AS first_order, SUM(total) AS lifetime_spend
  FROM order_totals GROUP BY customer_id
)
SELECT TO_CHAR(first_order, 'YYYY-MM') AS first_month, COUNT(*) AS customers, ROUND(AVG(lifetime_spend), 2) AS avg_lifetime_spend
FROM per_customer
GROUP BY 1 ORDER BY 1;`,
    tests: [
      { name: 'Cancelled order before the first purchase', category: 'Business logic', why: 'Only completed orders define the first purchase.',
        patch: `INSERT INTO orders VALUES (1018,9,'2026-01-03','cancelled',NULL); INSERT INTO order_items VALUES (1018,102,1,3499);` },
    ],
    hints: ['Work at two grains: first one row per customer, then one row per month.', 'CTE 1: per customer first completed order date and total completed spend. CTE 2/final: group those customers by month.', 'per_customer AS (SELECT customer_id, MIN(order_date), SUM(quantity*unit_price) … WHERE status=\'completed\' GROUP BY customer_id) then GROUP BY TO_CHAR(first_order,\'YYYY-MM\')'],
    explain: 'Computing customer-grain metrics first, then aggregating customers, keeps each step at one clear grain.',
    trap: `WITH f AS (SELECT customer_id, MIN(order_date) AS first_order FROM orders GROUP BY customer_id), s AS (SELECT o.customer_id, SUM(oi.quantity*oi.unit_price) AS spend FROM orders o JOIN order_items oi ON oi.order_id=o.order_id WHERE o.status='completed' GROUP BY o.customer_id) SELECT TO_CHAR(f.first_order,'YYYY-MM') AS first_month, COUNT(*) AS customers, ROUND(AVG(s.spend),2) AS avg_lifetime_spend FROM f JOIN s USING (customer_id) GROUP BY 1 ORDER BY 1;`,
    techniques: ['with\\s+\\w+\\s+as'], patterns: ['first_last_event'],
  },
  {
    id: 'P041', v: 1, title: 'Reporting lines', dataset: 'hr', difficulty: 'Hard', topics: ['c_recursive'],
    skills: 'Recursive CTE + path building', domain: 'HR', timeTarget: 15,
    prompt: 'Build the full reporting line for every employee: their depth in the hierarchy (the top person is 1) and the chain of names from the top down, joined with ` > ` (e.g. `Nandini > Arvind > Pooja`).\n\nSort by path.',
    output: ['emp_id', 'name', 'depth', 'path'], orderMatters: true,
    solution: `WITH RECURSIVE org AS (
  SELECT emp_id, name, 1 AS depth, name::text AS path
  FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.emp_id, e.name, o.depth + 1, o.path || ' > ' || e.name
  FROM employees e JOIN org o ON e.manager_id = o.emp_id
)
SELECT emp_id, name, depth, path FROM org ORDER BY path;`,
    tests: [
      { name: 'A deeper level', category: 'Logic', why: 'The hierarchy depth is not fixed; a fixed number of self-joins breaks.',
        patch: `INSERT INTO employees VALUES (17,'Kriti',1,3,'Engineer',90000,'2025-09-01'),(18,'Lalit',1,17,'Intern',30000,'2026-01-05');` },
    ],
    hints: ['The number of levels is unknown in advance.', 'Start from the person with no manager, then repeatedly attach direct reports to the rows found so far.', 'WITH RECURSIVE org AS (anchor WHERE manager_id IS NULL UNION ALL SELECT … FROM employees e JOIN org o ON e.manager_id = o.emp_id)'],
    explain: 'The anchor seeds the top of the tree; each recursive step adds one level and extends the path. Recursion stops when no new reports are found.',
    trap: `SELECT e.emp_id, e.name, CASE WHEN m.emp_id IS NULL THEN 1 ELSE 2 END AS depth, COALESCE(m.name || ' > ', '') || e.name AS path FROM employees e LEFT JOIN employees m ON m.emp_id = e.manager_id ORDER BY path;`,
    techniques: ['with\\s+recursive'], patterns: ['hierarchy'],
  },
  {
    id: 'P042', v: 1, title: 'Referral roots', dataset: 'shop', difficulty: 'Hard', topics: ['c_recursive'],
    skills: 'Recursive traversal', domain: 'E-commerce', timeTarget: 14,
    prompt: 'Growth wants to credit the original referrer. For every customer, return the root of their referral chain (the customer at the top who was not referred by anyone — a customer who was not referred is their own root) and how many referral hops separate them from that root (0 for roots).\n\nSort by customer_id.',
    output: ['customer_id', 'root_referrer_id', 'depth'], orderMatters: true,
    solution: `WITH RECURSIVE chain AS (
  SELECT customer_id, customer_id AS root_id, 0 AS depth FROM customers WHERE referred_by IS NULL
  UNION ALL
  SELECT c.customer_id, ch.root_id, ch.depth + 1
  FROM customers c JOIN chain ch ON c.referred_by = ch.customer_id
)
SELECT customer_id, root_id AS root_referrer_id, depth FROM chain ORDER BY customer_id;`,
    tests: [
      { name: 'Three-hop chain', category: 'Logic', why: 'Chains can be arbitrarily long.',
        patch: `INSERT INTO customers VALUES (11,'Lata','lata@mail.com','Pune','2026-03-20',9),(12,'Mohan','mohan@mail.com','Pune','2026-03-28',11);` },
    ],
    hints: ['Start from customers who were not referred, then walk down to the people they referred.', 'Carry the root id and a depth counter through each recursive step.', 'Anchor: SELECT customer_id, customer_id AS root_id, 0 … WHERE referred_by IS NULL; Step: JOIN customers c ON c.referred_by = chain.customer_id'],
    explain: 'Walking top-down from roots lets you carry the root id unchanged while incrementing depth.',
    trap: `SELECT c.customer_id, COALESCE(c.referred_by, c.customer_id) AS root_referrer_id, CASE WHEN c.referred_by IS NULL THEN 0 ELSE 1 END AS depth FROM customers c ORDER BY c.customer_id;`,
    techniques: ['with\\s+recursive'], patterns: ['hierarchy'],
  },
  // Level 5
  {
    id: 'P050', v: 1, title: 'Runner-up salaries', dataset: 'hr', difficulty: 'Medium', topics: ['w_ranking'],
    skills: 'DENSE_RANK + ties', domain: 'HR', diagnostic: true, timeTarget: 10,
    prompt: 'For each department, identify the employee(s) whose compensation ranks second after accounting for ties — i.e. those earning the second-highest distinct salary in their department. If several people share that salary, return all of them. Departments with fewer than two distinct salary levels have no row.\n\nSort by department name, then employee name.',
    output: ['dept_name', 'name', 'salary'], orderMatters: true,
    solution: `WITH ranked AS (
  SELECT d.dept_name, e.name, e.salary,
         DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS rnk
  FROM employees e JOIN departments d ON d.dept_id = e.dept_id
)
SELECT dept_name, name, salary FROM ranked WHERE rnk = 2 ORDER BY dept_name, name;`,
    tests: [
      { name: 'Tie at the top', category: 'Window functions', why: 'Two people sharing the highest salary are both first; second-highest is the next distinct salary.',
        patch: `INSERT INTO employees VALUES (17,'Neel',4,1,'Finance Manager',150000,'2021-05-01');` },
    ],
    hints: ['"Second after accounting for ties" says something about how equal salaries are numbered.', 'Compare ROW_NUMBER, RANK and DENSE_RANK on 300, 200, 200, 100: which gives 100 a "2"? Which gives 200 a "2"?', 'DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) … WHERE rnk = 2 (in an outer query)'],
    explain: 'DENSE_RANK gives equal salaries the same rank with no gaps, so rank 2 is always the second distinct level. RANK would skip to 3 after a tie at the top.',
    trap: `WITH r AS (SELECT d.dept_name, e.name, e.salary, ROW_NUMBER() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS rn FROM employees e JOIN departments d ON d.dept_id=e.dept_id) SELECT dept_name, name, salary FROM r WHERE rn = 2 ORDER BY dept_name, name;`,
    techniques: ['dense_rank'], patterns: ['nth_highest', 'top_n_per_group'],
  },
  {
    id: 'P051', v: 1, title: 'Category champions', dataset: 'shop', difficulty: 'Medium', topics: ['w_ranking', 'a_groupby'],
    skills: 'Aggregate then rank with ties', domain: 'E-commerce', timeTarget: 10,
    prompt: 'For each product category, find the best-selling product by completed-order revenue (quantity × unit price). If products tie for the top spot, return all of them.\n\nSort by category, then product name.',
    output: ['category', 'product_name', 'revenue'], orderMatters: true,
    solution: `WITH rev AS (
  SELECT p.category, p.product_id, p.name AS product_name, SUM(oi.quantity * oi.unit_price) AS revenue
  FROM order_items oi
  JOIN orders o ON o.order_id = oi.order_id AND o.status = 'completed'
  JOIN products p ON p.product_id = oi.product_id
  GROUP BY p.category, p.product_id, p.name
), ranked AS (
  SELECT *, RANK() OVER (PARTITION BY category ORDER BY revenue DESC) AS rk FROM rev
)
SELECT category, product_name, revenue FROM ranked WHERE rk = 1 ORDER BY category, product_name;`,
    tests: [
      { name: 'Tie for top revenue', category: 'Window functions', why: 'Ties must all be returned.',
        patch: `INSERT INTO products VALUES (109,'Rowing Band','Fitness',2999,true); INSERT INTO orders VALUES (1018,10,'2026-04-15','completed',NULL); INSERT INTO order_items VALUES (1018,109,1,2999);` },
    ],
    hints: ['Two steps: total revenue per product, then pick the top within each category.', 'Which ranking function keeps all tied rows at position 1?', 'RANK() OVER (PARTITION BY category ORDER BY revenue DESC) = 1, computed over a per-product aggregate'],
    explain: 'Aggregate to product grain first, then rank within category. RANK (or DENSE_RANK) = 1 keeps ties; ROW_NUMBER would drop one arbitrarily.',
    trap: `WITH rev AS (SELECT p.category, p.name AS product_name, SUM(oi.quantity*oi.unit_price) AS revenue FROM order_items oi JOIN orders o ON o.order_id=oi.order_id AND o.status='completed' JOIN products p ON p.product_id=oi.product_id GROUP BY 1,2), r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC) rn FROM rev) SELECT category, product_name, revenue FROM r WHERE rn=1 ORDER BY 1,2;`,
    techniques: ['rank\\s*\\(|dense_rank'], patterns: ['top_n_per_group'],
  },
  {
    id: 'P052', v: 1, title: 'Days between purchases', dataset: 'shop', difficulty: 'Medium', topics: ['w_offset'],
    skills: 'LAG within partition', domain: 'E-commerce', diagnostic: true, timeTarget: 9,
    prompt: 'For every completed order, show how many days have passed since the same customer\'s previous completed order (NULL for a customer\'s first). If a customer has two orders on the same date, order them by order_id.\n\nSort by customer_id, order_date, order_id.',
    output: ['customer_id', 'order_id', 'order_date', 'days_since_prev'], orderMatters: true,
    solution: `SELECT customer_id, order_id, order_date,
       order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS days_since_prev
FROM orders
WHERE status = 'completed'
ORDER BY customer_id, order_date, order_id;`,
    tests: [
      { name: 'Two orders on the same day', category: 'Edge cases', why: 'The gap should be 0, and ordering must be deterministic.',
        patch: `INSERT INTO orders VALUES (1018,1,'2026-04-02','completed',NULL);` },
    ],
    hints: ['Each row needs a value from another row of the same customer.', 'A window function can read the previous row in an ordered partition.', 'order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date, order_id)'],
    explain: 'LAG over a per-customer partition fetches the previous order; date − date yields integer days in PostgreSQL (MySQL: DATEDIFF).',
    trap: `SELECT customer_id, order_id, order_date, order_date - LAG(order_date) OVER (ORDER BY order_date) AS days_since_prev FROM orders WHERE status='completed' ORDER BY customer_id, order_date, order_id;`,
    techniques: ['lag\\s*\\('], patterns: ['prev_next'],
  },
  {
    id: 'P053', v: 1, title: 'Cumulative revenue', dataset: 'shop', difficulty: 'Medium', topics: ['w_aggregate'],
    skills: 'Aggregate then running total', domain: 'E-commerce', timeTarget: 9,
    prompt: 'Build a daily revenue table for completed orders: one row per date that had completed revenue, with that day\'s revenue (quantity × unit price) and the running total up to and including that day.\n\nSort by date.',
    output: ['order_date', 'daily_revenue', 'running_revenue'], orderMatters: true,
    solution: `WITH daily AS (
  SELECT o.order_date, SUM(oi.quantity * oi.unit_price) AS daily_revenue
  FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
  WHERE o.status = 'completed'
  GROUP BY o.order_date
)
SELECT order_date, daily_revenue, SUM(daily_revenue) OVER (ORDER BY order_date) AS running_revenue
FROM daily ORDER BY order_date;`,
    tests: [
      { name: 'Two orders on one date', category: 'Window functions', why: 'The output grain is one row per date.',
        patch: `INSERT INTO orders VALUES (1018,10,'2026-03-05','completed',NULL); INSERT INTO order_items VALUES (1018,101,1,799);` },
    ],
    hints: ['First get to the required grain (one row per date), then accumulate.', 'SUM(x) OVER (ORDER BY date) gives a running total.', 'CTE daily: GROUP BY order_date; then SUM(daily_revenue) OVER (ORDER BY order_date)'],
    explain: 'Aggregating to date grain before the window avoids duplicate rows and the RANGE frame surprises that come from duplicate sort keys.',
    trap: `SELECT o.order_date, oi.quantity*oi.unit_price AS daily_revenue, SUM(oi.quantity*oi.unit_price) OVER (ORDER BY o.order_date) AS running_revenue FROM orders o JOIN order_items oi ON oi.order_id=o.order_id WHERE o.status='completed' ORDER BY o.order_date;`,
    techniques: ['sum\\s*\\([^)]*\\)\\s*over'], patterns: ['running_total'],
  },
  {
    id: 'P054', v: 1, title: 'Category revenue share', dataset: 'shop', difficulty: 'Medium', topics: ['w_aggregate', 'a_groupby'],
    skills: 'Share of total', domain: 'E-commerce', timeTarget: 8,
    prompt: 'For completed orders, show each category\'s revenue (quantity × unit price) and its share of total completed revenue as a percentage rounded to 2 decimals.\n\nSort by revenue, highest first.',
    output: ['category', 'revenue', 'pct_of_total'], orderMatters: true,
    solution: `SELECT p.category,
       SUM(oi.quantity * oi.unit_price) AS revenue,
       ROUND(100.0 * SUM(oi.quantity * oi.unit_price) / SUM(SUM(oi.quantity * oi.unit_price)) OVER (), 2) AS pct_of_total
FROM order_items oi
JOIN orders o ON o.order_id = oi.order_id
JOIN products p ON p.product_id = oi.product_id
WHERE o.status = 'completed'
GROUP BY p.category
ORDER BY revenue DESC;`,
    tests: [
      { name: 'Large pending order', category: 'Business logic', why: 'Numerator and denominator must use the same population.',
        patch: `INSERT INTO orders VALUES (1018,10,'2026-04-15','pending',NULL); INSERT INTO order_items VALUES (1018,102,5,3499);` },
    ],
    hints: ['The denominator is one number shared by all rows.', 'You can window over an aggregate: SUM(SUM(x)) OVER ().', 'ROUND(100.0 * SUM(rev) / SUM(SUM(rev)) OVER (), 2)'],
    explain: 'SUM(SUM(x)) OVER () places the grand total on each grouped row, guaranteeing the same filtered population.',
    trap: `SELECT p.category, SUM(oi.quantity*oi.unit_price) AS revenue, ROUND(100.0*SUM(oi.quantity*oi.unit_price)/(SELECT SUM(quantity*unit_price) FROM order_items),2) AS pct_of_total FROM order_items oi JOIN orders o ON o.order_id=oi.order_id JOIN products p ON p.product_id=oi.product_id WHERE o.status='completed' GROUP BY p.category ORDER BY revenue DESC;`,
    techniques: ['over\\s*\\(\\s*\\)'], patterns: ['pct_of_total'],
  },
  {
    id: 'P055', v: 1, title: 'Three-day revenue trend', dataset: 'rides', difficulty: 'Hard', topics: ['w_frames', 'x_dates'],
    skills: 'Date spine + ROWS frame', domain: 'Ride-sharing', timeTarget: 18,
    prompt: 'For each city that appears in trips and each date from 2026-02-01 to 2026-02-07, report completed-trip fare revenue for that date (0 if none) and the 3-day moving average: the average of that date and the two previous CALENDAR days (for the first dates of the range, average over the days available in the range). Round the average to 2 decimals.\n\nUse the trip\'s city and request date. Sort by city, then date.',
    output: ['city', 'trip_date', 'daily_revenue', 'ma_3d'], orderMatters: true,
    solution: `WITH cities AS (SELECT DISTINCT city FROM trips),
days AS (SELECT d::date AS trip_date FROM generate_series(DATE '2026-02-01', DATE '2026-02-07', INTERVAL '1 day') d),
daily AS (
  SELECT c.city, dy.trip_date, COALESCE(SUM(t.fare), 0) AS daily_revenue
  FROM cities c CROSS JOIN days dy
  LEFT JOIN trips t ON t.city = c.city AND t.requested_at::date = dy.trip_date AND t.status = 'completed'
  GROUP BY c.city, dy.trip_date
)
SELECT city, trip_date, daily_revenue,
       ROUND(AVG(daily_revenue) OVER (PARTITION BY city ORDER BY trip_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS ma_3d
FROM daily ORDER BY city, trip_date;`,
    tests: [
      { name: 'City with only cancelled trips', category: 'Dates/time', why: 'Every city/date pair must exist, with zeros.',
        patch: `INSERT INTO trips VALUES (521,7,NULL,'Pune','2026-02-04 10:00','cancelled_rider',NULL,NULL);` },
    ],
    hints: ['"Previous two calendar days" and "previous two rows" only mean the same thing if every day has exactly one row.', 'Build a complete city × date grid first, then apply a row-based frame.', 'cities CROSS JOIN generate_series(…) LEFT JOIN trips … then AVG(daily_revenue) OVER (PARTITION BY city ORDER BY trip_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)'],
    explain: 'A date spine makes rows equal calendar days, so a ROWS frame of 2 PRECEDING means two calendar days. Alternative: a RANGE frame with INTERVAL \'2 days\' PRECEDING over the spine.',
    trap: `WITH daily AS (SELECT city, requested_at::date AS trip_date, SUM(fare) AS daily_revenue FROM trips WHERE status='completed' GROUP BY 1,2) SELECT city, trip_date, daily_revenue, ROUND(AVG(daily_revenue) OVER (PARTITION BY city ORDER BY trip_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW),2) AS ma_3d FROM daily ORDER BY 1,2;`,
    techniques: ['rows\\s+between|range\\s+between'], patterns: ['rolling_avg', 'date_spine'],
  },
  {
    id: 'P056', v: 1, title: 'Longest activity streak', dataset: 'saas', difficulty: 'Hard', topics: ['w_gaps', 'x_dedup'],
    skills: 'Gaps & islands', domain: 'Product analytics', timeTarget: 18,
    prompt: 'For each user with any activity, find their longest run of consecutive active days in `user_activity`, with its start and end date. If two runs tie in length, report the most recent one.\n\nSort by user_id.',
    output: ['user_id', 'longest_streak', 'streak_start', 'streak_end'], orderMatters: true,
    solution: `WITH d AS (SELECT DISTINCT user_id, activity_date FROM user_activity),
g AS (
  SELECT user_id, activity_date,
         activity_date - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_date))::int AS grp
  FROM d
),
s AS (SELECT user_id, grp, MIN(activity_date) AS streak_start, MAX(activity_date) AS streak_end, COUNT(*) AS len FROM g GROUP BY user_id, grp),
r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY len DESC, streak_end DESC) AS rn FROM s)
SELECT user_id, len AS longest_streak, streak_start, streak_end FROM r WHERE rn = 1 ORDER BY user_id;`,
    tests: [
      { name: 'Tied streak lengths', category: 'Business logic', why: 'The tie rule picks the most recent run.',
        patch: `INSERT INTO user_activity VALUES (3,'2026-03-05');` },
      { name: 'Duplicate pings inside a run', category: 'Edge cases', why: 'Duplicates must not break or lengthen a streak.',
        patch: `INSERT INTO user_activity VALUES (4,'2026-03-06'),(4,'2026-03-06');` },
    ],
    hints: ['Look at what is constant across consecutive dates in one run if you subtract a running counter.', 'Deduplicate dates first. Then date − ROW_NUMBER() is the same for every date in a run.', 'GROUP BY user_id, activity_date - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_date); pick the longest with a tie-break on end date'],
    explain: 'The island key (date − row_number) is constant within a consecutive run. Dedup is required because duplicates advance the row number without advancing the date.',
    trap: `WITH g AS (SELECT user_id, activity_date, activity_date - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_date))::int AS grp FROM user_activity), s AS (SELECT user_id, MIN(activity_date) AS streak_start, MAX(activity_date) AS streak_end, COUNT(*) AS len FROM g GROUP BY user_id, grp), r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY len DESC, streak_end DESC) rn FROM s) SELECT user_id, len AS longest_streak, streak_start, streak_end FROM r WHERE rn=1 ORDER BY user_id;`,
    techniques: ['row_number|lag\\s*\\('], patterns: ['gaps_islands', 'dedup'],
  },
  {
    id: 'P057', v: 1, title: 'Back after a cancellation', dataset: 'rides', difficulty: 'Medium', topics: ['w_offset'],
    skills: 'LEAD before filtering', domain: 'Ride-sharing', timeTarget: 10,
    prompt: 'For every cancelled trip request (by rider or driver), how many minutes passed until the same rider\'s next trip request of any status? NULL if the rider never requested again. Round to whole minutes.\n\nSort by trip_id.',
    output: ['trip_id', 'rider_id', 'minutes_to_next_request'], orderMatters: true,
    solution: `WITH seq AS (
  SELECT trip_id, rider_id, status, requested_at,
         LEAD(requested_at) OVER (PARTITION BY rider_id ORDER BY requested_at) AS next_request
  FROM trips
)
SELECT trip_id, rider_id, ROUND(EXTRACT(EPOCH FROM next_request - requested_at) / 60) AS minutes_to_next_request
FROM seq
WHERE status LIKE 'cancelled%'
ORDER BY trip_id;`,
    tests: [
      { name: 'Cancellation followed quickly by a rebook', category: 'Window functions', why: 'The next request can be of any status.',
        patch: `INSERT INTO trips VALUES (521,1,NULL,'Bengaluru','2026-02-07 20:00','cancelled_rider',NULL,NULL),(522,1,11,'Bengaluru','2026-02-07 20:05','completed',150,5.0);` },
    ],
    hints: ['If you filter to cancelled trips first, what does "the next row" mean?', 'Compute the next request over ALL trips, then filter to cancellations in an outer query.', "LEAD(requested_at) OVER (PARTITION BY rider_id ORDER BY requested_at) in a CTE; WHERE status LIKE 'cancelled%' outside"],
    explain: 'WHERE runs before window functions, so the window must be computed on the full table and filtered afterwards.',
    trap: `SELECT trip_id, rider_id, ROUND(EXTRACT(EPOCH FROM LEAD(requested_at) OVER (PARTITION BY rider_id ORDER BY requested_at) - requested_at)/60) AS minutes_to_next_request FROM trips WHERE status LIKE 'cancelled%' ORDER BY trip_id;`,
    techniques: ['lead\\s*\\('], patterns: ['prev_next'],
  },
  {
    id: 'P058', v: 1, title: 'First and last actions', dataset: 'saas', difficulty: 'Hard', topics: ['w_frames', 'j_left'],
    skills: 'FIRST/LAST_VALUE frames or ordered subqueries', domain: 'Product analytics', timeTarget: 14,
    prompt: 'For every user, report their first meaningful action (their earliest event that is neither `signup` nor `login`; NULL if none) and their most recent event of any type (NULL if they have no events). Break time ties by event_id.\n\nSort by user_id.',
    output: ['user_id', 'first_action', 'last_action'], orderMatters: true,
    solution: `WITH firsts AS (
  SELECT DISTINCT ON (user_id) user_id, event_name AS first_action
  FROM events WHERE event_name NOT IN ('signup', 'login')
  ORDER BY user_id, event_time, event_id
), lasts AS (
  SELECT DISTINCT ON (user_id) user_id, event_name AS last_action
  FROM events ORDER BY user_id, event_time DESC, event_id DESC
)
SELECT u.user_id, f.first_action, l.last_action
FROM users u
LEFT JOIN firsts f ON f.user_id = u.user_id
LEFT JOIN lasts l  ON l.user_id = u.user_id
ORDER BY u.user_id;`,
    tests: [
      { name: 'User with no events', category: 'Joins', why: 'Every user must appear.',
        patch: `INSERT INTO users VALUES (13,'2026-04-28','IN','organic');` },
    ],
    hints: ['Two separate "pick one event per user" questions, then combine with the full user list.', 'If you use LAST_VALUE, check its default window frame. DISTINCT ON or ROW_NUMBER also work.', 'DISTINCT ON (user_id) … ORDER BY user_id, event_time DESC — or LAST_VALUE(…) OVER (… ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)'],
    explain: 'LAST_VALUE with the default frame (… AND CURRENT ROW) just returns the current row. DISTINCT ON or ROW_NUMBER with explicit ordering avoids frame pitfalls; LEFT JOIN from users keeps users with no events.',
    trap: `WITH x AS (SELECT user_id, LAST_VALUE(event_name) OVER (PARTITION BY user_id ORDER BY event_time, event_id) AS lv, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY event_time, event_id) AS rn FROM events) SELECT x.user_id, (SELECT e.event_name FROM events e WHERE e.user_id=x.user_id AND e.event_name NOT IN ('signup','login') ORDER BY e.event_time, e.event_id LIMIT 1) AS first_action, x.lv AS last_action FROM x WHERE rn = 1 ORDER BY 1;`,
    mistakes: [{ re: 'last_value\\s*\\((?![\\s\\S]*unbounded\\s+following)', cat: 'Window functions', msg: 'LAST_VALUE with the default window frame', concept: 'Default frame ends at the current row; add ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING.' }],
    techniques: ['distinct\\s+on|row_number|first_value|last_value|limit\\s+1'], patterns: ['first_last_event'],
  },
  // Level 6
  {
    id: 'P060', v: 1, title: 'Duplicate card charges', dataset: 'bank', difficulty: 'Medium', topics: ['x_dedup', 'w_offset'],
    skills: 'Time-window dedup', domain: 'Banking', timeTarget: 12,
    prompt: 'A debit (negative amount) is a suspected duplicate if the same account had a debit to the same merchant for the same amount at most 2 minutes earlier. List the suspected duplicates (not the originals) with the seconds elapsed since that earlier debit.\n\nSort by txn_id.',
    output: ['txn_id', 'account_id', 'merchant', 'amount', 'seconds_since_previous'], orderMatters: true,
    solution: `WITH x AS (
  SELECT txn_id, account_id, merchant, amount, txn_time,
         LAG(txn_time) OVER (PARTITION BY account_id, merchant, amount ORDER BY txn_time, txn_id) AS prev_time
  FROM transactions WHERE amount < 0
)
SELECT txn_id, account_id, merchant, amount, EXTRACT(EPOCH FROM txn_time - prev_time)::int AS seconds_since_previous
FROM x
WHERE txn_time - prev_time <= INTERVAL '2 minutes'
ORDER BY txn_id;`,
    tests: [
      { name: 'Duplicate across midnight', category: 'Dates/time', why: 'Grouping by calendar date misses pairs that straddle midnight.',
        patch: `INSERT INTO transactions VALUES (19,'A3','2026-01-25 23:59:30',-450,'card','Zomato'),(20,'A3','2026-01-26 00:00:40',-450,'card','Zomato');` },
    ],
    hints: ['Define the duplicate precisely: same account, merchant and amount, close in time.', 'Within each (account, merchant, amount) group ordered by time, compare each debit to the one before it.', "LAG(txn_time) OVER (PARTITION BY account_id, merchant, amount ORDER BY txn_time) then WHERE txn_time - prev <= INTERVAL '2 minutes'"],
    explain: 'Partitioning by the duplicate key and comparing with the previous event handles windows that cross date boundaries. A self-join on a time range is an equivalent alternative.',
    trap: `SELECT MAX(txn_id) AS txn_id, account_id, merchant, amount, 0 AS seconds_since_previous FROM transactions WHERE amount < 0 GROUP BY account_id, merchant, amount, txn_time::date HAVING COUNT(*) > 1 ORDER BY 1;`,
    techniques: ['lag\\s*\\(|join[\\s\\S]*interval'], patterns: ['dedup', 'prev_next'],
  },
  {
    id: 'P061', v: 1, title: 'Signups calendar', dataset: 'saas', difficulty: 'Medium', topics: ['x_dates', 'j_cross'],
    skills: 'Month spine × dimension', domain: 'Product analytics', diagnostic: true, timeTarget: 10,
    prompt: 'Growth wants monthly signups per country for January–April 2026, including months where a country had zero signups. Use every country that appears in `users`.\n\nShow the month as `YYYY-MM`. Sort by month, then country.',
    output: ['month', 'country', 'signups'], orderMatters: true,
    solution: `WITH months AS (
  SELECT m::date AS month_start FROM generate_series(DATE '2026-01-01', DATE '2026-04-01', INTERVAL '1 month') m
), countries AS (SELECT DISTINCT country FROM users)
SELECT TO_CHAR(mo.month_start, 'YYYY-MM') AS month, c.country, COUNT(u.user_id) AS signups
FROM months mo
CROSS JOIN countries c
LEFT JOIN users u ON u.country = c.country AND DATE_TRUNC('month', u.signup_date) = mo.month_start
GROUP BY mo.month_start, c.country
ORDER BY mo.month_start, c.country;`,
    tests: [
      { name: 'Signups on the range boundaries', category: 'Dates/time', why: '30 April is inside the range; 1 May is not.',
        patch: `INSERT INTO users VALUES (13,'2026-04-30','US','organic'),(14,'2026-05-01','IN','organic');` },
    ],
    hints: ['Grouping users alone can never show a zero.', 'Generate the months, combine with every country, then attach users.', "generate_series(DATE '2026-01-01', DATE '2026-04-01', INTERVAL '1 month') CROSS JOIN countries LEFT JOIN users … COUNT(u.user_id)"],
    explain: 'The month × country scaffold guarantees every combination; COUNT(u.user_id) yields 0 for missing combinations.',
    trap: `SELECT TO_CHAR(signup_date,'YYYY-MM') AS month, country, COUNT(*) AS signups FROM users GROUP BY 1,2 ORDER BY 1,2;`,
    techniques: ['generate_series'], patterns: ['date_spine'],
  },
  {
    id: 'P062', v: 1, title: 'Typical fares', dataset: 'rides', difficulty: 'Medium', topics: ['x_percentile'],
    skills: 'PERCENTILE_CONT', domain: 'Ride-sharing', timeTarget: 9,
    prompt: 'Pricing wants a robust view of fares. For completed trips with a recorded fare, report per city the number of trips, the median fare and the 90th-percentile fare, using continuous (interpolated) percentiles rounded to 2 decimals.\n\nSort by city.',
    output: ['city', 'trips', 'median_fare', 'p90_fare'], orderMatters: true,
    solution: `SELECT city, COUNT(*) AS trips,
       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fare)::numeric, 2) AS median_fare,
       ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY fare)::numeric, 2) AS p90_fare
FROM trips
WHERE status = 'completed' AND fare IS NOT NULL
GROUP BY city ORDER BY city;`,
    tests: [
      { name: 'Outlier fare', category: 'Aggregation', why: 'Medians resist outliers; interpolation matters for even counts.',
        patch: `INSERT INTO trips VALUES (521,3,13,'Hyderabad','2026-02-07 23:00','completed',3000,60.0);` },
    ],
    hints: ['Median is a percentile. PostgreSQL has ordered-set aggregates for this.', 'PERCENTILE_CONT interpolates; PERCENTILE_DISC returns an existing value.', 'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fare), cast to numeric before ROUND'],
    explain: 'PERCENTILE_CONT interpolates between neighbours (Mumbai has 2 trips → median is their midpoint). MySQL lacks it; you would rank rows and pick middle positions.',
    trap: `SELECT city, COUNT(*) AS trips, ROUND(PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY fare)::numeric,2) AS median_fare, ROUND(PERCENTILE_DISC(0.9) WITHIN GROUP (ORDER BY fare)::numeric,2) AS p90_fare FROM trips WHERE status='completed' AND fare IS NOT NULL GROUP BY city ORDER BY city;`,
    techniques: ['percentile_cont'], patterns: ['percentiles'],
  },
  {
    id: 'P063', v: 1, title: 'Project creation by device', dataset: 'saas', difficulty: 'Medium', topics: ['x_json'],
    skills: 'JSONB ->> + missing keys', domain: 'Product analytics', timeTarget: 9,
    prompt: 'For `create_project` events, break down usage by the `device` property: number of events and number of distinct users per device. Events with no device information (missing key, empty object, NULL properties) go under `unknown`.\n\nSort by events (highest first), then device.',
    output: ['device', 'events', 'users'], orderMatters: true,
    solution: `SELECT COALESCE(properties ->> 'device', 'unknown') AS device,
       COUNT(*) AS events,
       COUNT(DISTINCT user_id) AS users
FROM events
WHERE event_name = 'create_project'
GROUP BY 1
ORDER BY events DESC, device;`,
    tests: [
      { name: 'Device key present but null', category: 'NULL handling', why: 'A JSON null also means "no device information".',
        patch: `INSERT INTO events VALUES (46,11,'create_project','2026-03-11 10:00','{"device":null}');` },
    ],
    hints: ['Extract a JSON field as text, then handle the cases where it is absent.', '->> returns text (or NULL if missing); -> returns jsonb.', "COALESCE(properties ->> 'device', 'unknown')"],
    explain: "->> yields NULL for missing keys, JSON nulls and NULL documents alike, so one COALESCE covers every case. MySQL: JSON_UNQUOTE(JSON_EXTRACT(properties, '$.device')) or ->>.",
    trap: `SELECT properties ->> 'device' AS device, COUNT(*) AS events, COUNT(DISTINCT user_id) AS users FROM events WHERE event_name='create_project' GROUP BY 1 ORDER BY events DESC, device;`,
    techniques: ['->>'], patterns: [],
  },
  {
    id: 'P064', v: 1, title: 'Basket summaries', dataset: 'shop', difficulty: 'Medium', topics: ['x_json', 'a_distinct'],
    skills: 'STRING_AGG + COUNT DISTINCT', domain: 'E-commerce', timeTarget: 9,
    prompt: 'For each completed order, return its products as one comma-separated string (`, ` separator, alphabetical by product name) and the number of distinct categories in the basket.\n\nSort by order_id.',
    output: ['order_id', 'products', 'n_categories'], orderMatters: true,
    solution: `SELECT o.order_id,
       STRING_AGG(p.name, ', ' ORDER BY p.name) AS products,
       COUNT(DISTINCT p.category) AS n_categories
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p ON p.product_id = oi.product_id
WHERE o.status = 'completed'
GROUP BY o.order_id ORDER BY o.order_id;`,
    tests: [
      { name: 'Unsorted insertion order', category: 'Logic', why: 'Without an ORDER BY inside the aggregate, concatenation order is not guaranteed.',
        patch: `INSERT INTO orders VALUES (1018,10,'2026-04-15','completed',NULL); INSERT INTO order_items VALUES (1018,107,1,349),(1018,104,1,1199),(1018,101,1,799);` },
    ],
    hints: ['One output row per order, concatenating values from many rows.', 'STRING_AGG accepts an ORDER BY inside its parentheses.', "STRING_AGG(p.name, ', ' ORDER BY p.name), COUNT(DISTINCT p.category)"],
    explain: "Ordering inside STRING_AGG makes output deterministic. MySQL equivalent: GROUP_CONCAT(name ORDER BY name SEPARATOR ', ').",
    trap: `SELECT o.order_id, STRING_AGG(p.name, ', ') AS products, COUNT(p.category) AS n_categories FROM orders o JOIN order_items oi ON oi.order_id=o.order_id JOIN products p ON p.product_id=oi.product_id WHERE o.status='completed' GROUP BY o.order_id ORDER BY o.order_id;`,
    techniques: ['string_agg'], patterns: [],
  },
  {
    id: 'P065', v: 1, title: 'Two latest orders', dataset: 'shop', difficulty: 'Hard', topics: ['x_lateral', 'w_ranking'],
    skills: 'Per-entity top-N (LATERAL or window)', domain: 'E-commerce', timeTarget: 14,
    prompt: 'For each customer with completed orders, return their two most recent completed orders with the order total (quantity × unit price). Break same-date ties by the higher order_id first.\n\nSort by customer_id, then order_date descending, then order_id descending.',
    output: ['customer_id', 'order_id', 'order_date', 'order_total'], orderMatters: true,
    solution: `SELECT c.customer_id, r.order_id, r.order_date, r.order_total
FROM customers c
CROSS JOIN LATERAL (
  SELECT o.order_id, o.order_date, SUM(oi.quantity * oi.unit_price) AS order_total
  FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
  WHERE o.customer_id = c.customer_id AND o.status = 'completed'
  GROUP BY o.order_id, o.order_date
  ORDER BY o.order_date DESC, o.order_id DESC
  LIMIT 2
) r
ORDER BY c.customer_id, r.order_date DESC, r.order_id DESC;`,
    tests: [
      { name: 'Same-date orders', category: 'Edge cases', why: 'The tie-break decides which two orders are returned.',
        patch: `INSERT INTO orders VALUES (1018,1,'2026-04-02','completed',NULL); INSERT INTO order_items VALUES (1018,107,1,349);` },
    ],
    hints: ['"Top N per entity" — either rank within each customer, or run a small "latest 2" query per customer.', 'LATERAL lets a subquery in FROM reference the current customer; LIMIT then applies per customer.', 'CROSS JOIN LATERAL (… WHERE o.customer_id = c.customer_id … ORDER BY order_date DESC, order_id DESC LIMIT 2)'],
    explain: 'LATERAL runs the subquery per outer row so LIMIT 2 means "two per customer". ROW_NUMBER() OVER (PARTITION BY customer_id …) <= 2 is the portable alternative.',
    trap: `SELECT o.customer_id, o.order_id, o.order_date, SUM(oi.quantity*oi.unit_price) AS order_total FROM orders o JOIN order_items oi ON oi.order_id=o.order_id WHERE o.status='completed' GROUP BY o.customer_id, o.order_id, o.order_date ORDER BY o.order_date DESC LIMIT 2;`,
    techniques: ['lateral|row_number|rank'], patterns: ['top_n_per_group'],
  },
  {
    id: 'P066', v: 1, title: 'Payment mix by month', dataset: 'shop', difficulty: 'Medium', topics: ['x_pivot', 'a_conditional'],
    skills: 'Pivot with conditional aggregation', domain: 'Payments', timeTarget: 9,
    prompt: 'Treasury wants a wide table of successful payment amounts by method: one row per month (by payment time) that had at least one successful payment, with columns for `card`, `upi` and `cod` (0 when none).\n\nShow the month as `YYYY-MM`. Sort by month.',
    output: ['month', 'card', 'upi', 'cod'], orderMatters: true,
    solution: `SELECT TO_CHAR(paid_at, 'YYYY-MM') AS month,
       COALESCE(SUM(amount) FILTER (WHERE method = 'card'), 0) AS card,
       COALESCE(SUM(amount) FILTER (WHERE method = 'upi'), 0) AS upi,
       COALESCE(SUM(amount) FILTER (WHERE method = 'cod'), 0) AS cod
FROM payments
WHERE status = 'success'
GROUP BY 1 ORDER BY 1;`,
    tests: [
      { name: 'Month with only failed payments', category: 'Business logic', why: 'Only months with successful payments appear.',
        patch: `INSERT INTO orders VALUES (1018,10,'2026-05-02','pending',NULL); INSERT INTO payments VALUES (18,1018,'card',799,'2026-05-02 10:00','failed');` },
    ],
    hints: ['Each output column is the same aggregate restricted to a different subset.', 'SUM(CASE WHEN method = … THEN amount END) or SUM(amount) FILTER (WHERE …). Mind NULL vs 0.', "COALESCE(SUM(amount) FILTER (WHERE method='card'),0) … WHERE status='success' GROUP BY month"],
    explain: 'A pivot is conditional aggregation with a fixed list of columns. COALESCE turns "no rows" (NULL) into 0.',
    trap: `SELECT TO_CHAR(paid_at,'YYYY-MM') AS month, COALESCE(SUM(amount) FILTER (WHERE method='card'),0) AS card, COALESCE(SUM(amount) FILTER (WHERE method='upi'),0) AS upi, COALESCE(SUM(amount) FILTER (WHERE method='cod'),0) AS cod FROM payments GROUP BY 1 ORDER BY 1;`,
    techniques: ['filter\\s*\\(\\s*where|case\\s+when'], patterns: ['conditional_agg'],
  },
  // Level 7
  {
    id: 'P070', v: 1, title: 'Activation funnel', dataset: 'saas', difficulty: 'Hard', topics: ['an_funnel', 'c_cte'],
    skills: 'Ordered funnel', domain: 'Product analytics', diagnostic: true, timeTarget: 20,
    prompt: 'The PM wants the activation funnel: signup → create_project → invite_teammate → upgrade.\n\nA user reaches a step only if they performed it at or after the time they reached the previous step (use the earliest qualifying occurrence at each step). For each step report the number of users who reached it and the percentage of signed-up users (1 decimal).\n\nSort by step order.',
    output: ['step_order', 'step', 'users', 'pct_of_signups'], orderMatters: true,
    solution: `WITH s AS (SELECT user_id, MIN(event_time) AS t FROM events WHERE event_name = 'signup' GROUP BY user_id),
c AS (SELECT s.user_id, MIN(e.event_time) AS t FROM s JOIN events e ON e.user_id = s.user_id AND e.event_name = 'create_project' AND e.event_time >= s.t GROUP BY s.user_id),
i AS (SELECT c.user_id, MIN(e.event_time) AS t FROM c JOIN events e ON e.user_id = c.user_id AND e.event_name = 'invite_teammate' AND e.event_time >= c.t GROUP BY c.user_id),
u AS (SELECT i.user_id, MIN(e.event_time) AS t FROM i JOIN events e ON e.user_id = i.user_id AND e.event_name = 'upgrade' AND e.event_time >= i.t GROUP BY i.user_id),
f AS (
  SELECT 1 AS step_order, 'signup' AS step, COUNT(*) AS users FROM s
  UNION ALL SELECT 2, 'create_project', COUNT(*) FROM c
  UNION ALL SELECT 3, 'invite_teammate', COUNT(*) FROM i
  UNION ALL SELECT 4, 'upgrade', COUNT(*) FROM u
)
SELECT step_order, step, users, ROUND(100.0 * users / FIRST_VALUE(users) OVER (ORDER BY step_order), 1) AS pct_of_signups
FROM f ORDER BY step_order;`,
    tests: [
      { name: 'Steps out of order', category: 'Business logic', why: 'Upgrading before creating a project does not complete the upgrade step.',
        patch: `INSERT INTO users VALUES (13,'2026-04-01','IN','organic'); INSERT INTO events VALUES (46,13,'signup','2026-04-01 09:00','{}'),(47,13,'upgrade','2026-04-01 09:10','{}'),(48,13,'invite_teammate','2026-04-01 09:20','{}'),(49,13,'create_project','2026-04-01 09:30','{}');` },
    ],
    hints: ['Before writing SQL: for each user, when did they reach each step under the ordering rule?', 'Build step times sequentially — each step\'s time is the earliest qualifying event after the previous step\'s time.', 'CTEs s → c → i → u, each joining events with event_time >= previous step time; then UNION ALL the counts and divide by the signup count'],
    explain: 'Sequential CTEs encode the ordering rule explicitly. Counting users who "ever did" each event overstates later steps (user 5 invited before creating a project; user 7 upgraded without inviting).',
    trap: `SELECT 1 AS step_order, 'signup' AS step, COUNT(DISTINCT user_id) FILTER (WHERE event_name='signup') AS users, 100.0 AS pct_of_signups FROM events UNION ALL SELECT 2,'create_project',COUNT(DISTINCT user_id) FILTER (WHERE event_name='create_project'), ROUND(100.0*COUNT(DISTINCT user_id) FILTER (WHERE event_name='create_project')/12,1) FROM events UNION ALL SELECT 3,'invite_teammate',COUNT(DISTINCT user_id) FILTER (WHERE event_name='invite_teammate'), ROUND(100.0*COUNT(DISTINCT user_id) FILTER (WHERE event_name='invite_teammate')/12,1) FROM events UNION ALL SELECT 4,'upgrade',COUNT(DISTINCT user_id) FILTER (WHERE event_name='upgrade'), ROUND(100.0*COUNT(DISTINCT user_id) FILTER (WHERE event_name='upgrade')/12,1) FROM events ORDER BY 1;`,
    reasoning: [
      { q: 'User A invited a teammate on Jan 29 and created their first project on Jan 30 (no later invite). Under this funnel definition, did A reach the invite step?', options: ['Yes — they invited someone', 'No — the invite happened before the project step was reached', 'Only if the invite was within 24 hours'], answer: 1, why: 'Each step must occur at or after the previous step was reached.' },
      { q: 'What is the denominator of pct_of_signups for every step?', options: ['Users who reached the previous step', 'All users who signed up', 'All events in the table'], answer: 1, why: 'The spec asks for % of signed-up users, not step-to-step conversion.' },
    ],
    clarifications: [
      { q: 'Do steps have to happen in order?', a: 'Yes. A step counts only if it happened at or after the moment the previous step was reached.' },
      { q: 'What about repeated events (e.g. two create_project events)?', a: 'Count users, not events. Use the earliest qualifying occurrence.' },
      { q: 'Should the percentage be relative to the previous step?', a: 'No — relative to all users who signed up.' },
    ],
    techniques: ['with\\s+\\w+\\s+as'], patterns: ['funnel'],
  },
  {
    id: 'P071', v: 1, title: 'Monthly retention cohorts', dataset: 'saas', difficulty: 'Very Hard', topics: ['an_cohort', 'x_dates'],
    skills: 'Cohorts + retention + censoring', domain: 'Product analytics', capstone: 'advanced', timeTarget: 25,
    prompt: 'Build a monthly retention table. A user\'s cohort is their signup month. A user is retained in month N if they have at least one `login` event in the Nth calendar month after their signup month.\n\nFor each cohort report its size, month-1 retention % and month-2 retention % (1 decimal). Data is only observed through 2026-04-30: if month N for a cohort lies after April 2026, that retention value must be NULL (not yet observable), not 0.\n\nShow the cohort as `YYYY-MM`. Sort by cohort.',
    output: ['cohort_month', 'cohort_size', 'm1_retention_pct', 'm2_retention_pct'], orderMatters: true,
    solution: `WITH cohorts AS (
  SELECT user_id, DATE_TRUNC('month', signup_date)::date AS cohort FROM users
), login_months AS (
  SELECT DISTINCT user_id, DATE_TRUNC('month', event_time)::date AS m FROM events WHERE event_name = 'login'
), flags AS (
  SELECT c.cohort, c.user_id,
         COALESCE(BOOL_OR(l.m = (c.cohort + INTERVAL '1 month')::date), false) AS r1,
         COALESCE(BOOL_OR(l.m = (c.cohort + INTERVAL '2 months')::date), false) AS r2
  FROM cohorts c LEFT JOIN login_months l ON l.user_id = c.user_id
  GROUP BY c.cohort, c.user_id
)
SELECT TO_CHAR(cohort, 'YYYY-MM') AS cohort_month,
       COUNT(*) AS cohort_size,
       CASE WHEN (cohort + INTERVAL '1 month')::date <= DATE '2026-04-01'
            THEN ROUND(100.0 * COUNT(*) FILTER (WHERE r1) / COUNT(*), 1) END AS m1_retention_pct,
       CASE WHEN (cohort + INTERVAL '2 months')::date <= DATE '2026-04-01'
            THEN ROUND(100.0 * COUNT(*) FILTER (WHERE r2) / COUNT(*), 1) END AS m2_retention_pct
FROM flags GROUP BY cohort ORDER BY cohort;`,
    tests: [
      { name: 'Brand-new April cohort', category: 'Business logic', why: 'Neither month 1 nor month 2 has happened yet for April signups.',
        patch: `INSERT INTO users VALUES (13,'2026-04-05','IN','organic'); INSERT INTO events VALUES (46,13,'signup','2026-04-05 09:00','{}'),(47,13,'login','2026-04-20 09:00','{}');` },
      { name: 'Multiple logins in one month', category: 'Aggregation', why: 'Retention counts users, not logins.',
        patch: `INSERT INTO events VALUES (48,1,'login','2026-02-20 08:00','{}'),(49,1,'login','2026-02-21 08:00','{}');` },
    ],
    hints: ['Get to user grain first: for each user, their cohort and whether they logged in during month+1 and month+2.', 'Then aggregate users per cohort. Separately decide whether each cohort/month is observable given the data end date.', 'Per-user flags with BOOL_OR(login_month = cohort + 1 month); per cohort COUNT(*) FILTER (WHERE r1) / COUNT(*); wrap in CASE WHEN cohort + N months <= 2026-04-01 THEN … END'],
    explain: 'Per-user flags keep the denominator (cohort size) and numerator at the same grain. Censoring immature cohorts with NULL avoids reporting "0% retention" for months that haven\'t happened.',
    trap: `WITH c AS (SELECT user_id, DATE_TRUNC('month', signup_date)::date AS cohort FROM users), l AS (SELECT DISTINCT user_id, DATE_TRUNC('month', event_time)::date AS m FROM events WHERE event_name='login') SELECT TO_CHAR(c.cohort,'YYYY-MM') AS cohort_month, COUNT(DISTINCT c.user_id) AS cohort_size, ROUND(100.0*COUNT(DISTINCT l.user_id) FILTER (WHERE l.m=(c.cohort+INTERVAL '1 month')::date)/COUNT(DISTINCT c.user_id),1) AS m1_retention_pct, ROUND(100.0*COUNT(DISTINCT l.user_id) FILTER (WHERE l.m=(c.cohort+INTERVAL '2 months')::date)/COUNT(DISTINCT c.user_id),1) AS m2_retention_pct FROM c LEFT JOIN l ON l.user_id=c.user_id GROUP BY c.cohort ORDER BY c.cohort;`,
    reasoning: [
      { q: 'March 2026 signups: how should month-2 retention (May 2026) be reported when data ends on 2026-04-30?', options: ['0.0', 'NULL / not yet observable', 'Same as month-1'], answer: 1, why: 'Reporting 0% would claim everyone churned when we simply have no data yet.' },
      { q: 'What is the unit of analysis in the numerator?', options: ['Login events', 'Users', 'Sessions'], answer: 1, why: 'Retention is a share of users; multiple logins by one user count once.' },
    ],
    clarifications: [
      { q: 'Is "month 1" the next 30 days or the next calendar month?', a: 'The next calendar month after the signup month.' },
      { q: 'Does any event count as activity?', a: 'Only login events.' },
      { q: 'What should unobservable months show?', a: 'NULL.' },
    ],
    techniques: ['date_trunc'], patterns: ['cohort_retention'],
  },
  {
    id: 'P072', v: 1, title: 'Customer churn rate', dataset: 'saas', difficulty: 'Hard', topics: ['an_churn', 'x_dates'],
    skills: 'Active-at-date logic + customer-level churn', domain: 'SaaS subscriptions', timeTarget: 20,
    prompt: 'Finance wants monthly customer churn for February, March and April 2026.\n\nA customer is active on a date if any of their subscriptions covers it (start_date ≤ date and end_date is NULL or ≥ date). For each month: active_at_start = customers active on the 1st of the month; churned = those of them NOT active on the 1st of the following month; churn rate = churned ÷ active_at_start as a percentage (1 decimal). Switching plans is not churn.\n\nShow the month as `YYYY-MM`. Sort by month.',
    output: ['month', 'active_at_start', 'churned', 'churn_rate_pct'], orderMatters: true,
    solution: `WITH months AS (
  SELECT m::date AS month_start FROM generate_series(DATE '2026-02-01', DATE '2026-04-01', INTERVAL '1 month') m
), active_start AS (
  SELECT DISTINCT mo.month_start, s.user_id
  FROM months mo JOIN subscriptions s
    ON s.start_date <= mo.month_start AND (s.end_date IS NULL OR s.end_date >= mo.month_start)
), active_next AS (
  SELECT DISTINCT mo.month_start, s.user_id
  FROM months mo JOIN subscriptions s
    ON s.start_date <= (mo.month_start + INTERVAL '1 month')::date
   AND (s.end_date IS NULL OR s.end_date >= (mo.month_start + INTERVAL '1 month')::date)
)
SELECT TO_CHAR(a.month_start, 'YYYY-MM') AS month,
       COUNT(*) AS active_at_start,
       COUNT(*) FILTER (WHERE n.user_id IS NULL) AS churned,
       ROUND(100.0 * COUNT(*) FILTER (WHERE n.user_id IS NULL) / COUNT(*), 1) AS churn_rate_pct
FROM active_start a
LEFT JOIN active_next n ON n.month_start = a.month_start AND n.user_id = a.user_id
GROUP BY a.month_start ORDER BY a.month_start;`,
    tests: [
      { name: 'Plan downgrade mid-period', category: 'Business logic', why: 'A plan change creates a new subscription row but the customer stays active.',
        patch: `UPDATE subscriptions SET end_date = '2026-02-28' WHERE sub_id = 1; INSERT INTO subscriptions VALUES (7,1,'starter',10,'2026-03-01',NULL);` },
    ],
    hints: ['Unit of analysis: customer or subscription? Re-read the plan-change rule.', 'Build "customers active on date D" as a reusable idea, evaluate it on the month start and the next month start, and compare the two sets.', 'active_start and active_next CTEs with DISTINCT user_id; LEFT JOIN them; churned = rows where the next-month side is NULL'],
    explain: 'Comparing customer sets at two points in time makes plan changes invisible, as required. Counting subscriptions that ended would count user 3\'s pro → team switch as churn.',
    trap: `WITH months AS (SELECT m::date AS ms FROM generate_series(DATE '2026-02-01', DATE '2026-04-01', INTERVAL '1 month') m) SELECT TO_CHAR(mo.ms,'YYYY-MM') AS month, COUNT(*) AS active_at_start, COUNT(*) FILTER (WHERE s.end_date < (mo.ms + INTERVAL '1 month')::date) AS churned, ROUND(100.0*COUNT(*) FILTER (WHERE s.end_date < (mo.ms + INTERVAL '1 month')::date)/COUNT(*),1) AS churn_rate_pct FROM months mo JOIN subscriptions s ON s.start_date <= mo.ms AND (s.end_date IS NULL OR s.end_date >= mo.ms) GROUP BY mo.ms ORDER BY mo.ms;`,
    reasoning: [
      { q: 'User 3 moves from pro (ends Mar 31) to team (starts Apr 1). Is that March churn?', options: ['Yes — a subscription ended', 'No — the customer is still active on Apr 1'], answer: 1, why: 'Churn is measured at the customer level.' },
      { q: 'What is the denominator of the churn rate?', options: ['Customers active at the start of the month', 'Customers active at the end of the month', 'All customers ever'], answer: 0, why: 'The spec defines churn relative to the starting base.' },
    ],
    clarifications: [
      { q: 'Is end_date inclusive?', a: 'Yes — end_date is the last active day.' },
      { q: 'Should a customer who starts and ends within a month count?', a: 'Only customers active on the 1st are in the base for that month.' },
    ],
    techniques: ['generate_series|interval'], patterns: ['date_spine'],
  },
  {
    id: 'P073', v: 1, title: 'Web sessions', dataset: 'saas', difficulty: 'Hard', topics: ['an_session', 'w_offset', 'w_aggregate'],
    skills: 'Sessionization (LAG + running SUM)', domain: 'Product analytics', timeTarget: 18,
    prompt: 'Sessionize `page_views`: a new session starts with a user\'s first view, or whenever more than 30 minutes have passed since that user\'s previous view (exactly 30 minutes is still the same session). Sessions can cross midnight.\n\nFor each session return its number within the user (1, 2, …), start time, page views and duration in whole minutes (last view − first view).\n\nSort by user_id, session_number.',
    output: ['user_id', 'session_number', 'session_start', 'pageviews', 'duration_minutes'], orderMatters: true,
    solution: `WITH flagged AS (
  SELECT user_id, viewed_at,
         CASE WHEN LAG(viewed_at) OVER w IS NULL
                OR viewed_at - LAG(viewed_at) OVER w > INTERVAL '30 minutes' THEN 1 ELSE 0 END AS new_session
  FROM page_views
  WINDOW w AS (PARTITION BY user_id ORDER BY viewed_at)
), numbered AS (
  SELECT *, SUM(new_session) OVER (PARTITION BY user_id ORDER BY viewed_at ROWS UNBOUNDED PRECEDING) AS session_number
  FROM flagged
)
SELECT user_id, session_number, MIN(viewed_at) AS session_start, COUNT(*) AS pageviews,
       (EXTRACT(EPOCH FROM MAX(viewed_at) - MIN(viewed_at)) / 60)::int AS duration_minutes
FROM numbered GROUP BY user_id, session_number ORDER BY user_id, session_number;`,
    tests: [
      { name: 'Gap of exactly 30 minutes', category: 'Edge cases', why: 'Only gaps strictly greater than 30 minutes start a new session.',
        patch: `INSERT INTO page_views VALUES (9,'2026-02-12 10:00','/home'),(9,'2026-02-12 10:30','/docs'),(9,'2026-02-12 11:01','/pricing');` },
    ],
    hints: ['First decide, for each page view, whether it starts a new session.', 'A view starts a session if there is no previous view or the gap exceeds 30 minutes. A running count of session starts gives the session number.', "CASE WHEN LAG(viewed_at) … IS NULL OR viewed_at - LAG(viewed_at) … > INTERVAL '30 minutes' THEN 1 ELSE 0 END, then SUM(…) OVER (PARTITION BY user_id ORDER BY viewed_at)"],
    explain: 'The flag-then-running-sum technique turns a boundary rule into session IDs without self-joins and naturally crosses midnight.',
    trap: `WITH f AS (SELECT user_id, viewed_at, CASE WHEN LAG(viewed_at) OVER w IS NULL OR viewed_at - LAG(viewed_at) OVER w >= INTERVAL '30 minutes' THEN 1 ELSE 0 END AS ns FROM page_views WINDOW w AS (PARTITION BY user_id ORDER BY viewed_at)), n AS (SELECT *, SUM(ns) OVER (PARTITION BY user_id ORDER BY viewed_at) AS session_number FROM f) SELECT user_id, session_number, MIN(viewed_at) AS session_start, COUNT(*) AS pageviews, (EXTRACT(EPOCH FROM MAX(viewed_at)-MIN(viewed_at))/60)::int AS duration_minutes FROM n GROUP BY 1,2 ORDER BY 1,2;`,
    clarifications: [{ q: 'Is a 30-minute gap a new session?', a: 'No. Only gaps strictly greater than 30 minutes.' }],
    techniques: ['lag\\s*\\('], patterns: ['sessionization'],
  },
  {
    id: 'P074', v: 1, title: 'Rolling weekly actives', dataset: 'saas', difficulty: 'Very Hard', topics: ['an_rolling', 'x_dates', 'a_distinct'],
    skills: 'Rolling DISTINCT over a date spine', domain: 'Product analytics', timeTarget: 22,
    prompt: 'For every date from 2026-03-01 to 2026-03-10, report daily active users (distinct users with activity that day) and 7-day active users: distinct users active at least once in the 7 days ending on that date (inclusive). Use `user_activity`. Dates with no activity still appear.\n\nSort by date.',
    output: ['activity_date', 'dau', 'wau_7d'], orderMatters: true,
    solution: `WITH days AS (
  SELECT d::date AS day FROM generate_series(DATE '2026-03-01', DATE '2026-03-10', INTERVAL '1 day') d
), act AS (SELECT DISTINCT user_id, activity_date FROM user_activity)
SELECT dy.day AS activity_date,
       COUNT(DISTINCT a.user_id) FILTER (WHERE a.activity_date = dy.day) AS dau,
       COUNT(DISTINCT a.user_id) AS wau_7d
FROM days dy
LEFT JOIN act a ON a.activity_date BETWEEN dy.day - 6 AND dy.day
GROUP BY dy.day ORDER BY dy.day;`,
    tests: [
      { name: 'User active only on a quiet day', category: 'Dates/time', why: 'Each day needs its own window membership; users must not be counted twice in a window.',
        patch: `INSERT INTO user_activity VALUES (5,'2026-03-09'),(5,'2026-03-09'),(2,'2026-03-09');` },
    ],
    hints: ['Can you add up daily active users to get weekly active users?', 'For each calendar day, attach every activity row from the 7-day window ending on that day, then count distinct users.', 'days LEFT JOIN activity ON activity_date BETWEEN day - 6 AND day; COUNT(DISTINCT user_id)'],
    explain: 'Distinct counts are not additive, so a rolling SUM of DAU overcounts. Joining each day to its window (a "range join") and counting distinct users is correct. PostgreSQL does not support COUNT(DISTINCT) OVER.',
    trap: `WITH days AS (SELECT d::date AS day FROM generate_series(DATE '2026-03-01', DATE '2026-03-10', INTERVAL '1 day') d), dau AS (SELECT dy.day, COUNT(DISTINCT a.user_id) AS dau FROM days dy LEFT JOIN user_activity a ON a.activity_date=dy.day GROUP BY dy.day) SELECT day AS activity_date, dau, SUM(dau) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS wau_7d FROM dau ORDER BY day;`,
    reasoning: [{ q: 'User X is active on Mar 2 and Mar 4. How many times do they count toward 7-day actives on Mar 5?', options: ['0', '1', '2'], answer: 1, why: 'Active users are distinct people in the window.' }],
    techniques: ['count\\s*\\(\\s*distinct'], patterns: ['date_spine', 'rolling_avg'],
  },
  {
    id: 'P075', v: 1, title: 'Customer segments', dataset: 'shop', difficulty: 'Hard', topics: ['an_segment', 'j_left', 'f_case'],
    skills: 'Per-customer features + ordered rules', domain: 'E-commerce', capstone: 'intermediate', timeTarget: 18,
    prompt: 'Segment every customer as of 2026-04-30 using completed orders only. Apply these rules in order (first match wins):\n1. No completed orders → `never_purchased`\n2. Last completed order more than 45 days before the as-of date → `at_risk`\n3. 3 or more completed orders → `champion`\n4. Exactly 2 → `loyal`\n5. Otherwise → `new`\n\nReturn the number of completed orders and days since the last completed order (NULL if none). Sort by customer_id.',
    output: ['customer_id', 'name', 'completed_orders', 'days_since_last', 'segment'], orderMatters: true,
    solution: `WITH stats AS (
  SELECT c.customer_id, c.name, COUNT(o.order_id) AS completed_orders, MAX(o.order_date) AS last_order
  FROM customers c
  LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status = 'completed'
  GROUP BY c.customer_id, c.name
)
SELECT customer_id, name, completed_orders, DATE '2026-04-30' - last_order AS days_since_last,
       CASE WHEN completed_orders = 0 THEN 'never_purchased'
            WHEN DATE '2026-04-30' - last_order > 45 THEN 'at_risk'
            WHEN completed_orders >= 3 THEN 'champion'
            WHEN completed_orders = 2 THEN 'loyal'
            ELSE 'new' END AS segment
FROM stats ORDER BY customer_id;`,
    tests: [
      { name: 'Exactly 45 days since last order', category: 'Edge cases', why: '"More than 45" excludes exactly 45.',
        patch: `INSERT INTO customers VALUES (11,'Asha','asha@mail.com','Pune','2026-03-01',NULL); INSERT INTO orders VALUES (1018,11,'2026-03-16','completed',NULL);` },
    ],
    hints: ['Get one row per customer with the features the rules need, keeping customers with no purchases.', 'Then translate the rules into a CASE in exactly the given order. Use the stated as-of date, not today.', "LEFT JOIN orders … AND status='completed'; COUNT(o.order_id), MAX(order_date); CASE in rule order with DATE '2026-04-30' - last_order"],
    explain: 'Rule precedence is part of the business definition: a 4-order customer inactive for 60 days is at_risk, not champion. A fixed as-of date makes results reproducible.',
    trap: `WITH s AS (SELECT c.customer_id, c.name, COUNT(o.order_id) AS completed_orders, MAX(o.order_date) AS last_order FROM customers c LEFT JOIN orders o ON o.customer_id=c.customer_id AND o.status='completed' GROUP BY 1,2) SELECT customer_id, name, completed_orders, DATE '2026-04-30' - last_order AS days_since_last, CASE WHEN completed_orders = 0 THEN 'never_purchased' WHEN completed_orders >= 3 THEN 'champion' WHEN completed_orders = 2 THEN 'loyal' WHEN DATE '2026-04-30' - last_order > 45 THEN 'at_risk' ELSE 'new' END AS segment FROM s ORDER BY 1;`,
    reasoning: [{ q: 'A customer has 4 completed orders, the last one 60 days before the as-of date. Segment?', options: ['champion', 'at_risk', 'loyal'], answer: 1, why: 'Rule 2 is evaluated before rule 3.' }],
    mistakes: [{ re: 'current_date|now\\s*\\(', cat: 'Business logic', msg: 'Used the current date instead of the stated as-of date', concept: 'Analyses with an as-of date must be reproducible; hard-code or parameterise the as-of date.' }],
    techniques: ['case\\s+when'], patterns: ['segmentation'],
  },
  {
    id: 'P076', v: 1, title: 'Unusual debits', dataset: 'bank', difficulty: 'Hard', topics: ['an_anomaly', 'w_frames'],
    skills: 'Prior-history baseline frame', domain: 'Fraud', timeTarget: 18,
    prompt: 'Risk wants to flag unusual debits. For each debit (negative amount), compute the account\'s average debit size over its PREVIOUS debits only (excluding the current one). Flag a debit if the account has at least 2 previous debits and the debit size is more than 3× that previous average.\n\nReturn the debit size as a positive number and the previous average (2 decimals). Sort by txn_id.',
    output: ['txn_id', 'account_id', 'amount', 'prior_avg'], orderMatters: true,
    solution: `WITH d AS (
  SELECT txn_id, account_id, txn_time, -amount AS debit FROM transactions WHERE amount < 0
), x AS (
  SELECT *, AVG(debit) OVER w AS prior_avg, COUNT(*) OVER w AS prior_n
  FROM d
  WINDOW w AS (PARTITION BY account_id ORDER BY txn_time, txn_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
)
SELECT txn_id, account_id, debit AS amount, ROUND(prior_avg, 2) AS prior_avg
FROM x WHERE prior_n >= 2 AND debit > 3 * prior_avg
ORDER BY txn_id;`,
    tests: [
      { name: 'Too little history', category: 'Business logic', why: 'One previous debit is not enough history to flag.',
        patch: `INSERT INTO transactions VALUES (19,'A4','2026-02-21 10:00',-100,'upi','Grocer'),(20,'A4','2026-02-22 10:00',-50000,'transfer','Jeweller');` },
    ],
    hints: ['The baseline must not include the transaction being judged.', 'Window frames can end at "1 PRECEDING". Count the rows in that same frame for the history requirement.', 'AVG(debit) OVER (PARTITION BY account_id ORDER BY txn_time ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) plus COUNT(*) over the same frame'],
    explain: 'Ending the frame at 1 PRECEDING excludes the current row, so a big debit cannot dilute its own baseline.',
    trap: `WITH d AS (SELECT txn_id, account_id, txn_time, -amount AS debit FROM transactions WHERE amount < 0), x AS (SELECT *, AVG(debit) OVER (PARTITION BY account_id ORDER BY txn_time) AS prior_avg, ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY txn_time) - 1 AS prior_n FROM d) SELECT txn_id, account_id, debit AS amount, ROUND(prior_avg,2) AS prior_avg FROM x WHERE prior_n >= 1 AND debit > 3*prior_avg ORDER BY txn_id;`,
    techniques: ['1\\s+preceding'], patterns: ['baseline'],
  },
  {
    id: 'P080', v: 1, title: 'Invite-to-upgrade conversion', dataset: 'saas', difficulty: 'Very Hard', topics: ['an_conversion', 'an_funnel', 'j_left'],
    skills: 'Anchored time window + censoring + full dimension', domain: 'Product analytics', capstone: 'expert', timeTarget: 28,
    prompt: 'Does inviting a teammate lead to upgrading? For each acquisition channel, consider users whose FIRST invite_teammate event is eligible: data is observed until 2026-05-01 00:00, and an invite is eligible only if its full 14-day window (first invite + 14 days) ends by then. A user converts if they have an upgrade event strictly after their first invite and within 14 days of it.\n\nReport for EVERY channel in `users`: eligible inviters, converted users, and conversion % (1 decimal; NULL when a channel has no eligible inviters).\n\nSort by channel.',
    output: ['channel', 'eligible_inviters', 'converted_14d', 'conversion_pct'], orderMatters: true,
    solution: `WITH first_invite AS (
  SELECT user_id, MIN(event_time) AS invited_at FROM events WHERE event_name = 'invite_teammate' GROUP BY user_id
), eligible AS (
  SELECT * FROM first_invite WHERE invited_at + INTERVAL '14 days' <= TIMESTAMP '2026-05-01 00:00'
), converted AS (
  SELECT e.user_id FROM eligible e
  WHERE EXISTS (SELECT 1 FROM events u WHERE u.user_id = e.user_id AND u.event_name = 'upgrade'
                AND u.event_time > e.invited_at AND u.event_time <= e.invited_at + INTERVAL '14 days')
)
SELECT ch.channel,
       COUNT(el.user_id) AS eligible_inviters,
       COUNT(cv.user_id) AS converted_14d,
       ROUND(100.0 * COUNT(cv.user_id) / NULLIF(COUNT(el.user_id), 0), 1) AS conversion_pct
FROM (SELECT DISTINCT channel FROM users) ch
LEFT JOIN users us    ON us.channel = ch.channel
LEFT JOIN eligible el ON el.user_id = us.user_id
LEFT JOIN converted cv ON cv.user_id = el.user_id
GROUP BY ch.channel ORDER BY ch.channel;`,
    tests: [
      { name: 'Invite too recent to judge', category: 'Business logic', why: 'Users whose 14-day window has not finished are not eligible.',
        patch: `INSERT INTO users VALUES (13,'2026-04-20','IN','organic'); INSERT INTO events VALUES (46,13,'signup','2026-04-20 09:00','{}'),(47,13,'invite_teammate','2026-04-25 09:00','{}'),(48,13,'upgrade','2026-04-27 09:00','{}');` },
      { name: 'Upgrade before invite', category: 'Business logic', why: 'Only upgrades after the first invite convert.',
        patch: `INSERT INTO users VALUES (14,'2026-02-20','IN','referral'); INSERT INTO events VALUES (49,14,'signup','2026-02-20 09:00','{}'),(50,14,'upgrade','2026-03-01 09:00','{}'),(51,14,'invite_teammate','2026-03-02 09:00','{}');` },
    ],
    hints: ['Define, per user: the anchor (first invite), eligibility, and conversion — before touching channels.', 'Eligibility: invited_at + 14 days ≤ observation end. Conversion: an upgrade in (invited_at, invited_at + 14 days]. Channels come from users, so start from the channel list.', 'first_invite → eligible → converted CTEs; then channels LEFT JOIN users LEFT JOIN eligible LEFT JOIN converted; NULLIF in the denominator'],
    explain: 'Anchoring on the first invite and censoring incomplete windows prevents optimistic bias from recent users. Starting from the full channel list keeps channels with zero eligible users visible; NULLIF avoids division by zero.',
    trap: `WITH fi AS (SELECT user_id, MIN(event_time) AS invited_at FROM events WHERE event_name='invite_teammate' GROUP BY user_id), cv AS (SELECT fi.user_id FROM fi WHERE EXISTS (SELECT 1 FROM events u WHERE u.user_id=fi.user_id AND u.event_name='upgrade' AND u.event_time > fi.invited_at AND u.event_time <= fi.invited_at + INTERVAL '14 days')) SELECT ch.channel, COUNT(fi.user_id) AS eligible_inviters, COUNT(cv.user_id) AS converted_14d, ROUND(100.0*COUNT(cv.user_id)/NULLIF(COUNT(fi.user_id),0),1) AS conversion_pct FROM (SELECT DISTINCT channel FROM users) ch LEFT JOIN users us ON us.channel=ch.channel LEFT JOIN fi ON fi.user_id=us.user_id LEFT JOIN cv ON cv.user_id=fi.user_id GROUP BY ch.channel ORDER BY ch.channel;`,
    reasoning: [
      { q: 'A user first invited on 2026-04-25. Data ends 2026-04-30. Should they be in the denominator?', options: ['Yes', 'No — their 14-day window is incomplete', 'Only if they converted'], answer: 1, why: 'Including them biases conversion (converters are visible early, non-converters are not yet known).' },
      { q: 'What should conversion_pct be for a channel with zero eligible inviters?', options: ['0.0', 'NULL', '100.0'], answer: 1, why: 'The rate is undefined, not zero.' },
    ],
    clarifications: [
      { q: 'If a user invited several times, which invite starts the window?', a: 'Only the first invite.' },
      { q: 'Is the 14-day boundary inclusive?', a: 'Yes — an upgrade exactly 14 days after the invite counts.' },
      { q: 'Should channels with no inviters appear?', a: 'Yes, every channel in users.' },
    ],
    techniques: ['nullif|case\\s+when'], patterns: ['funnel', 'cohort_retention'],
  },
];

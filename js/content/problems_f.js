// Levels 3–4 — subqueries, correlated subqueries, EXISTS/NOT IN, set operations, CTEs, recursive CTEs.
// P40x subqueries · P41x correlated · P42x exists · P43x set ops · P44x CTEs · P45x recursive.
// Q(id,title,dataset,topics,difficulty,skills,prompt,output,orderMatters,solution,[testName,why,patch],hints,explain,trap,extra)
const Q = (id, title, dataset, topics, difficulty, skills, prompt, output, orderMatters, solution, t, hints, explain, trap, extra = {}) => ({
  v: 1, id, title, dataset, topics, difficulty, skills, domain: extra.domain || dataset, timeTarget: { Easy: 7, Medium: 10, Hard: 14, 'Very Hard': 18 }[difficulty],
  prompt, output, orderMatters, solution, tests: [{ name: t[0], category: t[3] || 'Edge cases', why: t[1], patch: t[2] }], hints, explain, trap, patterns: [], ...extra,
});

export const PROBLEMS_F = [
  // ── Subqueries ──
  Q('P400', 'Above the active average', 'shop', ['s_subquery'], 'Easy', 'Scalar subquery with the same population',
    'List products whose price is above the average price of ACTIVE products. Return product id, name and price, sorted by id.',
    ['product_id', 'name', 'price'], true,
    `SELECT product_id, name, price FROM products WHERE price > (SELECT AVG(price) FROM products WHERE is_active) ORDER BY product_id;`,
    ['A mid-priced new product', 'The benchmark must use active products only.', `INSERT INTO products VALUES (109,'Water Bottle','Fitness',1670,true);`, 'Business logic'],
    ['A subquery can return a single number to compare against.', 'Which products define "the average"?', 'WHERE price > (SELECT AVG(price) FROM products WHERE is_active)'],
    'Benchmark and compared rows should come from comparable populations; the subquery needs its own filter.',
    `SELECT product_id, name, price FROM products WHERE price > (SELECT AVG(price) FROM products) ORDER BY product_id;`),
  Q('P401', 'Big spenders', 'shop', ['s_subquery', 'a_groupby'], 'Medium', 'Derived table + scalar subquery on aggregated grain',
    'Return customers whose total completed spend (quantity × charged price) is above the average completed spend per customer (customers with at least one completed order). Show customer id and spend, sorted by id.',
    ['customer_id', 'spend'], true,
    `SELECT customer_id, spend FROM (
  SELECT o.customer_id, SUM(oi.quantity * oi.unit_price) AS spend FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.customer_id
) s
WHERE spend > (SELECT AVG(spend) FROM (
  SELECT SUM(oi.quantity * oi.unit_price) AS spend FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.customer_id
) x)
ORDER BY customer_id;`,
    ['One huge spender', 'The average is per customer, so one big buyer moves it.', `INSERT INTO orders VALUES (1018,10,'2026-04-12','completed',NULL); INSERT INTO order_items VALUES (1018,105,20,2999);`],
    ['What grain is "average spend"?', 'Aggregate to customer grain first, then average those totals.', 'Compare spend with (SELECT AVG(spend) FROM (…per-customer totals…) x)'],
    'The average of customer totals is not the average of line values. Aggregate to the right grain before averaging.',
    `SELECT customer_id, spend FROM (SELECT o.customer_id, SUM(oi.quantity * oi.unit_price) AS spend FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.customer_id) s WHERE spend > (SELECT AVG(quantity * unit_price) FROM order_items) ORDER BY customer_id;`),
  Q('P402', 'Yoga mat buyers', 'shop', ['s_subquery'], 'Easy', 'IN with a subquery',
    'Which customers bought a Yoga Mat in a completed order? Return customer id and name, sorted by id.', ['customer_id', 'name'], true,
    `SELECT customer_id, name FROM customers WHERE customer_id IN (
  SELECT o.customer_id FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id
  WHERE p.name = 'Yoga Mat' AND o.status = 'completed'
) ORDER BY customer_id;`,
    ['Cancelled yoga mat order', 'Only completed orders count.', `INSERT INTO orders VALUES (1018,9,'2026-04-12','cancelled',NULL); INSERT INTO order_items VALUES (1018,104,1,1199);`, 'Business logic'],
    ['Find the matching customer ids first.', 'Use them in IN (…).', 'WHERE customer_id IN (SELECT o.customer_id FROM orders o JOIN … WHERE p.name = \'Yoga Mat\' AND o.status = \'completed\')'],
    'IN (subquery) is a semi-join: each customer appears once however many matches exist.',
    `SELECT customer_id, name FROM customers WHERE customer_id IN (SELECT o.customer_id FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE p.name = 'Yoga Mat') ORDER BY customer_id;`),
  Q('P403', 'Bigger than the typical delivery', 'food', ['s_subquery'], 'Easy', 'Benchmark from the same filtered population',
    'List delivered orders whose order value is above the average order value of delivered orders. Return delivery id and order value, sorted by id.', ['delivery_id', 'order_value'], true,
    `SELECT delivery_id, order_value FROM deliveries WHERE status = 'delivered' AND order_value > (SELECT AVG(order_value) FROM deliveries WHERE status = 'delivered') ORDER BY delivery_id;`,
    ['Huge cancelled order', 'Cancelled orders must not drag the benchmark.', `INSERT INTO deliveries VALUES (21,6,113,'2026-03-10 20:00',NULL,'cancelled',9000,0,NULL,6.0,NULL);`, 'Business logic'],
    ['What is the benchmark?', 'Filter the subquery the same way as the outer query.', '(SELECT AVG(order_value) FROM deliveries WHERE status = \'delivered\')'],
    'Compare like with like: the subquery needs the same status filter.',
    `SELECT delivery_id, order_value FROM deliveries WHERE status = 'delivered' AND order_value > (SELECT AVG(order_value) FROM deliveries) ORDER BY delivery_id;`),
  Q('P404', 'Runner-up salary', 'hr', ['s_subquery'], 'Medium', 'Second-highest distinct value via subquery',
    'What is the second-highest distinct salary? Return a single value.', ['second_highest'], false,
    `SELECT MAX(salary) AS second_highest FROM employees WHERE salary < (SELECT MAX(salary) FROM employees);`,
    ['Two people at the top', 'Ties at the top must not become the runner-up.', `INSERT INTO employees VALUES (17,'Advik',1,1,'Architect',300000,'2026-04-01');`],
    ['"Second highest" means second distinct value.', 'Find the maximum of everything below the maximum.', 'MAX(salary) WHERE salary < (SELECT MAX(salary) …)'],
    'ORDER BY … OFFSET 1 returns the second ROW, which is the top salary again when there is a tie.',
    `SELECT salary AS second_highest FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 1;`),
  Q('P405', 'Busy courses', 'campus', ['s_subquery', 'a_groupby'], 'Medium', 'Average of per-group counts',
    'A course is "busy" when its number of enrolments (every row except withdrawals) is above the average across courses that have any. Return course id and enrolments, sorted by course id.', ['course_id', 'enrolments'], true,
    `SELECT course_id, n AS enrolments FROM (SELECT course_id, COUNT(*) AS n FROM enrollments WHERE status <> 'withdrawn' GROUP BY course_id) t
WHERE n > (SELECT AVG(n) FROM (SELECT COUNT(*) AS n FROM enrollments WHERE status <> 'withdrawn' GROUP BY course_id) u) ORDER BY course_id;`,
    ['Extra withdrawals', 'Withdrawals must not count towards busyness.', `INSERT INTO enrollments VALUES (1,'C203','2025F',NULL,'withdrawn'),(2,'C203','2025F',NULL,'withdrawn'),(3,'C203','2026S',NULL,'withdrawn'),(4,'C203','2025F',NULL,'withdrawn');`, 'Business logic'],
    ['Count per course first.', 'Then average those counts.', 'AVG(n) over a grouped subquery'],
    'Both the per-course counts and their average use the same filter; averaging counts needs a second level of aggregation.',
    `SELECT course_id, n AS enrolments FROM (SELECT course_id, COUNT(*) AS n FROM enrollments GROUP BY course_id) t WHERE n > (SELECT AVG(n) FROM (SELECT COUNT(*) AS n FROM enrollments GROUP BY course_id) u) ORDER BY course_id;`),

  // ── Correlated subqueries ──
  Q('P410', 'Pricey for the city', 'rides', ['s_correlated'], 'Medium', 'Correlated average per group',
    'List completed trips whose fare is above the average completed-trip fare in the same city. Return trip id, city and fare, sorted by trip id.', ['trip_id', 'city', 'fare'], true,
    `SELECT t.trip_id, t.city, t.fare FROM trips t WHERE t.status = 'completed' AND t.fare > (SELECT AVG(x.fare) FROM trips x WHERE x.city = t.city AND x.status = 'completed') ORDER BY t.trip_id;`,
    ['City with one trip', 'A lone trip cannot be above its own average.', `INSERT INTO trips VALUES (521,7,16,'Pune','2026-02-08 09:00','completed',900,20.0);`],
    ['The benchmark changes per row.', 'Correlate the subquery on city.', 'WHERE x.city = t.city inside the subquery'],
    'A correlated subquery is re-evaluated for each outer row, using that row\'s values.',
    `SELECT t.trip_id, t.city, t.fare FROM trips t WHERE t.status = 'completed' AND t.fare > (SELECT AVG(fare) FROM trips WHERE status = 'completed') ORDER BY t.trip_id;`),
  Q('P411', 'Latest completed order', 'shop', ['s_correlated'], 'Medium', 'Correlated MAX for latest row per group',
    'For each customer, return their most recent completed order (customer id, order id, order date). Sort by customer id.', ['customer_id', 'order_id', 'order_date'], true,
    `SELECT o.customer_id, o.order_id, o.order_date FROM orders o WHERE o.status = 'completed' AND o.order_date = (SELECT MAX(x.order_date) FROM orders x WHERE x.customer_id = o.customer_id AND x.status = 'completed') ORDER BY o.customer_id;`,
    ['Back-dated order with a higher id', 'Latest means by date, not by id.', `INSERT INTO orders VALUES (1018,1,'2026-01-02','completed',NULL);`],
    ['"Latest" is about the date.', 'Match each order\'s date to the customer\'s maximum date.', 'order_date = (SELECT MAX(order_date) … WHERE x.customer_id = o.customer_id AND status = \'completed\')'],
    'Order ids are not time. Compare dates, and apply the status filter in the subquery too.',
    `SELECT o.customer_id, o.order_id, o.order_date FROM orders o WHERE o.status = 'completed' AND o.order_id = (SELECT MAX(x.order_id) FROM orders x WHERE x.customer_id = o.customer_id AND x.status = 'completed') ORDER BY o.customer_id;`),
  Q('P412', 'Top earner per department', 'hr', ['s_correlated'], 'Medium', 'Correlated MAX, ties kept',
    'Who earns the most in each department (ties all included)? Ignore employees without a department. Return dept id, name, salary, sorted by dept id then name.', ['dept_id', 'name', 'salary'], true,
    `SELECT e.dept_id, e.name, e.salary FROM employees e WHERE e.dept_id IS NOT NULL AND e.salary = (SELECT MAX(x.salary) FROM employees x WHERE x.dept_id = e.dept_id) ORDER BY e.dept_id, e.name;`,
    ['Tie at the top', 'Both tied people must appear.', `INSERT INTO employees VALUES (17,'Advik',3,11,'Sales Lead',160000,'2026-04-01');`],
    ['The maximum is per department.', 'Correlate on dept_id.', 'salary = (SELECT MAX(salary) FROM employees x WHERE x.dept_id = e.dept_id)'],
    'Equality with the group maximum keeps every tied row, unlike LIMIT 1.',
    `SELECT e.dept_id, e.name, e.salary FROM employees e WHERE e.dept_id IS NOT NULL AND e.salary = (SELECT MAX(salary) FROM employees) ORDER BY e.dept_id, e.name;`),
  Q('P413', 'First thing each user did', 'saas', ['s_correlated'], 'Medium', 'Earliest row per user',
    'For each user, what was their first event? Return user id and event name, sorted by user id.', ['user_id', 'first_event'], true,
    `SELECT DISTINCT e.user_id, e.event_name AS first_event FROM events e WHERE e.event_time = (SELECT MIN(x.event_time) FROM events x WHERE x.user_id = e.user_id) ORDER BY e.user_id;`,
    ['A user whose first event is not signup', 'Do not assume the first event is a signup.', `INSERT INTO users VALUES (13,'2026-03-25','IN','organic'); INSERT INTO events VALUES (46,13,'login','2026-03-25 10:00','{}'),(47,13,'signup','2026-03-25 10:05','{}');`],
    ['Earliest per user, not overall.', 'Correlate on user_id.', 'event_time = (SELECT MIN(event_time) FROM events x WHERE x.user_id = e.user_id)'],
    'The minimum must be computed per user, so the subquery is correlated.',
    `SELECT DISTINCT e.user_id, e.event_name AS first_event FROM events e WHERE e.event_time = (SELECT MIN(event_time) FROM events) ORDER BY e.user_id;`),
  Q('P414', 'Pricey for the category', 'shop', ['s_correlated'], 'Medium', 'Correlated average',
    'Which products cost more than the average price of their own category? Return product id, name, category, price, sorted by id.', ['product_id', 'name', 'category', 'price'], true,
    `SELECT p.product_id, p.name, p.category, p.price FROM products p WHERE p.price > (SELECT AVG(x.price) FROM products x WHERE x.category = p.category) ORDER BY p.product_id;`,
    ['New expensive grocery', 'Category averages change with new products.', `INSERT INTO products VALUES (109,'Saffron','Grocery',2500,true);`],
    ['The benchmark is per category.', 'Correlate on category.', 'WHERE x.category = p.category'],
    'Each row is compared with its own group\'s average.',
    `SELECT p.product_id, p.name, p.category, p.price FROM products p WHERE p.price > (SELECT AVG(price) FROM products) ORDER BY p.product_id;`),
  Q('P415', 'Unusually large transactions', 'bank', ['s_correlated'], 'Hard', 'Correlated benchmark on absolute amounts',
    'List transactions whose absolute amount is above the average absolute amount of that same account. Return txn id, account id and amount, sorted by txn id.', ['txn_id', 'account_id', 'amount'], true,
    `SELECT t.txn_id, t.account_id, t.amount FROM transactions t WHERE ABS(t.amount) > (SELECT AVG(ABS(x.amount)) FROM transactions x WHERE x.account_id = t.account_id) ORDER BY t.txn_id;`,
    ['Large credit on a quiet account', 'Debits are negative; compare sizes, not signs.', `INSERT INTO transactions VALUES (19,'A4','2026-03-01 10:00',100,'card','Cafe'),(20,'A4','2026-03-02 10:00',-30000,'transfer','Rent');`],
    ['Debits are negative numbers.', 'Compare absolute values per account.', 'ABS(t.amount) > (SELECT AVG(ABS(x.amount)) … WHERE x.account_id = t.account_id)'],
    'Signed amounts mislead averages; take ABS on both sides and correlate on the account.',
    `SELECT t.txn_id, t.account_id, t.amount FROM transactions t WHERE t.amount > (SELECT AVG(x.amount) FROM transactions x WHERE x.account_id = t.account_id) ORDER BY t.txn_id;`),

  // ── EXISTS / NOT EXISTS / NOT IN ──
  Q('P420', 'Customers with failed payments', 'shop', ['s_exists'], 'Easy', 'EXISTS as a semi-join',
    'Which customers have had at least one failed payment attempt? Return customer id and name, sorted by id.', ['customer_id', 'name'], true,
    `SELECT c.customer_id, c.name FROM customers c WHERE EXISTS (SELECT 1 FROM orders o JOIN payments p ON p.order_id = o.order_id WHERE o.customer_id = c.customer_id AND p.status = 'failed') ORDER BY c.customer_id;`,
    ['Customer with many failures', 'Several failures still mean one customer row.', `INSERT INTO payments VALUES (18,1001,'upi',2597,'2026-01-05 10:00','failed'),(19,1001,'upi',2597,'2026-01-05 10:01','failed');`, 'Joins'],
    ['"At least one" – you only need existence.', 'EXISTS avoids duplicate customer rows.', 'WHERE EXISTS (SELECT 1 FROM orders o JOIN payments p … WHERE o.customer_id = c.customer_id AND p.status = \'failed\')'],
    'EXISTS stops at the first match and never multiplies the outer row.',
    `SELECT c.customer_id, c.name FROM customers c JOIN orders o ON o.customer_id = c.customer_id JOIN payments p ON p.order_id = o.order_id WHERE p.status = 'failed' ORDER BY c.customer_id;`),
  Q('P421', 'Instructors without courses', 'campus', ['s_exists', 'j_anti_semi'], 'Medium', 'NOT EXISTS vs NOT IN with NULLs',
    'Which instructors are not assigned to any course? Return instructor id and name.', ['instructor_id', 'name'], false,
    `SELECT i.instructor_id, i.name FROM instructors i WHERE NOT EXISTS (SELECT 1 FROM courses c WHERE c.instructor_id = i.instructor_id);`,
    ['Another idle instructor', 'New instructors with no course must appear.', `INSERT INTO instructors VALUES (5,'Dr. Sen','CS');`],
    ['One course has no instructor (NULL).', 'What does NOT IN do with a NULL in the list?', 'NOT EXISTS (SELECT 1 FROM courses c WHERE c.instructor_id = i.instructor_id)'],
    'A single NULL in the subquery makes NOT IN return nothing. NOT EXISTS is NULL-safe.',
    `SELECT instructor_id, name FROM instructors WHERE instructor_id NOT IN (SELECT instructor_id FROM courses);`, { patterns: ['anti_join'] }),
  Q('P422', 'Studying in their own field', 'campus', ['s_exists'], 'Medium', 'Correlated EXISTS with a cross-table comparison',
    'Which students are or were enrolled (not withdrawn) in at least one course from their own major\'s department? Return student id and name, sorted by id.', ['student_id', 'name'], true,
    `SELECT s.student_id, s.name FROM students s WHERE EXISTS (SELECT 1 FROM enrollments e JOIN courses c ON c.course_id = e.course_id WHERE e.student_id = s.student_id AND c.dept = s.major AND e.status <> 'withdrawn') ORDER BY s.student_id;`,
    ['Only a withdrawn in-major course', 'Withdrawn enrolments do not count.', `INSERT INTO enrollments VALUES (8,'C101','2026S',NULL,'withdrawn');`, 'Business logic'],
    ['Compare the course department with the student\'s major.', 'Exclude withdrawals inside the subquery.', 'EXISTS (… WHERE e.student_id = s.student_id AND c.dept = s.major AND e.status <> \'withdrawn\')'],
    'The correlation (student) and the extra conditions (dept, status) all live inside the EXISTS.',
    `SELECT s.student_id, s.name FROM students s WHERE EXISTS (SELECT 1 FROM enrollments e JOIN courses c ON c.course_id = e.course_id WHERE e.student_id = s.student_id AND c.dept = s.major) ORDER BY s.student_id;`),
  Q('P423', 'Departments with no low earners', 'hr', ['s_exists'], 'Medium', 'NOT EXISTS expressing "for all"',
    'List departments in which nobody earns less than 90000 (departments with no employees qualify). Return dept id and name, sorted by id.', ['dept_id', 'dept_name'], true,
    `SELECT d.dept_id, d.dept_name FROM departments d WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.dept_id = d.dept_id AND e.salary < 90000) ORDER BY d.dept_id;`,
    ['Department with one junior', 'One low earner disqualifies the department.', `INSERT INTO employees VALUES (17,'Advik',2,7,'Intern',40000,'2026-04-01');`],
    ['"Nobody below X" is the negation of "somebody below X".', 'Test for the absence of a low earner.', 'NOT EXISTS (… e.salary < 90000)'],
    'A universal condition ("everyone ≥ 90000") is NOT EXISTS of a counter-example, and is true for empty groups.',
    `SELECT DISTINCT d.dept_id, d.dept_name FROM departments d JOIN employees e ON e.dept_id = d.dept_id WHERE e.salary >= 90000 ORDER BY d.dept_id;`),
  Q('P424', 'Upgraded without inviting first', 'saas', ['s_exists'], 'Hard', 'NOT EXISTS with a time ordering',
    'Which users upgraded without having invited a teammate BEFORE the upgrade? Return user id, sorted.', ['user_id'], true,
    `SELECT DISTINCT up.user_id FROM events up WHERE up.event_name = 'upgrade' AND NOT EXISTS (SELECT 1 FROM events i WHERE i.user_id = up.user_id AND i.event_name = 'invite_teammate' AND i.event_time < up.event_time) ORDER BY up.user_id;`,
    ['Invite only after upgrading', 'An invite after the upgrade does not count.', `INSERT INTO events VALUES (46,7,'invite_teammate','2026-02-25 10:00','{}');`],
    ['Order matters between the two events.', 'The counter-example is an earlier invite.', 'NOT EXISTS (… i.event_name = \'invite_teammate\' AND i.event_time < up.event_time)'],
    'Put the time relationship inside the subquery, comparing with the outer row.',
    `SELECT DISTINCT up.user_id FROM events up WHERE up.event_name = 'upgrade' AND NOT EXISTS (SELECT 1 FROM events i WHERE i.user_id = up.user_id AND i.event_name = 'invite_teammate') ORDER BY up.user_id;`),
  Q('P425', 'Customers who referred nobody', 'shop', ['s_exists', 'j_anti_semi'], 'Medium', 'NOT IN pitfall with a nullable column',
    'Which customers have never referred another customer? Return customer id and name, sorted by id.', ['customer_id', 'name'], true,
    `SELECT c.customer_id, c.name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM customers r WHERE r.referred_by = c.customer_id) ORDER BY c.customer_id;`,
    ['A new customer refers someone', 'New referrers leave the list.', `INSERT INTO customers VALUES (11,'Tara Sen','tara@mail.com','Pune','2026-03-25',10);`],
    ['referred_by is NULL for many customers.', 'What does x NOT IN (…, NULL) return?', 'NOT EXISTS (SELECT 1 FROM customers r WHERE r.referred_by = c.customer_id)'],
    'NOT IN over a column containing NULL never succeeds. Prefer NOT EXISTS, or filter the NULLs out.',
    `SELECT customer_id, name FROM customers WHERE customer_id NOT IN (SELECT referred_by FROM customers) ORDER BY customer_id;`, { patterns: ['anti_join'] }),

  // ── Set operations ──
  Q('P430', 'Every city we touch', 'rides', ['s_setops'], 'Easy', 'UNION removes duplicates',
    'List every distinct city that appears as a rider home city, a driver base city or a trip city (ignore missing values), sorted alphabetically.', ['city'], true,
    `SELECT home_city AS city FROM riders WHERE home_city IS NOT NULL UNION SELECT city FROM drivers WHERE city IS NOT NULL UNION SELECT city FROM trips WHERE city IS NOT NULL ORDER BY city;`,
    ['A driver in a new city', 'New cities should appear exactly once.', `INSERT INTO drivers VALUES (17,'Nikhil','Pune','2026-02-12','bike');`],
    ['Three sources, one list.', 'Which set operator removes duplicates?', 'SELECT … UNION SELECT … UNION SELECT …'],
    'UNION de-duplicates; UNION ALL keeps every row.',
    `SELECT home_city AS city FROM riders WHERE home_city IS NOT NULL UNION ALL SELECT city FROM drivers WHERE city IS NOT NULL UNION ALL SELECT city FROM trips WHERE city IS NOT NULL ORDER BY city;`),
  Q('P431', 'Grocery and electronics', 'shop', ['s_setops'], 'Medium', 'INTERSECT',
    'Which customers have bought BOTH Grocery and Electronics products in completed orders? Return customer id, sorted.', ['customer_id'], true,
    `SELECT o.customer_id FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status = 'completed' AND p.category = 'Grocery'
INTERSECT
SELECT o.customer_id FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status = 'completed' AND p.category = 'Electronics'
ORDER BY customer_id;`,
    ['A grocery-only buyer', 'Only customers with both qualify.', `INSERT INTO orders VALUES (1018,10,'2026-04-12','completed',NULL); INSERT INTO order_items VALUES (1018,106,1,899);`],
    ['Two sets of customers.', 'Keep those in both.', 'query A INTERSECT query B'],
    'INTERSECT returns rows present in both results.',
    `SELECT o.customer_id FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status = 'completed' AND p.category IN ('Grocery','Electronics') GROUP BY o.customer_id ORDER BY o.customer_id;`),
  Q('P432', 'Ordered but never completed', 'shop', ['s_setops'], 'Medium', 'EXCEPT',
    'Which customers placed orders but never had one completed? Return customer id, sorted.', ['customer_id'], true,
    `SELECT customer_id FROM orders EXCEPT SELECT customer_id FROM orders WHERE status = 'completed' ORDER BY customer_id;`,
    ['Customer with a pending and a completed order', 'Any completed order removes them.', `INSERT INTO orders VALUES (1018,6,'2026-04-12','completed',NULL);`],
    ['Customers with any order minus customers with a completed one.', 'EXCEPT subtracts the second set.', 'SELECT customer_id FROM orders EXCEPT SELECT customer_id FROM orders WHERE status = \'completed\''],
    'Filtering to "not completed" keeps customers who also have completed orders. Set difference removes them entirely.',
    `SELECT DISTINCT customer_id FROM orders WHERE status <> 'completed' ORDER BY customer_id;`),
  Q('P433', 'Payroll with a total line', 'hr', ['s_setops'], 'Medium', 'UNION ALL to append a total row',
    'Show payroll per department name, with employees who have no department shown as "Unassigned", followed by a final "TOTAL" row covering every employee. Return label and payroll; departments alphabetical (Unassigned in order with them), TOTAL last.', ['label', 'payroll'], true,
    `SELECT label, payroll FROM (
  SELECT COALESCE(d.dept_name, 'Unassigned') AS label, SUM(e.salary) AS payroll, 0 AS grp FROM employees e LEFT JOIN departments d ON d.dept_id = e.dept_id GROUP BY d.dept_name
  UNION ALL
  SELECT 'TOTAL', SUM(salary), 1 FROM employees
) t ORDER BY grp, label;`,
    ['Another unassigned employee', 'The total must include everyone.', `INSERT INTO employees VALUES (17,'Advik',NULL,1,'Advisor',90000,'2026-04-01');`, 'NULL handling'],
    ['Two queries stacked.', 'Which operator keeps both result sets as is?', 'per-department SELECT UNION ALL SELECT \'TOTAL\', SUM(salary) …'],
    'UNION ALL appends rows without de-duplicating; an extra sort column keeps TOTAL last.',
    `SELECT label, payroll FROM (SELECT d.dept_name AS label, SUM(e.salary) AS payroll, 0 AS grp FROM employees e JOIN departments d ON d.dept_id = e.dept_id GROUP BY d.dept_name UNION ALL SELECT 'TOTAL', SUM(salary), 1 FROM employees) t ORDER BY grp, label;`),
  Q('P434', 'References on one side only', 'recon', ['s_setops'], 'Hard', 'Symmetric difference with EXCEPT + UNION',
    'List every order reference that appears in exactly one of ledger and settlements (ignore settlement lines without a reference). Return ref, sorted.', ['ref'], true,
    `(SELECT ref FROM ledger EXCEPT SELECT ref FROM settlements WHERE ref IS NOT NULL)
UNION
(SELECT ref FROM settlements WHERE ref IS NOT NULL EXCEPT SELECT ref FROM ledger)
ORDER BY ref;`,
    ['One more orphan each way', 'Both directions matter.', `INSERT INTO ledger VALUES ('ORD-8','Dyna',250,'2026-03-05'); INSERT INTO settlements VALUES (9,'ORD-10',90,'2026-03-10');`],
    ['Two directions of difference.', 'A minus B, plus B minus A.', '(A EXCEPT B) UNION (B EXCEPT A)'],
    'A single EXCEPT only finds one direction; combine both to get what is not shared.',
    `SELECT ref FROM ledger EXCEPT SELECT ref FROM settlements WHERE ref IS NOT NULL ORDER BY ref;`),

  // ── CTEs ──
  Q('P440', 'Spend versus average', 'shop', ['c_cte'], 'Medium', 'A CTE used twice',
    'For each customer with completed orders, show their total spend and the difference from the average customer spend (2 decimals). Sort by customer id.', ['customer_id', 'total', 'vs_avg'], true,
    `WITH spend AS (
  SELECT o.customer_id, SUM(oi.quantity * oi.unit_price) AS total FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.customer_id
), stats AS (SELECT AVG(total) AS a FROM spend)
SELECT s.customer_id, s.total, ROUND(s.total - st.a, 2) AS vs_avg FROM spend s CROSS JOIN stats st ORDER BY s.customer_id;`,
    ['A new big customer', 'The average moves with the data.', `INSERT INTO orders VALUES (1018,10,'2026-04-12','completed',NULL); INSERT INTO order_items VALUES (1018,105,5,2999);`],
    ['Compute totals once, reuse them.', 'A second CTE can average the first.', 'WITH spend AS (…), stats AS (SELECT AVG(total) FROM spend) …'],
    'CTEs name intermediate results so the same grain can feed two calculations.',
    `SELECT o.customer_id, SUM(oi.quantity * oi.unit_price) AS total, ROUND(SUM(oi.quantity * oi.unit_price) - (SELECT AVG(quantity * unit_price) FROM order_items), 2) AS vs_avg FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.customer_id ORDER BY o.customer_id;`),
  Q('P441', 'Week-one activation by channel', 'saas', ['c_cte', 'j_left'], 'Hard', 'CTE of qualifying users, then LEFT JOIN',
    'For each acquisition channel: signups, users who created a project within 7 days of their signup date (event date ≤ signup date + 7), and that percentage (1 decimal). Sort by channel.', ['channel', 'signups', 'activated', 'pct'], true,
    `WITH act AS (
  SELECT DISTINCT u.user_id FROM users u JOIN events e ON e.user_id = u.user_id AND e.event_name = 'create_project' AND e.event_time::date <= u.signup_date + 7
)
SELECT u.channel, COUNT(*) AS signups, COUNT(a.user_id) AS activated, ROUND(100.0 * COUNT(a.user_id) / COUNT(*), 1) AS pct
FROM users u LEFT JOIN act a ON a.user_id = u.user_id GROUP BY u.channel ORDER BY u.channel;`,
    ['Late project', 'A project after day 7 is not activation.', `INSERT INTO users VALUES (13,'2026-03-01','IN','organic'); INSERT INTO events VALUES (46,13,'create_project','2026-03-20 10:00','{}');`],
    ['Duplicate create_project events exist.', 'Reduce to one row per qualifying user first.', 'WITH act AS (SELECT DISTINCT user_id …) then LEFT JOIN'],
    'The CTE fixes the grain (one row per activated user) before it is joined back to all users.',
    `SELECT u.channel, COUNT(*) AS signups, COUNT(e.user_id) AS activated, ROUND(100.0 * COUNT(e.user_id) / COUNT(*), 1) AS pct FROM users u LEFT JOIN events e ON e.user_id = u.user_id AND e.event_name = 'create_project' AND e.event_time::date <= u.signup_date + 7 GROUP BY u.channel ORDER BY u.channel;`),
  Q('P442', 'Above-average drivers', 'rides', ['c_cte'], 'Medium', 'CTE reused for a benchmark',
    'Which drivers completed more trips than the average driver (average over drivers who completed at least one)? Return driver id and completed trips, sorted by driver id.', ['driver_id', 'completed_trips'], true,
    `WITH c AS (SELECT driver_id, COUNT(*) AS n FROM trips WHERE status = 'completed' GROUP BY driver_id)
SELECT driver_id, n AS completed_trips FROM c WHERE n > (SELECT AVG(n) FROM c) ORDER BY driver_id;`,
    ['Cancellations only', 'Cancelled trips never count.', `INSERT INTO trips VALUES (521,7,15,'Mumbai','2026-02-08 09:00','cancelled_driver',NULL,NULL),(522,7,15,'Mumbai','2026-02-08 10:00','cancelled_driver',NULL,NULL),(523,7,15,'Mumbai','2026-02-08 11:00','cancelled_driver',NULL,NULL);`, 'Business logic'],
    ['Count per driver once.', 'Reuse it for the average.', 'WITH c AS (…) SELECT … FROM c WHERE n > (SELECT AVG(n) FROM c)'],
    'A CTE can be referenced twice: once for rows, once for the benchmark.',
    `WITH c AS (SELECT driver_id, COUNT(*) AS n FROM trips WHERE driver_id IS NOT NULL GROUP BY driver_id) SELECT driver_id, n AS completed_trips FROM c WHERE n > (SELECT AVG(n) FROM c) ORDER BY driver_id;`),
  Q('P443', 'Monthly revenue share', 'shop', ['c_cte'], 'Medium', 'CTE + share of total',
    'For each month, completed revenue (quantity × charged price) and its share of all completed revenue (1 decimal). Months as first-of-month dates, sorted.', ['month', 'revenue', 'pct_of_total'], true,
    `WITH m AS (
  SELECT date_trunc('month', o.order_date)::date AS month, SUM(oi.quantity * oi.unit_price) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY 1
)
SELECT month, revenue, ROUND(100.0 * revenue / (SELECT SUM(revenue) FROM m), 1) AS pct_of_total FROM m ORDER BY month;`,
    ['A big new month', 'Shares are relative to the grand total.', `INSERT INTO orders VALUES (1018,10,'2026-05-02','completed',NULL); INSERT INTO order_items VALUES (1018,105,10,2999);`],
    ['Monthly revenue first.', 'Divide by the sum over all months.', 'WITH m AS (…) SELECT …, revenue / (SELECT SUM(revenue) FROM m)'],
    'Compute the monthly totals once, then compare each with their own sum.',
    `WITH m AS (SELECT date_trunc('month', o.order_date)::date AS month, SUM(oi.quantity * oi.unit_price) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.order_id GROUP BY 1) SELECT month, revenue, ROUND(100.0 * revenue / (SELECT SUM(revenue) FROM m), 1) AS pct_of_total FROM m ORDER BY month;`),
  Q('P444', 'Slow restaurants', 'food', ['c_cte'], 'Hard', 'Benchmark at order level vs restaurant level',
    'List restaurants whose average delivery time (minutes, 1 decimal, delivered orders only) is above the average delivery time of ALL delivered orders. Return name and avg minutes, sorted by name.', ['name', 'avg_minutes'], true,
    `WITH t AS (SELECT restaurant_id, AVG(EXTRACT(EPOCH FROM delivered_at - ordered_at) / 60) AS mins FROM deliveries WHERE status = 'delivered' GROUP BY restaurant_id)
SELECT r.name, ROUND(t.mins::numeric, 1) AS avg_minutes FROM t JOIN restaurants r ON r.restaurant_id = t.restaurant_id
WHERE t.mins > (SELECT AVG(EXTRACT(EPOCH FROM delivered_at - ordered_at) / 60) FROM deliveries WHERE status = 'delivered') ORDER BY r.name;`,
    ['One very busy fast restaurant', 'Order-weighted and restaurant-weighted averages differ.', `INSERT INTO deliveries SELECT 100+g, 2, 200, '2026-03-10 10:00', '2026-03-10 10:20', 'delivered', 100, 10, NULL, 1.0, 5 FROM generate_series(1,30) g;`],
    ['Two different averages are in play.', 'Is every order or every restaurant weighted equally?', 'Compare each restaurant average with the average over delivered ORDERS'],
    'The overall average over orders is not the average of restaurant averages; choose the one the question asks for.',
    `WITH t AS (SELECT restaurant_id, AVG(EXTRACT(EPOCH FROM delivered_at - ordered_at) / 60) AS mins FROM deliveries WHERE status = 'delivered' GROUP BY restaurant_id) SELECT r.name, ROUND(t.mins::numeric, 1) AS avg_minutes FROM t JOIN restaurants r ON r.restaurant_id = t.restaurant_id WHERE t.mins > (SELECT AVG(mins) FROM t) ORDER BY r.name;`),
  Q('P445', 'Repeat buyers\' span', 'shop', ['c_cte'], 'Medium', 'Aggregate in a CTE, filter after',
    'For customers with at least two completed orders, show their first order date, last order date and days between. Sort by customer id.', ['customer_id', 'first_order', 'last_order', 'days_between'], true,
    `WITH c AS (SELECT customer_id, MIN(order_date) AS f, MAX(order_date) AS l, COUNT(*) AS n FROM orders WHERE status = 'completed' GROUP BY customer_id)
SELECT customer_id, f AS first_order, l AS last_order, l - f AS days_between FROM c WHERE n >= 2 ORDER BY customer_id;`,
    ['Same-day double order', 'Two orders on one day are still two orders.', `INSERT INTO orders VALUES (1018,9,'2026-03-31','completed',NULL);`],
    ['One row per customer first.', 'Keep customers with 2+ orders.', 'WHERE n >= 2 on the CTE'],
    'Date subtraction gives days. Count orders, not dates, to decide who is a repeat buyer.',
    `SELECT customer_id, MIN(order_date) AS first_order, MAX(order_date) AS last_order, MAX(order_date) - MIN(order_date) AS days_between FROM orders WHERE status = 'completed' GROUP BY customer_id ORDER BY customer_id;`),

  // ── Recursive CTEs ──
  Q('P450', 'Everyone under the CTO', 'hr', ['c_recursive'], 'Hard', 'Walk a hierarchy downwards with depth',
    'List everyone who sits below the top of the org chart (the person with no manager) with their depth (direct reports = 1). Return emp id, name and level, sorted by level then id.', ['emp_id', 'name', 'level'], true,
    `WITH RECURSIVE t AS (
  SELECT emp_id, name, 0 AS level FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.emp_id, e.name, t.level + 1 FROM employees e JOIN t ON e.manager_id = t.emp_id
)
SELECT emp_id, name, level FROM t WHERE level > 0 ORDER BY level, emp_id;`,
    ['Deeper chain', 'The hierarchy can be deeper than the sample.', `INSERT INTO employees VALUES (17,'Advik',1,6,'Intern',40000,'2026-04-01'),(18,'Esha',1,17,'Intern',30000,'2026-04-02');`],
    ['Depth is unknown in advance.', 'Start at the root and repeatedly add reports.', 'WITH RECURSIVE t AS (anchor UNION ALL step joining employees.manager_id = t.emp_id)'],
    'A recursive CTE has an anchor (the root) and a step that finds the next level until nothing new appears.',
    `SELECT emp_id, name, 1 AS level FROM employees WHERE manager_id = (SELECT emp_id FROM employees WHERE manager_id IS NULL) ORDER BY emp_id;`, { patterns: ['hierarchy'] }),
  Q('P451', 'Chain of command', 'hr', ['c_recursive'], 'Hard', 'Walk a hierarchy upwards',
    'Show the full management chain above Harsh (emp 6): step 0 is Harsh, step 1 their manager, and so on up to the top. Return step and name, sorted by step.', ['steps', 'name'], true,
    `WITH RECURSIVE up AS (
  SELECT emp_id, name, manager_id, 0 AS steps FROM employees WHERE emp_id = 6
  UNION ALL
  SELECT e.emp_id, e.name, e.manager_id, up.steps + 1 FROM employees e JOIN up ON e.emp_id = up.manager_id
)
SELECT steps, name FROM up ORDER BY steps;`,
    ['Longer chain', 'The chain length must follow the data.', `UPDATE employees SET manager_id = 14 WHERE emp_id = 2;`],
    ['Go from the employee to their manager, repeatedly.', 'Stop when manager_id is NULL.', 'step: JOIN employees e ON e.emp_id = up.manager_id'],
    'Walking up reverses the join direction: the next row is the manager of the current one.',
    `SELECT 0 AS steps, e.name FROM employees e WHERE e.emp_id = 6 UNION ALL SELECT 1, m.name FROM employees e JOIN employees m ON m.emp_id = e.manager_id WHERE e.emp_id = 6 ORDER BY steps;`, { patterns: ['hierarchy'] }),
  Q('P452', 'Root of each referral chain', 'shop', ['c_recursive'], 'Hard', 'Propagate a root through a recursive CTE',
    'Every customer belongs to a referral chain that starts with someone who joined without a referral. Return each customer id with the id of the root of their chain (a root is their own root). Sort by customer id.', ['customer_id', 'root_referrer'], true,
    `WITH RECURSIVE r AS (
  SELECT customer_id, customer_id AS root FROM customers WHERE referred_by IS NULL
  UNION ALL
  SELECT c.customer_id, r.root FROM customers c JOIN r ON c.referred_by = r.customer_id
)
SELECT customer_id, root AS root_referrer FROM r ORDER BY customer_id;`,
    ['A longer chain', 'Roots are inherited down the chain.', `INSERT INTO customers VALUES (11,'Tara Sen','tara@mail.com','Pune','2026-03-25',9),(12,'Uma Das','uma@mail.com','Pune','2026-03-26',11);`],
    ['Carry the root along as a column.', 'Anchor: customers with no referrer. Step: their referrals inherit the same root.', 'SELECT c.customer_id, r.root FROM customers c JOIN r ON c.referred_by = r.customer_id'],
    'The recursive step can carry values from the anchor unchanged, which is how every row learns its root.',
    `SELECT customer_id, COALESCE(referred_by, customer_id) AS root_referrer FROM customers ORDER BY customer_id;`, { patterns: ['hierarchy'] }),
  Q('P453', 'Everything before Machine Learning', 'campus', ['c_recursive'], 'Hard', 'Transitive closure over a link table',
    'List the titles of ALL courses that must be completed before Machine Learning (C301), directly or through other prerequisites. Sorted by title.', ['prerequisite'], true,
    `WITH RECURSIVE p AS (
  SELECT prereq_id FROM course_prereqs WHERE course_id = 'C301'
  UNION
  SELECT cp.prereq_id FROM course_prereqs cp JOIN p ON cp.course_id = p.prereq_id
)
SELECT c.title AS prerequisite FROM p JOIN courses c ON c.course_id = p.prereq_id ORDER BY c.title;`,
    ['A prerequisite of a prerequisite', 'New links deepen the chain.', `INSERT INTO course_prereqs VALUES ('C101','C303');`],
    ['Prerequisites have prerequisites.', 'Keep following prereq_id → course_id links.', 'recursive step: JOIN course_prereqs cp ON cp.course_id = p.prereq_id'],
    'Transitive closure: repeatedly add the prerequisites of what you already have. UNION (not UNION ALL) avoids duplicates in diamond-shaped graphs.',
    `SELECT c.title AS prerequisite FROM course_prereqs p JOIN courses c ON c.course_id = p.prereq_id WHERE p.course_id = 'C301' ORDER BY c.title;`),
  Q('P454', 'Trips per day, gaps included', 'rides', ['c_recursive', 'j_left'], 'Hard', 'Generate a date series recursively, LEFT JOIN facts',
    'For every date from 2026-02-01 to 2026-02-09 inclusive, count trip requests (any status). Days without trips show 0. Sort by day.', ['day', 'trips'], true,
    `WITH RECURSIVE d AS (
  SELECT DATE '2026-02-01' AS day UNION ALL SELECT day + 1 FROM d WHERE day < DATE '2026-02-09'
)
SELECT d.day, COUNT(t.trip_id) AS trips FROM d LEFT JOIN trips t ON t.requested_at::date = d.day GROUP BY d.day ORDER BY d.day;`,
    ['A trip on the last day', 'The final date must be included.', `INSERT INTO trips VALUES (521,7,16,'Mumbai','2026-02-09 22:00','completed',100,3.0);`],
    ['Days without trips have no rows to count.', 'Generate the dates, then LEFT JOIN trips.', 'recursive CTE: day + 1 until the end date'],
    'A generated series guarantees every day exists; COUNT of the right-hand key gives 0 for empty days.',
    `SELECT requested_at::date AS day, COUNT(*) AS trips FROM trips GROUP BY 1 ORDER BY 1;`, { patterns: ['date_spine'] }),
  Q('P455', 'Total team size', 'hr', ['c_recursive'], 'Very Hard', 'Count all descendants per manager',
    'For every manager, count everyone beneath them at any depth (direct and indirect reports). Return manager name and total reports, biggest first, ties by name.', ['manager', 'total_reports'], true,
    `WITH RECURSIVE x AS (
  SELECT manager_id AS boss, emp_id FROM employees WHERE manager_id IS NOT NULL
  UNION ALL
  SELECT x.boss, e.emp_id FROM x JOIN employees e ON e.manager_id = x.emp_id
)
SELECT m.name AS manager, COUNT(*) AS total_reports FROM x JOIN employees m ON m.emp_id = x.boss GROUP BY m.emp_id, m.name ORDER BY total_reports DESC, m.name;`,
    ['A new layer', 'Indirect reports must roll up to every ancestor.', `INSERT INTO employees VALUES (17,'Advik',1,6,'Intern',40000,'2026-04-01');`],
    ['Each person counts for every boss above them.', 'Build (boss, descendant) pairs recursively.', 'anchor: (manager_id, emp_id); step: (x.boss, e.emp_id) joining e.manager_id = x.emp_id'],
    'Expanding to (ancestor, descendant) pairs lets a plain GROUP BY count the whole subtree.',
    `SELECT m.name AS manager, COUNT(*) AS total_reports FROM employees e JOIN employees m ON m.emp_id = e.manager_id GROUP BY m.emp_id, m.name ORDER BY total_reports DESC, m.name;`, { patterns: ['hierarchy'] }),
];

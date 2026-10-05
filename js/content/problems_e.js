// Level 2 — joins and grain. Datasets: shop, rides, hr, food, saas, campus, recon.
// P300s inner joins · P310s outer joins · P320s anti/semi · P330s self joins · P340s scaffolds · P350s fan-out · P360s multi-table & debugging.
const P = (o) => ({ v: 1, timeTarget: 8, difficulty: 'Medium', patterns: [], ...o });

export const PROBLEMS_E = [
  // ───────────────────────── INNER JOIN ─────────────────────────
  P({ id: 'P300', title: 'Receipt lines', dataset: 'shop', topics: ['j_inner'], skills: 'INNER JOIN across three tables, filtering on the parent', domain: 'E-commerce', difficulty: 'Easy', timeTarget: 6,
    prompt: 'Finance wants a receipt-style listing of every line item that belongs to a completed order: the order id, the product name, the quantity and the line total (quantity × the price actually charged).\n\nSort by order id, then product name.',
    output: ['order_id', 'product', 'quantity', 'line_total'], orderMatters: true,
    solution: `SELECT oi.order_id, p.name AS product, oi.quantity, oi.quantity * oi.unit_price AS line_total
FROM order_items oi
JOIN orders o   ON o.order_id = oi.order_id
JOIN products p ON p.product_id = oi.product_id
WHERE o.status = 'completed'
ORDER BY oi.order_id, p.name;`,
    tests: [{ name: 'Returned order with an inactive product', category: 'Business logic', why: 'Only completed orders are on the receipt, whatever the product status.', patch: `INSERT INTO orders VALUES (1018,10,'2026-04-12','returned',NULL); INSERT INTO order_items VALUES (1018,108,1,1499);` }],
    hints: ['A line item has no status of its own. Where does the status live?', 'You need the orders table for the filter and the products table for the name.', 'FROM order_items oi JOIN orders o ON o.order_id = oi.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status = \'completed\''],
    explain: 'Each JOIN needs an ON that equates the foreign key with the primary key it points to. The status filter belongs to the order, so the orders table must be joined even though no order column is displayed.',
    trap: `SELECT oi.order_id, p.name AS product, oi.quantity, oi.quantity * oi.unit_price AS line_total FROM order_items oi JOIN products p ON p.product_id = oi.product_id ORDER BY oi.order_id, p.name;`,
    techniques: ['join[\\s\\S]*join'], patterns: [] }),

  P({ id: 'P301', title: 'Payroll by department', dataset: 'hr', topics: ['j_inner', 'a_groupby'], skills: 'INNER JOIN + GROUP BY; what an inner join drops', domain: 'HR', difficulty: 'Easy', timeTarget: 6,
    prompt: 'For every department that currently has at least one employee, report the department name, its headcount and total salary. Biggest payroll first.',
    output: ['dept_name', 'headcount', 'total_salary'], orderMatters: true,
    solution: `SELECT d.dept_name, COUNT(*) AS headcount, SUM(e.salary) AS total_salary
FROM departments d
JOIN employees e ON e.dept_id = d.dept_id
GROUP BY d.dept_name
ORDER BY total_salary DESC;`,
    tests: [{ name: 'A department with no staff', category: 'Joins', why: 'An empty department has no payroll row at all.', patch: `INSERT INTO departments VALUES (6,'Research','Pune');` }],
    hints: ['Which table holds the department name and which holds the salaries?', 'Join on dept_id, then group by the department.', 'FROM departments d JOIN employees e ON e.dept_id = d.dept_id GROUP BY d.dept_name'],
    explain: 'An INNER JOIN keeps only departments with a matching employee, so Legal (no staff) and the employee without a department both vanish — exactly what the question asks for.',
    trap: `SELECT d.dept_name, COUNT(*) AS headcount, COALESCE(SUM(e.salary), 0) AS total_salary FROM departments d LEFT JOIN employees e ON e.dept_id = d.dept_id GROUP BY d.dept_name ORDER BY total_salary DESC;`,
    techniques: ['join'], patterns: [] }),

  P({ id: 'P302', title: 'Trip register', dataset: 'rides', topics: ['j_inner', 'j_multi'], skills: 'Joining on the right key, one row per trip', domain: 'Ride-sharing', difficulty: 'Easy', timeTarget: 7,
    prompt: 'Ops needs a register of completed trips: trip id, rider name, driver name, the driver\'s vehicle type and the fare. One row per trip, sorted by trip id.',
    output: ['trip_id', 'rider', 'driver', 'vehicle_type', 'fare'], orderMatters: true,
    solution: `SELECT t.trip_id, r.name AS rider, d.name AS driver, d.vehicle_type, t.fare
FROM trips t
JOIN riders r  ON r.rider_id  = t.rider_id
JOIN drivers d ON d.driver_id = t.driver_id
WHERE t.status = 'completed'
ORDER BY t.trip_id;`,
    tests: [{ name: 'Second driver in the same city', category: 'Joins', why: 'Joining on city instead of driver_id multiplies rows when a city has several drivers.', patch: `INSERT INTO drivers VALUES (17,'Nikhil','Mumbai','2026-02-12','bike'); INSERT INTO trips VALUES (521,7,17,'Mumbai','2026-02-08 09:00','completed',130,4.0);` }],
    hints: ['Check how many rows you get; it should equal the number of completed trips.', 'Each trip points to one rider and one driver through ids.', 'JOIN riders r ON r.rider_id = t.rider_id JOIN drivers d ON d.driver_id = t.driver_id'],
    explain: 'Join each child to the table whose primary key its foreign key references. City is not a key: several drivers share a city, so joining on it multiplies trips.',
    trap: `SELECT t.trip_id, r.name AS rider, d.name AS driver, d.vehicle_type, t.fare FROM trips t JOIN riders r ON r.rider_id = t.rider_id JOIN drivers d ON d.city = t.city WHERE t.status = 'completed' ORDER BY t.trip_id;`,
    techniques: ['join[\\s\\S]*join'], patterns: [],
    reasoning: [{ q: 'You join trips to drivers on city only. A city has 3 drivers. What happens to each trip row?', options: ['It appears once', 'It appears 3 times', 'It disappears'], answer: 1, why: 'A non-unique join key repeats the left row once per match.' }] }),

  P({ id: 'P303', title: 'Revenue by city and category', dataset: 'shop', topics: ['j_inner', 'j_multi', 'a_groupby'], skills: 'Four-table join, charged price vs list price', domain: 'E-commerce', timeTarget: 10,
    prompt: 'Merchandising wants completed-order revenue by customer city and product category. Revenue is what customers were actually charged (quantity × unit price on the order line). Customers with no city should still show up as an empty city.\n\nSort by city (empty last), then category.',
    output: ['city', 'category', 'revenue'], orderMatters: true,
    solution: `SELECT c.city, p.category, SUM(oi.quantity * oi.unit_price) AS revenue
FROM orders o
JOIN customers c    ON c.customer_id = o.customer_id
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p     ON p.product_id = oi.product_id
WHERE o.status = 'completed'
GROUP BY c.city, p.category
ORDER BY c.city NULLS LAST, p.category;`,
    tests: [{ name: 'Completed order from a customer with no city', category: 'NULL handling', why: 'Dropping NULL cities loses revenue; the city must be reported as an empty group.', patch: `INSERT INTO orders VALUES (1018,6,'2026-04-12','completed',NULL); INSERT INTO order_items VALUES (1018,104,1,1199);` }],
    hints: ['Trace the path: customer → order → line item → product.', 'Revenue comes from the order line, not from the products table.', 'SUM(oi.quantity * oi.unit_price) … GROUP BY c.city, p.category ORDER BY c.city NULLS LAST'],
    explain: 'The list price in products is today\'s price; unit_price is what the customer paid (order 1008 had a discount). Revenue always uses the transaction table.',
    trap: `SELECT c.city, p.category, SUM(oi.quantity * p.price) AS revenue FROM orders o JOIN customers c ON c.customer_id = o.customer_id JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status = 'completed' GROUP BY c.city, p.category ORDER BY c.city NULLS LAST, p.category;`,
    techniques: ['join[\\s\\S]*join[\\s\\S]*join'], patterns: [] }),

  P({ id: 'P304', title: 'Grade bands', dataset: 'campus', topics: ['j_inner', 'j_multi'], skills: 'Non-equi (range) join with half-open intervals', domain: 'Education', difficulty: 'Hard', timeTarget: 12,
    prompt: 'The registrar wants every completed enrolment labelled with its grade band. Return student name, course title, term, grade and band, sorted by student name, course title, then term.\n\nA grade belongs to a band when it is at least the band\'s minimum and below its maximum.',
    output: ['student', 'course', 'term', 'grade', 'band'], orderMatters: true,
    solution: `SELECT s.name AS student, c.title AS course, e.term, e.grade, b.band
FROM enrollments e
JOIN students s    ON s.student_id = e.student_id
JOIN courses c     ON c.course_id  = e.course_id
JOIN grade_bands b ON e.grade >= b.min_grade AND e.grade < b.max_grade
WHERE e.status = 'completed'
ORDER BY s.name, c.title, e.term;`,
    tests: [{ name: 'Boundary grades 5.0 and 10.0', category: 'Edge cases', why: 'Exactly-on-boundary grades must land in exactly one band.', patch: `INSERT INTO enrollments VALUES (8,'C101','2026S',10.0,'completed'),(8,'C203','2026S',5.0,'completed');` }],
    hints: ['A join condition does not have to be an equality.', 'Compare the grade with both ends of the band. Which end is exclusive?', 'JOIN grade_bands b ON e.grade >= b.min_grade AND e.grade < b.max_grade'],
    explain: 'Range joins with BETWEEN include both ends, so a grade of exactly 9.0 matches Merit and Distinction and the row doubles. Half-open intervals (>= min, < max) tile the scale with no overlap.',
    trap: `SELECT s.name AS student, c.title AS course, e.term, e.grade, b.band FROM enrollments e JOIN students s ON s.student_id = e.student_id JOIN courses c ON c.course_id = e.course_id JOIN grade_bands b ON e.grade BETWEEN b.min_grade AND b.max_grade WHERE e.status = 'completed' ORDER BY s.name, c.title, e.term;`,
    techniques: ['join\\s+grade_bands'], patterns: [],
    reasoning: [{ q: 'A grade of exactly 7.5 with BETWEEN min AND max against bands Pass (5–7.5) and Merit (7.5–9) matches…', options: ['Only Pass', 'Only Merit', 'Both bands'], answer: 2, why: 'BETWEEN is inclusive on both ends, so the shared boundary matches two rows.' }] }),

  P({ id: 'P305', title: 'Cuisine delivery speed', dataset: 'food', topics: ['j_inner', 'a_groupby'], skills: 'JOIN + filter + date arithmetic', domain: 'Food delivery', timeTarget: 10,
    prompt: 'For each cuisine, report how many orders were delivered and the average delivery time in minutes (ordered → delivered, 1 decimal). Ignore cancelled orders. Most deliveries first, ties by cuisine.',
    output: ['cuisine', 'delivered_orders', 'avg_minutes'], orderMatters: true,
    solution: `SELECT r.cuisine, COUNT(*) AS delivered_orders,
       ROUND(AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.ordered_at)) / 60)::numeric, 1) AS avg_minutes
FROM deliveries d
JOIN restaurants r ON r.restaurant_id = d.restaurant_id
WHERE d.status = 'delivered'
GROUP BY r.cuisine
ORDER BY delivered_orders DESC, r.cuisine;`,
    tests: [{ name: 'Cuisine whose only order was cancelled', category: 'Business logic', why: 'A cuisine with only cancellations must not appear with 0 or NULL.', patch: `INSERT INTO deliveries VALUES (21,6,113,'2026-03-10 20:00',NULL,'cancelled',500,0,NULL,6.0,NULL);` }],
    hints: ['Cuisine lives on restaurants; timestamps live on deliveries.', 'EXTRACT(EPOCH FROM interval) gives seconds.', 'ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - ordered_at))/60)::numeric, 1)'],
    explain: 'Filter the cancelled rows before aggregating, otherwise COUNT(*) includes orders that were never delivered.',
    trap: `SELECT r.cuisine, COUNT(*) AS delivered_orders, ROUND(AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.ordered_at)) / 60)::numeric, 1) AS avg_minutes FROM deliveries d JOIN restaurants r ON r.restaurant_id = d.restaurant_id GROUP BY r.cuisine ORDER BY delivered_orders DESC, r.cuisine;`,
    techniques: ['join'], patterns: [] }),

  P({ id: 'P306', title: 'Payment method mix', dataset: 'shop', topics: ['j_inner', 'a_distinct'], skills: 'Join + attempts vs orders (COUNT DISTINCT)', domain: 'Payments', timeTarget: 10,
    prompt: 'For completed orders only, summarise successful payments by method: how many successful payments, how many different orders they paid for, and the total amount. Sort by method.',
    output: ['method', 'successful_payments', 'orders_paid', 'total_amount'], orderMatters: true,
    solution: `SELECT p.method, COUNT(*) AS successful_payments, COUNT(DISTINCT p.order_id) AS orders_paid, SUM(p.amount) AS total_amount
FROM payments p
JOIN orders o ON o.order_id = p.order_id
WHERE o.status = 'completed' AND p.status = 'success'
GROUP BY p.method
ORDER BY p.method;`,
    tests: [{ name: 'Order paid in two successful instalments', category: 'Joins', why: 'Payments are per attempt; one order can have several successful payments.', patch: `INSERT INTO payments VALUES (18,1001,'card',100.00,'2026-01-06 10:00','success');` }],
    hints: ['Payments are attempts. Are orders and payments the same grain?', 'The returned order has a successful payment too; the status you need is on orders.', 'COUNT(DISTINCT p.order_id) for orders; COUNT(*) for payments'],
    explain: 'Two different counts live in one table: payments (rows) and orders (distinct parents). The join to orders also lets you filter by the order status.',
    trap: `SELECT p.method, COUNT(*) AS successful_payments, COUNT(*) AS orders_paid, SUM(p.amount) AS total_amount FROM payments p WHERE p.status = 'success' GROUP BY p.method ORDER BY p.method;`,
    techniques: ['join'], patterns: [] }),
  // ───────────────────────── OUTER JOINS ─────────────────────────
  P({ id: 'P310', title: 'Full course catalogue', dataset: 'campus', topics: ['j_left'], skills: 'LEFT JOIN + COALESCE for a missing parent', domain: 'Education', difficulty: 'Easy', timeTarget: 6,
    prompt: 'Print the course catalogue: every course with its id, title and instructor name. Courses that have no instructor yet must still be listed, showing "TBA" as the instructor. Sort by course id.',
    output: ['course_id', 'title', 'instructor'], orderMatters: true,
    solution: `SELECT c.course_id, c.title, COALESCE(i.name, 'TBA') AS instructor
FROM courses c
LEFT JOIN instructors i ON i.instructor_id = c.instructor_id
ORDER BY c.course_id;`,
    tests: [{ name: 'Another unassigned course', category: 'Joins', why: 'Every course with a NULL instructor_id must still appear.', patch: `INSERT INTO courses VALUES ('C304','Compilers','CS',4,NULL);` }],
    hints: ['A course with NULL instructor_id can never equal an instructor id.', 'Which table must keep all of its rows?', 'FROM courses c LEFT JOIN instructors i ON i.instructor_id = c.instructor_id, then COALESCE(i.name, \'TBA\')'],
    explain: 'An INNER JOIN silently drops courses without an instructor. LEFT JOIN keeps them and pads the instructor columns with NULL, which COALESCE turns into a label.',
    trap: `SELECT c.course_id, c.title, COALESCE(i.name, 'TBA') AS instructor FROM courses c JOIN instructors i ON i.instructor_id = c.instructor_id ORDER BY c.course_id;`,
    techniques: ['left\\s+(outer\\s+)?join'], patterns: [] }),

  P({ id: 'P311', title: 'Product sales scoreboard', dataset: 'shop', topics: ['j_left', 'j_multi'], skills: 'LEFT JOIN with a filter on a later table', domain: 'E-commerce', difficulty: 'Hard', timeTarget: 13,
    prompt: 'Merchandising wants every product in the catalogue — including ones that never sold — with units sold and revenue (quantity × charged price) counting completed orders only. Products with no completed sales show 0 for both.\n\nSort by product id.',
    output: ['product_id', 'name', 'units_sold', 'revenue'], orderMatters: true,
    solution: `SELECT p.product_id, p.name,
       COALESCE(SUM(x.quantity), 0) AS units_sold,
       COALESCE(SUM(x.quantity * x.unit_price), 0) AS revenue
FROM products p
LEFT JOIN (
  SELECT oi.product_id, oi.quantity, oi.unit_price
  FROM order_items oi
  JOIN orders o ON o.order_id = oi.order_id
  WHERE o.status = 'completed'
) x ON x.product_id = p.product_id
GROUP BY p.product_id, p.name
ORDER BY p.product_id;`,
    tests: [{ name: 'Product sold only on a cancelled order', category: 'Joins', why: 'It must show 0, not the cancelled units, and must not disappear.', patch: `INSERT INTO products VALUES (109,'Water Bottle','Fitness',499,true); INSERT INTO orders VALUES (1018,10,'2026-04-12','cancelled',NULL); INSERT INTO order_items VALUES (1018,109,3,499);` }],
    hints: ['Two tables sit between products and the status. Which join must be outer?', 'Filtering orders in a later ON clause does not remove the order_items rows that already matched. Restrict the items first.', 'LEFT JOIN a subquery (order_items JOIN orders WHERE status = \'completed\') instead of two LEFT JOINs'],
    explain: 'With products LEFT JOIN order_items LEFT JOIN orders ON … status = \'completed\', the cancelled order\'s items still match the first join and keep their units. Building the "completed lines" set first and LEFT JOINing it once gives exactly the right rows, and a WHERE after the join would remove products with no sales.',
    trap: `SELECT p.product_id, p.name, COALESCE(SUM(oi.quantity), 0) AS units_sold, COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue FROM products p LEFT JOIN order_items oi ON oi.product_id = p.product_id LEFT JOIN orders o ON o.order_id = oi.order_id AND o.status = 'completed' GROUP BY p.product_id, p.name ORDER BY p.product_id;`,
    techniques: ['left\\s+(outer\\s+)?join'], patterns: [] }),

  P({ id: 'P312', title: 'Class sizes', dataset: 'campus', topics: ['j_left', 'a_distinct'], skills: 'LEFT JOIN + COUNT(DISTINCT) on the optional side', domain: 'Education', timeTarget: 10,
    prompt: 'For every course, how many different students are enrolled — counting students who completed it or are taking it now, but not those who withdrew. Courses nobody is enrolled in show 0. Sort by course id.',
    output: ['course_id', 'title', 'students'], orderMatters: true,
    solution: `SELECT c.course_id, c.title, COUNT(DISTINCT e.student_id) AS students
FROM courses c
LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.status <> 'withdrawn'
GROUP BY c.course_id, c.title
ORDER BY c.course_id;`,
    tests: [{ name: 'Student retakes a course they already passed', category: 'Joins', why: 'Two enrolment rows for the same student are still one student.', patch: `INSERT INTO enrollments VALUES (1,'C101','2025F',9.5,'completed');` }],
    hints: ['Enrolments are per student per term. Can one student appear twice for a course?', 'The "not withdrawn" rule belongs in the ON clause so empty courses survive.', 'LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.status <> \'withdrawn\' … COUNT(DISTINCT e.student_id)'],
    explain: 'COUNT(DISTINCT e.student_id) is 0 for the NULL-padded row of an empty course and ignores repeat enrolments by the same student.',
    trap: `SELECT c.course_id, c.title, COUNT(*) AS students FROM courses c LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.status <> 'withdrawn' GROUP BY c.course_id, c.title ORDER BY c.course_id;`,
    techniques: ['left\\s+(outer\\s+)?join'], patterns: [] }),

  P({ id: 'P313', title: 'Signup to paid', dataset: 'saas', topics: ['j_left', 'j_fanout'], skills: 'LEFT JOIN to a one-to-many table, back to user grain', domain: 'SaaS', timeTarget: 10,
    prompt: 'One row per user: user id, signup date, the date their first paid subscription started (empty if they never paid) and how many subscription periods they have had in total. Sort by user id.',
    output: ['user_id', 'signup_date', 'first_paid_on', 'subscriptions'], orderMatters: true,
    solution: `SELECT u.user_id, u.signup_date, MIN(s.start_date) AS first_paid_on, COUNT(s.sub_id) AS subscriptions
FROM users u
LEFT JOIN subscriptions s ON s.user_id = u.user_id
GROUP BY u.user_id, u.signup_date
ORDER BY u.user_id;`,
    tests: [{ name: 'Another plan change', category: 'Joins', why: 'More subscription rows for one user must not create more user rows.', patch: `INSERT INTO subscriptions VALUES (7,1,'team',90,'2026-04-01',NULL); UPDATE subscriptions SET end_date = '2026-03-31' WHERE sub_id = 1;` }],
    hints: ['Users who never paid must still be listed.', 'A user can have several subscription rows (plan changes). What grain do you want back?', 'LEFT JOIN subscriptions, GROUP BY the user, MIN(start_date), COUNT(s.sub_id)'],
    explain: 'The join briefly changes the grain to one row per subscription; grouping by the user restores user grain. COUNT(s.sub_id) is 0 for users with no match, unlike COUNT(*).',
    trap: `SELECT u.user_id, u.signup_date, MIN(s.start_date) AS first_paid_on, COUNT(*) AS subscriptions FROM users u LEFT JOIN subscriptions s ON s.user_id = u.user_id GROUP BY u.user_id, u.signup_date ORDER BY u.user_id;`,
    techniques: ['left\\s+(outer\\s+)?join'], patterns: [] }),

  P({ id: 'P314', title: 'Unmatched references', dataset: 'recon', topics: ['j_left', 'j_anti_semi'], skills: 'FULL OUTER JOIN to find rows that exist on one side only', domain: 'Finance ops', difficulty: 'Hard', timeTarget: 14,
    prompt: 'Finance is reconciling the ledger with the bank. List every order reference that appears on one side only:\n• `ledger_only` — booked in the ledger but with no settlement line at all (amount = the ledger amount)\n• `settlement_only` — settled by the bank but not in the ledger (amount = total of its settlement lines)\n\nSettlement lines that carry no reference at all should be listed too, as a settlement_only row with an empty ref. Sort by ref, empty last.',
    output: ['ref', 'side', 'amount'], orderMatters: true,
    solution: `WITH s AS (
  SELECT ref, SUM(amount) AS settled FROM settlements GROUP BY ref
)
SELECT COALESCE(l.ref, s.ref) AS ref,
       CASE WHEN l.ref IS NULL THEN 'settlement_only' ELSE 'ledger_only' END AS side,
       COALESCE(l.amount, s.settled) AS amount
FROM ledger l
FULL JOIN s ON s.ref = l.ref
WHERE l.ref IS NULL OR s.settled IS NULL
ORDER BY 1 NULLS LAST;`,
    tests: [{ name: 'Extra unmatched rows on both sides', category: 'Joins', why: 'Both directions must keep appearing as data changes.', patch: `INSERT INTO ledger VALUES ('ORD-8','Dyna',250,'2026-03-05'); INSERT INTO settlements VALUES (9,'ORD-10',90,'2026-03-10'),(10,'ORD-10',10,'2026-03-11');` }],
    hints: ['A LEFT JOIN from the ledger only finds one of the two directions.', 'You need rows that are unmatched on either side. Remember a settled reference can be split into several lines.', 'Total the settlements per ref first, then FULL JOIN to the ledger and keep rows where either side is missing'],
    explain: 'FULL OUTER JOIN keeps unmatched rows from both tables. A NULL reference never equals anything, so those settlement lines stay unmatched and fall into the settlement-only group automatically.',
    trap: `WITH s AS (SELECT ref, SUM(amount) AS settled FROM settlements GROUP BY ref) SELECT l.ref, 'ledger_only' AS side, l.amount FROM ledger l LEFT JOIN s ON s.ref = l.ref WHERE s.ref IS NULL ORDER BY 1 NULLS LAST;`,
    techniques: ['full\\s+(outer\\s+)?join'], patterns: [] }),

  P({ id: 'P315', title: 'Reconciliation report', dataset: 'recon', topics: ['j_left', 'j_fanout'], skills: 'FULL JOIN after pre-aggregating the many side, status classification', domain: 'Finance ops', difficulty: 'Very Hard', timeTarget: 18,
    prompt: 'Produce the reconciliation report: one row per order reference (ignore settlement lines that have no reference), with the ledger amount, the total settled amount and a status:\n• `matched` — settled total equals the ledger amount\n• `short_paid` — settled less than ledger\n• `over_paid` — settled more than ledger\n• `unsettled` — in the ledger, nothing settled\n• `unbooked` — settled, but not in the ledger\n\nSort by ref.',
    output: ['ref', 'ledger_amount', 'settled_amount', 'status'], orderMatters: true,
    solution: `WITH s AS (
  SELECT ref, SUM(amount) AS settled_amount FROM settlements WHERE ref IS NOT NULL GROUP BY ref
)
SELECT COALESCE(l.ref, s.ref) AS ref, l.amount AS ledger_amount, s.settled_amount,
       CASE WHEN l.ref IS NULL THEN 'unbooked'
            WHEN s.ref IS NULL THEN 'unsettled'
            WHEN s.settled_amount = l.amount THEN 'matched'
            WHEN s.settled_amount < l.amount THEN 'short_paid'
            ELSE 'over_paid' END AS status
FROM ledger l
FULL JOIN s ON s.ref = l.ref
ORDER BY 1;`,
    tests: [{ name: 'Over-payment split across lines', category: 'Edge cases', why: 'Totals must be compared after summing the lines of one reference.', patch: `INSERT INTO settlements VALUES (9,'ORD-4',500,'2026-03-10'),(10,'ORD-4',400,'2026-03-11');` }],
    hints: ['ORD-2 was settled in two lines. What happens to its ledger row if you join the lines directly?', 'Aggregate settlements to one row per ref before joining, and use a join that keeps both sides.', 'WITH s AS (… GROUP BY ref) … ledger FULL JOIN s ON s.ref = l.ref, then CASE for the status'],
    explain: 'Joining the raw settlement lines splits ORD-2 into two rows, each compared with the full ledger amount, so it looks short-paid twice. Totalling per ref first keeps the grain at one row per reference.',
    trap: `SELECT COALESCE(l.ref, s.ref) AS ref, l.amount AS ledger_amount, s.amount AS settled_amount, CASE WHEN l.ref IS NULL THEN 'unbooked' WHEN s.ref IS NULL THEN 'unsettled' WHEN s.amount = l.amount THEN 'matched' WHEN s.amount < l.amount THEN 'short_paid' ELSE 'over_paid' END AS status FROM ledger l FULL JOIN settlements s ON s.ref = l.ref WHERE COALESCE(l.ref, s.ref) IS NOT NULL ORDER BY 1;`,
    techniques: ['full\\s+(outer\\s+)?join'], patterns: ['fanout_guard'],
    clarifications: [
      { q: 'Should settlement lines with no reference appear?', a: 'No. They cannot be attributed to an order, so leave them out of this report.' },
      { q: 'Can one reference have several settlement lines?', a: 'Yes. Compare the ledger amount with the total of all its lines.' },
    ] }),

  P({ id: 'P316', title: 'Student averages', dataset: 'campus', topics: ['j_left', 'f_null'], skills: 'LEFT JOIN with ON filter, NULL average', domain: 'Education', timeTarget: 10,
    prompt: 'List every student with how many courses they have completed and their average grade over those courses (1 decimal). A student with nothing completed shows 0 courses and an empty average. Sort by student id.',
    output: ['student_id', 'name', 'courses_completed', 'avg_grade'], orderMatters: true,
    solution: `SELECT s.student_id, s.name, COUNT(e.student_id) AS courses_completed, ROUND(AVG(e.grade), 1) AS avg_grade
FROM students s
LEFT JOIN enrollments e ON e.student_id = s.student_id AND e.status = 'completed'
GROUP BY s.student_id, s.name
ORDER BY s.student_id;`,
    tests: [{ name: 'New student with only a withdrawal', category: 'NULL handling', why: 'No completed courses means an empty average, not 0.', patch: `INSERT INTO students VALUES (9,'Ira','CS','2026-02-01'); INSERT INTO enrollments VALUES (9,'C101','2026S',NULL,'withdrawn');` }],
    hints: ['Students with no completed course must still be listed.', 'Put the status condition where it does not remove the student.', 'LEFT JOIN enrollments e ON e.student_id = s.student_id AND e.status = \'completed\''],
    explain: 'AVG over only NULLs is NULL (correct: no average exists), and COUNT(e.student_id) is 0. Do not COALESCE the average to 0; that would claim they scored zero.',
    trap: `SELECT s.student_id, s.name, COUNT(e.student_id) AS courses_completed, ROUND(AVG(e.grade), 1) AS avg_grade FROM students s LEFT JOIN enrollments e ON e.student_id = s.student_id WHERE e.status = 'completed' GROUP BY s.student_id, s.name ORDER BY s.student_id;`,
    techniques: ['left\\s+(outer\\s+)?join'], patterns: [] }),

  P({ id: 'P317', title: 'Org audit list', dataset: 'hr', topics: ['j_left'], skills: 'FULL OUTER JOIN across a nullable foreign key', domain: 'HR', timeTarget: 9,
    prompt: 'HR is auditing the org data. Return every department–employee pairing (department name, employee name), plus any department that has no employees (employee empty) and any employee with no department (department empty). Sort by department name (empty last), then employee name.',
    output: ['dept_name', 'employee'], orderMatters: true,
    solution: `SELECT d.dept_name, e.name AS employee
FROM departments d
FULL JOIN employees e ON e.dept_id = d.dept_id
ORDER BY d.dept_name NULLS LAST, e.name;`,
    tests: [{ name: 'A second empty department', category: 'Joins', why: 'Empty departments must keep appearing.', patch: `INSERT INTO departments VALUES (6,'Research','Pune');` }],
    hints: ['You need unmatched rows from both tables.', 'Which join type keeps unmatched rows on both sides?', 'FROM departments d FULL JOIN employees e ON e.dept_id = d.dept_id'],
    explain: 'FULL JOIN is the audit tool: matched pairs, orphans on the left (empty departments) and orphans on the right (employees without a department) in one result.',
    trap: `SELECT d.dept_name, e.name AS employee FROM employees e LEFT JOIN departments d ON d.dept_id = e.dept_id ORDER BY d.dept_name NULLS LAST, e.name;`,
    techniques: ['full\\s+(outer\\s+)?join'], patterns: [] }),
  // ───────────────────────── ANTI-JOINS & SEMI-JOINS ─────────────────────────
  P({ id: 'P320', title: 'Customers to win back', dataset: 'shop', topics: ['j_anti_semi', 'j_left'], skills: 'Anti-join with a filter on the other table', domain: 'E-commerce', timeTarget: 9,
    prompt: 'Retention wants customers who have never completed an order — people with no orders at all, and people whose orders were all cancelled, returned or still pending. Return customer id and name, sorted by id.',
    output: ['customer_id', 'name'], orderMatters: true,
    solution: `SELECT c.customer_id, c.name
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id AND o.status = 'completed'
)
ORDER BY c.customer_id;`,
    tests: [{ name: 'Customer with only a returned order', category: 'Business logic', why: 'A returned order is not a completed one.', patch: `INSERT INTO customers VALUES (11,'Tara Sen','tara@mail.com','Pune','2026-03-25',NULL); INSERT INTO orders VALUES (1018,11,'2026-04-01','returned',NULL);` }],
    hints: ['"Never completed" is not the same as "never ordered".', 'Test for the absence of a matching completed order.', 'NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id AND o.status = \'completed\')'],
    explain: 'The status condition is part of what "match" means, so it sits inside the NOT EXISTS (or in the ON of a LEFT JOIN). Checking only for any order misses customers whose orders all failed.',
    trap: `SELECT c.customer_id, c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.order_id IS NULL ORDER BY c.customer_id;`,
    techniques: ['not\\s+exists|left\\s+join[\\s\\S]*is\\s+null|not\\s+in'], patterns: ['anti_join'] }),

  P({ id: 'P321', title: 'Electronics buyers', dataset: 'shop', topics: ['j_anti_semi', 'j_multi'], skills: 'Semi-join: "has at least one", no duplicate rows', domain: 'E-commerce', timeTarget: 10,
    prompt: 'Which customers have bought at least one Electronics product in a completed order? List each customer once with id and name, sorted by id.',
    output: ['customer_id', 'name'], orderMatters: true,
    solution: `SELECT c.customer_id, c.name
FROM customers c
WHERE EXISTS (
  SELECT 1
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.order_id
  JOIN products p     ON p.product_id = oi.product_id
  WHERE o.customer_id = c.customer_id AND o.status = 'completed' AND p.category = 'Electronics'
)
ORDER BY c.customer_id;`,
    tests: [{ name: 'Customer buying electronics repeatedly', category: 'Joins', why: 'Each extra matching row must not repeat the customer.', patch: `INSERT INTO orders VALUES (1018,9,'2026-04-12','completed',NULL),(1019,9,'2026-04-13','completed',NULL); INSERT INTO order_items VALUES (1018,101,1,799),(1018,102,1,3499),(1019,103,1,1999);` }],
    hints: ['A customer who bought three electronics items would appear three times after a plain join.', 'You only need to know whether a match exists, not to see the matches.', 'WHERE EXISTS (SELECT 1 FROM orders … JOIN order_items … JOIN products … WHERE o.customer_id = c.customer_id AND …)'],
    explain: 'EXISTS is a semi-join: it asks "is there at least one match?" and never multiplies the customer row, unlike an INNER JOIN, which would need a DISTINCT to repair it.',
    trap: `SELECT c.customer_id, c.name FROM customers c JOIN orders o ON o.customer_id = c.customer_id JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status = 'completed' AND p.category = 'Electronics' ORDER BY c.customer_id;`,
    techniques: ['exists|distinct|\\bin\\s*\\('], patterns: [] }),

  P({ id: 'P322', title: 'Never withdrew', dataset: 'campus', topics: ['j_anti_semi'], skills: 'NOT EXISTS vs joining to "other" rows', domain: 'Education', timeTarget: 9,
    prompt: 'List every student who has never withdrawn from a course — including students with no enrolments yet. Return student id and name, sorted by id.',
    output: ['student_id', 'name'], orderMatters: true,
    solution: `SELECT s.student_id, s.name
FROM students s
WHERE NOT EXISTS (
  SELECT 1 FROM enrollments e WHERE e.student_id = s.student_id AND e.status = 'withdrawn'
)
ORDER BY s.student_id;`,
    tests: [{ name: 'Student whose only enrolment is a withdrawal', category: 'Edge cases', why: 'Having other-status rows must not matter; any withdrawal disqualifies.', patch: `INSERT INTO students VALUES (9,'Ira','CS','2026-02-01'); INSERT INTO enrollments VALUES (9,'C101','2026S',NULL,'withdrawn');` }],
    hints: ['Bilal withdrew from one course but completed others.', '"Never" means there must be no matching row at all.', 'WHERE NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.student_id AND e.status = \'withdrawn\')'],
    explain: 'Filtering enrolments to status <> \'withdrawn\' and joining keeps anyone who has at least one other enrolment — including students who did withdraw — and drops students with none. The anti-join expresses the actual rule.',
    trap: `SELECT DISTINCT s.student_id, s.name FROM students s JOIN enrollments e ON e.student_id = s.student_id WHERE e.status <> 'withdrawn' ORDER BY s.student_id;`,
    techniques: ['not\\s+exists|left\\s+join[\\s\\S]*is\\s+null|not\\s+in'], patterns: ['anti_join'] }),

  P({ id: 'P323', title: 'Quiet courses', dataset: 'campus', topics: ['j_anti_semi', 'j_left'], skills: 'Anti-join restricted to one term', domain: 'Education', timeTarget: 10,
    prompt: 'Which courses have nobody enrolled in term 2026S (any status)? That includes courses that were taught in other terms. Return course id and title, sorted by course id.',
    output: ['course_id', 'title'], orderMatters: true,
    solution: `SELECT c.course_id, c.title
FROM courses c
LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.term = '2026S'
WHERE e.course_id IS NULL
ORDER BY c.course_id;`,
    tests: [{ name: 'New course enrolled only in 2026S', category: 'Joins', why: 'A course with a 2026S enrolment must be excluded, even if brand new.', patch: `INSERT INTO courses VALUES ('C304','Compilers','CS',4,1); INSERT INTO enrollments VALUES (1,'C304','2026S',NULL,'in_progress');` }],
    hints: ['A course with enrolments in 2025F is still "quiet" in 2026S.', 'Which part of the condition belongs inside the join, and which in WHERE?', 'LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.term = \'2026S\' WHERE e.course_id IS NULL'],
    explain: 'The term restriction defines what counts as a match, so it goes in ON. The NULL test in WHERE then keeps only courses with no match in that term.',
    trap: `SELECT c.course_id, c.title FROM courses c LEFT JOIN enrollments e ON e.course_id = c.course_id WHERE e.student_id IS NULL ORDER BY c.course_id;`,
    techniques: ['not\\s+exists|left\\s+join[\\s\\S]*is\\s+null|not\\s+in'], patterns: ['anti_join'] }),

  P({ id: 'P324', title: 'Drivers without a completed trip', dataset: 'rides', topics: ['j_anti_semi', 'j_left'], skills: 'Anti-join: absence of a qualifying row', domain: 'Ride-sharing', timeTarget: 9,
    prompt: 'Which drivers have never completed a trip? Drivers with no trips at all count. Return driver id and name, sorted by id.',
    output: ['driver_id', 'name'], orderMatters: true,
    solution: `SELECT d.driver_id, d.name
FROM drivers d
WHERE NOT EXISTS (
  SELECT 1 FROM trips t WHERE t.driver_id = d.driver_id AND t.status = 'completed'
)
ORDER BY d.driver_id;`,
    tests: [{ name: 'Driver with only cancelled trips', category: 'Business logic', why: 'Cancelled trips do not count as completed.', patch: `INSERT INTO drivers VALUES (17,'Nikhil','Mumbai','2026-02-12','bike'); INSERT INTO trips VALUES (521,7,17,'Mumbai','2026-02-08 09:00','cancelled_driver',NULL,NULL);` }],
    hints: ['Driver 11 has a cancelled trip and also completed trips.', 'You need drivers for whom no completed trip exists.', 'NOT EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = d.driver_id AND t.status = \'completed\')'],
    explain: '"Has any non-completed trip" is not the negation of "has a completed trip". The negation is "has no completed trip", which is exactly what NOT EXISTS says.',
    trap: `SELECT d.driver_id, d.name FROM drivers d LEFT JOIN trips t ON t.driver_id = d.driver_id WHERE t.status <> 'completed' OR t.trip_id IS NULL GROUP BY d.driver_id, d.name ORDER BY d.driver_id;`,
    techniques: ['not\\s+exists|left\\s+join[\\s\\S]*is\\s+null|not\\s+in'], patterns: ['anti_join'] }),

  P({ id: 'P325', title: 'People without a team', dataset: 'hr', topics: ['j_anti_semi', 'j_self'], skills: 'Anti-join on a self-referencing key (NULL-safe)', domain: 'HR', difficulty: 'Hard', timeTarget: 11,
    prompt: 'Which employees have no direct reports — nobody lists them as their manager? Return employee id and name, sorted by id.',
    output: ['emp_id', 'name'], orderMatters: true,
    solution: `SELECT e.emp_id, e.name
FROM employees e
WHERE NOT EXISTS (SELECT 1 FROM employees r WHERE r.manager_id = e.emp_id)
ORDER BY e.emp_id;`,
    tests: [{ name: 'New hire under an existing individual contributor', category: 'Edge cases', why: 'Anyone who gains a report must leave the list.', patch: `INSERT INTO employees VALUES (17,'Advik',1,6,'Intern',40000,'2026-04-01');` }],
    hints: ['The same table plays two roles: employee and manager.', 'The CTO\'s manager_id is NULL. What does NOT IN do when the list contains a NULL?', 'NOT EXISTS (SELECT 1 FROM employees r WHERE r.manager_id = e.emp_id)'],
    explain: 'x NOT IN (…, NULL) is never true, so the NOT IN version returns no rows at all. NOT EXISTS compares one row at a time and is immune to NULLs in the subquery.',
    trap: `SELECT e.emp_id, e.name FROM employees e WHERE e.emp_id NOT IN (SELECT manager_id FROM employees) ORDER BY e.emp_id;`,
    techniques: ['not\\s+exists|left\\s+join[\\s\\S]*is\\s+null'], patterns: ['anti_join'],
    reasoning: [{ q: 'SELECT … WHERE 5 NOT IN (1, 2, NULL) returns…', options: ['The row (5 is not in the list)', 'No row', 'An error'], answer: 1, why: '5 <> NULL is unknown, so the whole NOT IN is unknown, and unknown rows are filtered out.' }] }),

  P({ id: 'P326', title: 'No project yet', dataset: 'saas', topics: ['j_anti_semi'], skills: 'Anti-join against an events table', domain: 'SaaS', timeTarget: 9,
    prompt: 'Product wants to nudge users who have never created a project. List them with their user id and signup date, sorted by user id.',
    output: ['user_id', 'signup_date'], orderMatters: true,
    solution: `SELECT u.user_id, u.signup_date
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM events e WHERE e.user_id = u.user_id AND e.event_name = 'create_project'
)
ORDER BY u.user_id;`,
    tests: [{ name: 'User with no events at all', category: 'Edge cases', why: 'No events means no project, so they must be listed.', patch: `INSERT INTO users VALUES (13,'2026-03-25','IN','organic');` }],
    hints: ['Most users have other events. Does that matter?', 'The condition must say "no row exists with this event name".', 'NOT EXISTS (SELECT 1 FROM events e WHERE e.user_id = u.user_id AND e.event_name = \'create_project\')'],
    explain: 'Filtering events to "not a create_project" keeps every user who did anything else — including those who created a project. Negate the existence, not the row filter.',
    trap: `SELECT DISTINCT u.user_id, u.signup_date FROM users u JOIN events e ON e.user_id = u.user_id WHERE e.event_name <> 'create_project' ORDER BY u.user_id;`,
    techniques: ['not\\s+exists|left\\s+join[\\s\\S]*is\\s+null|not\\s+in'], patterns: ['anti_join'] }),

  P({ id: 'P327', title: 'Both core courses', dataset: 'campus', topics: ['j_anti_semi', 'j_multi'], skills: 'Relational division: has ALL of several things', domain: 'Education', difficulty: 'Hard', timeTarget: 14,
    prompt: 'Which students have passed (grade 5 or more, status completed) both Intro to Programming (C101) and Data Structures (C102)? A student may have retaken a course. Return student id and name, sorted by id.',
    output: ['student_id', 'name'], orderMatters: true,
    solution: `SELECT s.student_id, s.name
FROM students s
JOIN enrollments e ON e.student_id = s.student_id
WHERE e.course_id IN ('C101', 'C102') AND e.status = 'completed' AND e.grade >= 5
GROUP BY s.student_id, s.name
HAVING COUNT(DISTINCT e.course_id) = 2
ORDER BY s.student_id;`,
    tests: [{ name: 'Passed C101 twice, never C102', category: 'Edge cases', why: 'Two passes of the same course are not two different courses.', patch: `INSERT INTO enrollments VALUES (6,'C101','2026S',9.0,'completed');` }],
    hints: ['IN (…) finds students with either course. How do you require both?', 'Count the distinct qualifying courses per student.', 'GROUP BY student HAVING COUNT(DISTINCT course_id) = 2 (or two EXISTS)'],
    explain: 'The WHERE keeps only passing rows of the two courses; HAVING COUNT(DISTINCT course_id) = 2 then demands both. DISTINCT matters because retakes create several rows for one course.',
    trap: `SELECT DISTINCT s.student_id, s.name FROM students s JOIN enrollments e ON e.student_id = s.student_id WHERE e.course_id IN ('C101', 'C102') AND e.status = 'completed' AND e.grade >= 5 ORDER BY s.student_id;`,
    techniques: ['having|exists[\\s\\S]*exists|intersect'], patterns: [] }),

  P({ id: 'P357', title: 'Unsettled money by merchant', dataset: 'recon', topics: ['j_anti_semi', 'j_fanout'], skills: 'Anti-join over a column that contains NULLs', domain: 'Finance ops', difficulty: 'Hard', timeTarget: 12,
    prompt: 'For each merchant, how many ledger orders have no settlement line at all, and how much money is that in total? Only merchants with at least one such order. Sort by merchant.',
    output: ['merchant', 'unsettled_orders', 'unsettled_amount'], orderMatters: true,
    solution: `SELECT l.merchant, COUNT(*) AS unsettled_orders, SUM(l.amount) AS unsettled_amount
FROM ledger l
WHERE NOT EXISTS (SELECT 1 FROM settlements s WHERE s.ref = l.ref)
GROUP BY l.merchant
ORDER BY l.merchant;`,
    tests: [{ name: 'A merchant fully settled and one new unsettled order', category: 'Edge cases', why: 'Merchants with nothing unsettled must not appear; new orders must be picked up.', patch: `INSERT INTO ledger VALUES ('ORD-8','Acme',250,'2026-03-05');` }],
    hints: ['Some settlement lines have no reference.', 'What does NOT IN do when the list contains a NULL?', 'NOT EXISTS (SELECT 1 FROM settlements s WHERE s.ref = l.ref) then GROUP BY merchant'],
    explain: 'The bank sent a line with a NULL reference, so ref NOT IN (SELECT ref FROM settlements) is never true and returns nothing. NOT EXISTS ignores that row because NULL = ref is never a match.',
    trap: `SELECT l.merchant, COUNT(*) AS unsettled_orders, SUM(l.amount) AS unsettled_amount FROM ledger l WHERE l.ref NOT IN (SELECT ref FROM settlements) GROUP BY l.merchant ORDER BY l.merchant;`,
    techniques: ['not\\s+exists|left\\s+join[\\s\\S]*is\\s+null'], patterns: ['anti_join'] }),

  P({ id: 'P358', title: 'Trips nobody rated', dataset: 'rides', topics: ['j_anti_semi', 'j_left'], skills: 'Anti-join on the right side of a two-sided relationship', domain: 'Ride-sharing', timeTarget: 10,
    prompt: 'Which completed trips have not been rated by the rider? (A trip can have a driver-side rating too; that does not count.) Return trip id and rider id, sorted by trip id.',
    output: ['trip_id', 'rider_id'], orderMatters: true,
    solution: `SELECT t.trip_id, t.rider_id
FROM trips t
WHERE t.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.trip_id = t.trip_id AND r.rated_by = 'rider')
ORDER BY t.trip_id;`,
    tests: [{ name: 'Trip rated only by the driver', category: 'Edge cases', why: 'A driver-side rating is not a rider rating.', patch: `INSERT INTO ratings VALUES (517,'driver',4);` }],
    hints: ['Ratings has two kinds of rows per trip.', 'The side that rated is part of what counts as a match.', 'NOT EXISTS (SELECT 1 FROM ratings r WHERE r.trip_id = t.trip_id AND r.rated_by = \'rider\')'],
    explain: 'Define the match completely (same trip AND rated by the rider) before negating it. Otherwise a driver-side rating hides a trip the rider never rated.',
    trap: `SELECT t.trip_id, t.rider_id FROM trips t WHERE t.status = 'completed' AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.trip_id = t.trip_id) ORDER BY t.trip_id;`,
    techniques: ['not\\s+exists|left\\s+join[\\s\\S]*is\\s+null|not\\s+in'], patterns: ['anti_join'] }),
  // ───────────────────────── SELF JOINS ─────────────────────────
  P({ id: 'P330', title: 'Who referred whom', dataset: 'shop', topics: ['j_self'], skills: 'Self join on a foreign key to the same table', domain: 'E-commerce', difficulty: 'Easy', timeTarget: 6,
    prompt: 'List every referred customer together with the name of the customer who referred them. Customers who signed up without a referral are not part of this list. Sort by the referred customer\'s id.',
    output: ['customer', 'referrer'], orderMatters: true,
    solution: `SELECT c.name AS customer, r.name AS referrer
FROM customers c
JOIN customers r ON r.customer_id = c.referred_by
ORDER BY c.customer_id;`,
    tests: [{ name: 'A referral chain', category: 'Joins', why: 'Direction matters: the referred person is the one holding the referred_by id.', patch: `INSERT INTO customers VALUES (11,'Tara Sen','tara@mail.com','Pune','2026-03-25',10);` }],
    hints: ['The same table appears twice with different roles.', 'referred_by holds the id of the referrer. Which alias owns that column?', 'FROM customers c JOIN customers r ON r.customer_id = c.referred_by'],
    explain: 'Give each role its own alias. The row that holds referred_by is the referred customer; the row it points to is the referrer. Swapping the two sides reverses every pair.',
    trap: `SELECT c.name AS customer, r.name AS referrer FROM customers c JOIN customers r ON c.customer_id = r.referred_by ORDER BY c.customer_id;`,
    techniques: ['join\\s+customers'], patterns: ['hierarchy'] }),

  P({ id: 'P331', title: 'Reporting chain', dataset: 'hr', topics: ['j_self', 'j_left'], skills: 'Chained self joins with LEFT JOIN', domain: 'HR', timeTarget: 10,
    prompt: 'For every employee show their name, their manager\'s name and their manager\'s manager\'s name ("skip-level"). Anyone without a manager or skip-level shows an empty value there. Sort by employee id.',
    output: ['employee', 'manager', 'skip_level'], orderMatters: true,
    solution: `SELECT e.name AS employee, m.name AS manager, s.name AS skip_level
FROM employees e
LEFT JOIN employees m ON m.emp_id = e.manager_id
LEFT JOIN employees s ON s.emp_id = m.manager_id
ORDER BY e.emp_id;`,
    tests: [{ name: 'New hire under a deep manager', category: 'Joins', why: 'The chain must be followed, and shorter chains kept.', patch: `INSERT INTO employees VALUES (17,'Advik',1,6,'Intern',40000,'2026-04-01');` }],
    hints: ['Join the same table twice, once per level.', 'The CTO has no manager and the CTO\'s reports have no skip-level. Which join type keeps them?', 'LEFT JOIN employees m ON m.emp_id = e.manager_id LEFT JOIN employees s ON s.emp_id = m.manager_id'],
    explain: 'Each extra INNER JOIN would drop everyone whose chain is shorter. LEFT JOINs keep them and leave the missing levels empty.',
    trap: `SELECT e.name AS employee, m.name AS manager, s.name AS skip_level FROM employees e JOIN employees m ON m.emp_id = e.manager_id JOIN employees s ON s.emp_id = m.manager_id ORDER BY e.emp_id;`,
    techniques: ['join[\\s\\S]*join'], patterns: ['hierarchy'] }),

  P({ id: 'P332', title: 'Salary twins', dataset: 'hr', topics: ['j_self'], skills: 'Pairs within a table, each pair once', domain: 'HR', timeTarget: 10,
    prompt: 'Compensation wants to review pairs of colleagues in the same department who earn exactly the same salary. List each pair once: both names (smaller employee id first), the department id and the salary. Sort by department id, then the first name.',
    output: ['employee_a', 'employee_b', 'dept_id', 'salary'], orderMatters: true,
    solution: `SELECT a.name AS employee_a, b.name AS employee_b, a.dept_id, a.salary
FROM employees a
JOIN employees b ON b.dept_id = a.dept_id AND b.salary = a.salary AND b.emp_id > a.emp_id
ORDER BY a.dept_id, a.name;`,
    tests: [{ name: 'Three people on one salary', category: 'Edge cases', why: 'Three equals produce three distinct pairs.', patch: `INSERT INTO employees VALUES (17,'Advik',1,2,'Engineer',110000,'2026-04-01');` }],
    hints: ['Compare each employee with every other employee.', 'Joining with <> gives (A,B) and (B,A). How can you keep just one?', 'ON b.dept_id = a.dept_id AND b.salary = a.salary AND b.emp_id > a.emp_id'],
    explain: 'A strict inequality on the id picks exactly one orientation of each unordered pair and also removes self-pairs.',
    trap: `SELECT a.name AS employee_a, b.name AS employee_b, a.dept_id, a.salary FROM employees a JOIN employees b ON b.dept_id = a.dept_id AND b.salary = a.salary AND b.emp_id <> a.emp_id ORDER BY a.dept_id, a.name;`,
    techniques: ['join\\s+employees'], patterns: [],
    reasoning: [{ q: 'Four colleagues share one salary. How many pairs does "emp_id <> emp_id" return? And with "<"?', options: ['12 and 6', '6 and 12', '4 and 4'], answer: 0, why: '<> returns each unordered pair twice (4×3 = 12); < returns each once (6).' }] }),

  P({ id: 'P333', title: 'Repeat requests within a day', dataset: 'rides', topics: ['j_self'], skills: 'Self join on a time window', domain: 'Ride-sharing', difficulty: 'Hard', timeTarget: 14,
    prompt: 'Find pairs of trip requests (any status) made by the same rider where the second request came after the first and no more than 24 hours later (exactly 24 hours counts). Return rider id and the two trip ids. Sort by rider, then first trip, then second trip.',
    output: ['rider_id', 'first_trip', 'second_trip'], orderMatters: true,
    solution: `SELECT a.rider_id, a.trip_id AS first_trip, b.trip_id AS second_trip
FROM trips a
JOIN trips b ON b.rider_id = a.rider_id
            AND b.requested_at > a.requested_at
            AND b.requested_at <= a.requested_at + INTERVAL '24 hours'
ORDER BY a.rider_id, a.trip_id, b.trip_id;`,
    tests: [{ name: 'Request exactly 24 hours later', category: 'Edge cases', why: 'The 24-hour boundary is inclusive.', patch: `INSERT INTO trips VALUES (521,1,NULL,'Bengaluru','2026-02-06 08:00','cancelled_rider',NULL,NULL);` }],
    hints: ['Join trips to trips on the same rider.', 'You need an order and a distance in time between the two rows.', 'b.requested_at > a.requested_at AND b.requested_at <= a.requested_at + INTERVAL \'24 hours\''],
    explain: 'A time-ordered condition keeps each pair once, in the right direction. Without it you would get (A,B) and (B,A), and would pair a trip with itself.',
    trap: `SELECT a.rider_id, a.trip_id AS first_trip, b.trip_id AS second_trip FROM trips a JOIN trips b ON b.rider_id = a.rider_id AND b.trip_id <> a.trip_id AND ABS(EXTRACT(EPOCH FROM (b.requested_at - a.requested_at))) <= 86400 ORDER BY a.rider_id, a.trip_id, b.trip_id;`,
    techniques: ['join\\s+trips'], patterns: [] }),

  P({ id: 'P334', title: 'Manager spans', dataset: 'hr', topics: ['j_self', 'a_groupby'], skills: 'Self join + GROUP BY on the "parent" side', domain: 'HR', timeTarget: 10,
    prompt: 'For each person who manages at least one employee: their name, number of direct reports and the combined salary of those reports. Biggest report payroll first.',
    output: ['manager', 'direct_reports', 'report_payroll'], orderMatters: true,
    solution: `SELECT m.name AS manager, COUNT(*) AS direct_reports, SUM(e.salary) AS report_payroll
FROM employees m
JOIN employees e ON e.manager_id = m.emp_id
GROUP BY m.emp_id, m.name
ORDER BY report_payroll DESC;`,
    tests: [{ name: 'Individual contributor gets a report', category: 'Edge cases', why: 'Anyone who gains a report becomes a manager row.', patch: `INSERT INTO employees VALUES (17,'Advik',1,6,'Intern',40000,'2026-04-01');` }],
    hints: ['Which side of the join do you group by?', 'People with no reports should not appear at all.', 'FROM employees m JOIN employees e ON e.manager_id = m.emp_id GROUP BY m.emp_id, m.name'],
    explain: 'The grain of the result is the manager. An INNER JOIN naturally drops non-managers; a LEFT JOIN would list them with 0 reports.',
    trap: `SELECT m.name AS manager, COUNT(e.emp_id) AS direct_reports, COALESCE(SUM(e.salary), 0) AS report_payroll FROM employees m LEFT JOIN employees e ON e.manager_id = m.emp_id GROUP BY m.emp_id, m.name ORDER BY report_payroll DESC;`,
    techniques: ['join\\s+employees'], patterns: ['hierarchy'] }),

  P({ id: 'P335', title: 'Prerequisite map', dataset: 'campus', topics: ['j_self', 'j_fanout'], skills: 'Many-to-many link table joined to the same table twice', domain: 'Education', timeTarget: 10,
    prompt: 'Print the prerequisite map as readable text: for every prerequisite requirement, show the course title and the title of the course it requires. Sort by course title, then prerequisite title.',
    output: ['course', 'prerequisite'], orderMatters: true,
    solution: `SELECT c.title AS course, q.title AS prerequisite
FROM course_prereqs p
JOIN courses c ON c.course_id = p.course_id
JOIN courses q ON q.course_id = p.prereq_id
ORDER BY c.title, q.title;`,
    tests: [{ name: 'A course with a second prerequisite', category: 'Joins', why: 'Each requirement is one output row.', patch: `INSERT INTO course_prereqs VALUES ('C302','C101');` }],
    hints: ['course_prereqs holds two ids that both point at the courses table.', 'Join courses twice, once for each id.', 'JOIN courses c ON c.course_id = p.course_id JOIN courses q ON q.course_id = p.prereq_id'],
    explain: 'A link table between a table and itself needs two joins to that table, one per foreign key, with different aliases.',
    trap: `SELECT c.title AS course, q.title AS prerequisite FROM course_prereqs p JOIN courses c ON c.course_id = p.course_id JOIN courses q ON q.course_id = p.course_id ORDER BY c.title, q.title;`,
    techniques: ['join\\s+courses[\\s\\S]*join\\s+courses'], patterns: [] }),

  P({ id: 'P336', title: 'Referral leaderboard', dataset: 'shop', topics: ['j_self', 'j_left'], skills: 'LEFT self join + COUNT of the optional side', domain: 'E-commerce', timeTarget: 9,
    prompt: 'For every customer, how many other customers did they refer? Customers who referred nobody show 0. Most referrals first, ties by customer id.',
    output: ['customer_id', 'name', 'referrals'], orderMatters: true,
    solution: `SELECT c.customer_id, c.name, COUNT(r.customer_id) AS referrals
FROM customers c
LEFT JOIN customers r ON r.referred_by = c.customer_id
GROUP BY c.customer_id, c.name
ORDER BY referrals DESC, c.customer_id;`,
    tests: [{ name: 'A new heavy referrer', category: 'Edge cases', why: 'Counts must update with the data and zeros must stay.', patch: `INSERT INTO customers VALUES (11,'Tara Sen','tara@mail.com','Pune','2026-03-25',8),(12,'Uma Das','uma@mail.com','Pune','2026-03-26',8),(13,'Vir Jha','vir@mail.com','Pune','2026-03-27',8);` }],
    hints: ['People with zero referrals must stay in the list.', 'COUNT(*) vs COUNT(column) after an outer join…', 'LEFT JOIN customers r ON r.referred_by = c.customer_id … COUNT(r.customer_id)'],
    explain: 'After a LEFT JOIN, count a column from the optional side: it is 0 when nothing matched, while COUNT(*) would report 1.',
    trap: `SELECT c.customer_id, c.name, COUNT(*) AS referrals FROM customers c LEFT JOIN customers r ON r.referred_by = c.customer_id GROUP BY c.customer_id, c.name ORDER BY referrals DESC, c.customer_id;`,
    techniques: ['left\\s+(outer\\s+)?join'], patterns: [] }),

  P({ id: 'P359', title: 'Cross-department reporting lines', dataset: 'hr', topics: ['j_self', 'f_null'], skills: 'NULL-safe inequality (IS DISTINCT FROM)', domain: 'HR', difficulty: 'Hard', timeTarget: 11,
    prompt: 'List employees who report to a manager in a different department. An employee or manager with no department counts as being in a different department from anyone assigned to one. Return the employee and manager names, sorted by employee name.',
    output: ['employee', 'manager'], orderMatters: true,
    solution: `SELECT e.name AS employee, m.name AS manager
FROM employees e
JOIN employees m ON m.emp_id = e.manager_id
WHERE e.dept_id IS DISTINCT FROM m.dept_id
ORDER BY e.name;`,
    tests: [{ name: 'Report to the unassigned chief of staff', category: 'NULL handling', why: 'dept 1 vs NULL is different, but <> yields unknown.', patch: `INSERT INTO employees VALUES (17,'Advik',1,16,'Analyst',60000,'2026-04-01');` }],
    hints: ['Irfan has no department. What is NULL <> 1?', 'You need a comparison that treats NULL as a value.', 'WHERE e.dept_id IS DISTINCT FROM m.dept_id'],
    explain: '<> returns NULL (unknown) when either side is NULL, and WHERE discards unknown rows. IS DISTINCT FROM treats NULL as an ordinary value.',
    trap: `SELECT e.name AS employee, m.name AS manager FROM employees e JOIN employees m ON m.emp_id = e.manager_id WHERE e.dept_id <> m.dept_id ORDER BY e.name;`,
    techniques: ['is\\s+distinct\\s+from|is\\s+null'], patterns: [],
    reasoning: [{ q: 'NULL <> 1 evaluates to…', options: ['TRUE', 'FALSE', 'NULL (unknown)'], answer: 2, why: 'Any comparison with NULL is unknown, and WHERE keeps only TRUE rows.' }] }),
  // ───────────────────────── SCAFFOLDS (CROSS JOIN) ─────────────────────────
  P({ id: 'P340', title: 'City × category grid', dataset: 'shop', topics: ['j_cross', 'j_left'], skills: 'Scaffold of all combinations, then LEFT JOIN facts', domain: 'E-commerce', difficulty: 'Hard', timeTarget: 15,
    prompt: 'Build the units-sold grid for the category managers: one row for every combination of customer city (ignore customers with no city) and product category, with the number of units in completed orders — 0 where nothing was sold. Sort by city, then category.',
    output: ['city', 'category', 'units'], orderMatters: true,
    solution: `WITH grid AS (
  SELECT DISTINCT c.city, p.category
  FROM customers c CROSS JOIN products p
  WHERE c.city IS NOT NULL
), sold AS (
  SELECT c.city, p.category, oi.quantity
  FROM orders o
  JOIN customers c    ON c.customer_id = o.customer_id
  JOIN order_items oi ON oi.order_id = o.order_id
  JOIN products p     ON p.product_id = oi.product_id
  WHERE o.status = 'completed'
)
SELECT g.city, g.category, COALESCE(SUM(s.quantity), 0) AS units
FROM grid g
LEFT JOIN sold s ON s.city = g.city AND s.category = g.category
GROUP BY g.city, g.category
ORDER BY g.city, g.category;`,
    tests: [{ name: 'A new city with no orders', category: 'Joins', why: 'The scaffold must come from the dimension tables, not from the sales.', patch: `INSERT INTO customers VALUES (11,'Tara Sen','tara@mail.com','Jaipur','2026-03-25',NULL);` }],
    hints: ['If a city never sold Fitness, no sales row exists to produce that combination.', 'First build every city × category pair from the dimension tables.', 'CROSS JOIN customers and products to make the grid, then LEFT JOIN the sales onto it'],
    explain: 'Zero rows cannot come out of a table that has no rows for them. A scaffold generated from the dimensions guarantees every combination exists; the LEFT JOIN fills in what actually happened.',
    trap: `SELECT c.city, p.category, SUM(oi.quantity) AS units FROM orders o JOIN customers c ON c.customer_id = o.customer_id JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status = 'completed' AND c.city IS NOT NULL GROUP BY c.city, p.category ORDER BY c.city, p.category;`,
    techniques: ['cross\\s+join|,\\s*products|from\\s+\\w+\\s*,\\s*\\w+'], patterns: ['date_spine'] }),

  P({ id: 'P341', title: 'Missing core courses', dataset: 'campus', topics: ['j_cross', 'j_anti_semi'], skills: 'Scaffold × anti-join: what is missing', domain: 'Education', difficulty: 'Hard', timeTarget: 15,
    prompt: 'The core courses for CS majors are C101, C102 and C201. For every CS-major student, list each core course they have not yet passed (completed with grade 5 or more). Return student name and course title, sorted by student name, then course title.',
    output: ['student', 'course'], orderMatters: true,
    solution: `SELECT s.name AS student, c.title AS course
FROM students s
CROSS JOIN courses c
WHERE s.major = 'CS' AND c.course_id IN ('C101', 'C102', 'C201')
  AND NOT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = s.student_id AND e.course_id = c.course_id
      AND e.status = 'completed' AND e.grade >= 5
  )
ORDER BY s.name, c.title;`,
    tests: [{ name: 'New CS student with no enrolments', category: 'Edge cases', why: 'A student with no rows at all is missing every core course.', patch: `INSERT INTO students VALUES (9,'Ira','CS','2026-02-01');` }],
    hints: ['"Missing" has no row to find. What do you need to generate first?', 'Pair every CS student with every core course, then remove the pairs that have a passing record.', 'students CROSS JOIN courses … WHERE NOT EXISTS (passing enrolment for that pair)'],
    explain: 'The missing facts are the pairs without an enrolment row, so they must be generated (CROSS JOIN) and then filtered with an anti-join.',
    trap: `SELECT s.name AS student, c.title AS course FROM students s JOIN enrollments e ON e.student_id = s.student_id JOIN courses c ON c.course_id = e.course_id WHERE s.major = 'CS' AND c.course_id IN ('C101', 'C102', 'C201') AND NOT (e.status = 'completed' AND e.grade >= 5) ORDER BY s.name, c.title;`,
    techniques: ['cross\\s+join|,\\s*courses'], patterns: ['anti_join'] }),

  // ───────────────────────── FAN-OUT & MANY-TO-MANY ─────────────────────────
  P({ id: 'P350', title: 'Credits earned', dataset: 'campus', topics: ['j_fanout', 'j_left'], skills: 'Deduplicating a many-to-many link before summing', domain: 'Education', difficulty: 'Hard', timeTarget: 15,
    prompt: 'For every student, how many credits have they earned? A course counts once, if they have ever passed it (completed with grade 5 or more); retaking and passing again does not earn it twice. Students with no credits show 0. Sort by student id.',
    output: ['student_id', 'name', 'credits_earned'], orderMatters: true,
    solution: `WITH passed AS (
  SELECT DISTINCT student_id, course_id
  FROM enrollments
  WHERE status = 'completed' AND grade >= 5
)
SELECT s.student_id, s.name, COALESCE(SUM(c.credits), 0) AS credits_earned
FROM students s
LEFT JOIN passed p ON p.student_id = s.student_id
LEFT JOIN courses c ON c.course_id = p.course_id
GROUP BY s.student_id, s.name
ORDER BY s.student_id;`,
    tests: [{ name: 'Student passes the same course twice', category: 'Edge cases', why: 'A second pass must not add credits again.', patch: `INSERT INTO enrollments VALUES (1,'C101','2026S',9.5,'completed');` }],
    hints: ['Bilal failed Data Structures, then passed it. How many rows does that leave?', 'Reduce passing enrolments to one row per student and course first.', 'SELECT DISTINCT student_id, course_id … then join courses and SUM(credits). Note SUM(DISTINCT credits) would be wrong — why?'],
    explain: 'SUM(DISTINCT credits) collapses different courses that happen to have the same credits (two 4-credit courses become one 4). Deduplicate the (student, course) pairs instead, then sum.',
    trap: `SELECT s.student_id, s.name, COALESCE(SUM(DISTINCT c.credits), 0) AS credits_earned FROM students s LEFT JOIN enrollments e ON e.student_id = s.student_id AND e.status = 'completed' AND e.grade >= 5 LEFT JOIN courses c ON c.course_id = e.course_id GROUP BY s.student_id, s.name ORDER BY s.student_id;`,
    techniques: ['distinct|group\\s+by\\s+student_id\\s*,\\s*course_id'], patterns: ['fanout_guard'],
    reasoning: [{ q: 'A student passed two 4-credit courses and one 3-credit course. What does SUM(DISTINCT credits) return?', options: ['11', '7', '8'], answer: 1, why: 'DISTINCT removes the duplicate value 4, so it sums only {4, 3} = 7.' }] }),

  P({ id: 'P351', title: 'User value snapshot', dataset: 'saas', topics: ['j_fanout', 'j_left'], skills: 'Two independent child tables → pre-aggregate each', domain: 'SaaS', difficulty: 'Hard', timeTarget: 15,
    prompt: 'One row per user: how many events they have logged and the monthly recurring revenue of their currently active subscriptions (end date empty; 0 if none). Sort by user id.',
    output: ['user_id', 'events', 'active_mrr'], orderMatters: true,
    solution: `WITH ev AS (
  SELECT user_id, COUNT(*) AS events FROM events GROUP BY user_id
), mrr AS (
  SELECT user_id, SUM(mrr) AS active_mrr FROM subscriptions WHERE end_date IS NULL GROUP BY user_id
)
SELECT u.user_id, COALESCE(ev.events, 0) AS events, COALESCE(mrr.active_mrr, 0) AS active_mrr
FROM users u
LEFT JOIN ev  ON ev.user_id  = u.user_id
LEFT JOIN mrr ON mrr.user_id = u.user_id
ORDER BY u.user_id;`,
    tests: [{ name: 'User with several active subscriptions and many events', category: 'Joins', why: 'Both child tables multiply each other if joined directly.', patch: `INSERT INTO subscriptions VALUES (7,2,'addon',10,'2026-03-01',NULL),(8,2,'addon2',5,'2026-03-02',NULL);` }],
    hints: ['Users have many events and (sometimes) many subscriptions. What happens when both are joined to users?', 'Each child needs to be one row per user before it is joined.', 'WITH ev AS (… GROUP BY user_id), mrr AS (… WHERE end_date IS NULL GROUP BY user_id) then LEFT JOIN both to users'],
    explain: 'Joining events and subscriptions directly makes events × subscriptions rows per user, inflating both numbers. Aggregating each child to user grain first removes the multiplication.',
    trap: `SELECT u.user_id, COUNT(e.event_id) AS events, COALESCE(SUM(s.mrr), 0) AS active_mrr FROM users u LEFT JOIN events e ON e.user_id = u.user_id LEFT JOIN subscriptions s ON s.user_id = u.user_id AND s.end_date IS NULL GROUP BY u.user_id ORDER BY u.user_id;`,
    techniques: ['with\\s+\\w+\\s+as|\\(\\s*select[\\s\\S]*group\\s+by'], patterns: ['fanout_guard'] }),

  P({ id: 'P352', title: 'Basket profile per customer', dataset: 'shop', topics: ['j_fanout', 'a_distinct'], skills: 'Counting parents after joining children', domain: 'E-commerce', timeTarget: 10,
    prompt: 'For each customer with at least one completed order: number of completed orders, number of different products they bought and total units. Sort by customer id.',
    output: ['customer_id', 'orders', 'distinct_products', 'units'], orderMatters: true,
    solution: `SELECT o.customer_id, COUNT(DISTINCT o.order_id) AS orders, COUNT(DISTINCT oi.product_id) AS distinct_products, SUM(oi.quantity) AS units
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
WHERE o.status = 'completed'
GROUP BY o.customer_id
ORDER BY o.customer_id;`,
    tests: [{ name: 'Same product in two orders', category: 'Joins', why: 'Repeat purchases of one product count once as a distinct product.', patch: `INSERT INTO order_items VALUES (1003,101,1,799),(1016,101,1,799);` }],
    hints: ['After joining order_items, one row is one line, not one order.', 'Two of the three numbers need DISTINCT.', 'COUNT(DISTINCT o.order_id), COUNT(DISTINCT oi.product_id), SUM(oi.quantity)'],
    explain: 'The join repeats each order once per line item. COUNT(DISTINCT parent_key) recovers the number of orders; units are a true sum over lines.',
    trap: `SELECT o.customer_id, COUNT(o.order_id) AS orders, COUNT(oi.product_id) AS distinct_products, SUM(oi.quantity) AS units FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.customer_id ORDER BY o.customer_id;`,
    techniques: ['count\\s*\\(\\s*distinct'], patterns: ['fanout_guard'] }),

  P({ id: 'P353', title: 'Average class load', dataset: 'campus', topics: ['j_fanout', 'j_left'], skills: 'Ratio across two grains (courses vs enrolments)', domain: 'Education', difficulty: 'Very Hard', timeTarget: 18,
    prompt: 'For every instructor who teaches at least one course, report: the number of courses they teach (including courses nobody joined), the total number of enrolments in those courses (every enrolment row except withdrawals) and the average enrolments per course (2 decimals). Sort by instructor name.',
    output: ['instructor', 'courses', 'enrolments', 'avg_enrolments_per_course'], orderMatters: true,
    solution: `WITH e AS (
  SELECT course_id, COUNT(*) AS n FROM enrollments WHERE status <> 'withdrawn' GROUP BY course_id
)
SELECT i.name AS instructor, COUNT(c.course_id) AS courses, COALESCE(SUM(e.n), 0) AS enrolments,
       ROUND(COALESCE(SUM(e.n), 0)::numeric / COUNT(c.course_id), 2) AS avg_enrolments_per_course
FROM instructors i
JOIN courses c ON c.instructor_id = i.instructor_id
LEFT JOIN e ON e.course_id = c.course_id
GROUP BY i.instructor_id, i.name
ORDER BY i.name;`,
    tests: [{ name: 'A new empty course for an instructor', category: 'Edge cases', why: 'Empty courses must lower the average.', patch: `INSERT INTO courses VALUES ('C304','Compilers','CS',4,2);` }],
    hints: ['Courses and enrolments are at different grains. Which one is the denominator?', 'If you join raw enrolments, COUNT(course_id) counts enrolment rows. Pre-aggregate enrolments per course.', 'Per-course counts in a CTE, LEFT JOIN to courses, then divide by COUNT(c.course_id)'],
    explain: 'Averaging per course needs one row per course before dividing. Joining raw enrolments makes the course count equal the enrolment count and the average collapses to 1.',
    trap: `SELECT i.name AS instructor, COUNT(c.course_id) AS courses, COUNT(e.student_id) AS enrolments, ROUND(COUNT(e.student_id)::numeric / COUNT(c.course_id), 2) AS avg_enrolments_per_course FROM instructors i JOIN courses c ON c.instructor_id = i.instructor_id LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.status <> 'withdrawn' GROUP BY i.instructor_id, i.name ORDER BY i.name;`,
    techniques: ['with\\s+\\w+\\s+as|\\(\\s*select[\\s\\S]*group\\s+by|count\\s*\\(\\s*distinct'], patterns: ['fanout_guard'] }),

  P({ id: 'P354', title: 'Students per instructor', dataset: 'campus', topics: ['j_fanout', 'j_left', 'a_distinct'], skills: 'Many-to-many counts: distinct people, not rows', domain: 'Education', difficulty: 'Hard', timeTarget: 13,
    prompt: 'How many different students does each instructor teach (anyone enrolled in one of their courses who has not withdrawn)? Include instructors with no students (0). Sort by instructor name.',
    output: ['instructor', 'students'], orderMatters: true,
    solution: `SELECT i.name AS instructor, COUNT(DISTINCT e.student_id) AS students
FROM instructors i
LEFT JOIN courses c     ON c.instructor_id = i.instructor_id
LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.status <> 'withdrawn'
GROUP BY i.instructor_id, i.name
ORDER BY i.name;`,
    tests: [{ name: 'Student in two courses of one instructor', category: 'Joins', why: 'One student in several of an instructor\'s courses is still one student.', patch: `INSERT INTO enrollments VALUES (3,'C102','2026S',NULL,'in_progress');` }],
    hints: ['Asha takes two courses with Dr. Rao.', 'You want people, not enrolment rows.', 'COUNT(DISTINCT e.student_id) with LEFT JOINs from instructors'],
    explain: 'Instructor → course → enrolment is a chain of one-to-many joins. A student reached through two courses appears twice, so count distinct students.',
    trap: `SELECT i.name AS instructor, COUNT(e.student_id) AS students FROM instructors i LEFT JOIN courses c ON c.instructor_id = i.instructor_id LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.status <> 'withdrawn' GROUP BY i.instructor_id, i.name ORDER BY i.name;`,
    techniques: ['count\\s*\\(\\s*distinct'], patterns: ['fanout_guard'] }),

  P({ id: 'P355', title: 'Bought together', dataset: 'shop', topics: ['j_fanout', 'j_self'], skills: 'Self join on a link table: unordered pairs', domain: 'E-commerce', difficulty: 'Hard', timeTarget: 14,
    prompt: 'Which products are bought together? For every pair of different products that appear in the same completed order, return both product names (the one with the smaller product id first) and the number of completed orders containing both. Most frequent pairs first, then by the first and second product name.',
    output: ['product_a', 'product_b', 'orders_together'], orderMatters: true,
    solution: `SELECT pa.name AS product_a, pb.name AS product_b, COUNT(*) AS orders_together
FROM order_items a
JOIN order_items b ON b.order_id = a.order_id AND b.product_id > a.product_id
JOIN orders o      ON o.order_id = a.order_id AND o.status = 'completed'
JOIN products pa   ON pa.product_id = a.product_id
JOIN products pb   ON pb.product_id = b.product_id
GROUP BY pa.name, pb.name
ORDER BY orders_together DESC, pa.name, pb.name;`,
    tests: [{ name: 'Three-item basket', category: 'Edge cases', why: 'A basket of three products yields three pairs.', patch: `INSERT INTO order_items VALUES (1015,106,1,899),(1015,107,1,349);` }],
    hints: ['Join order_items to itself within the same order.', 'Different products, and each unordered pair counted once.', 'b.order_id = a.order_id AND b.product_id > a.product_id'],
    explain: 'Self-joining the link table on the order creates all product pairs per basket. A strict inequality on the product id keeps one orientation of each pair and drops self-pairs.',
    trap: `SELECT pa.name AS product_a, pb.name AS product_b, COUNT(*) AS orders_together FROM order_items a JOIN order_items b ON b.order_id = a.order_id AND b.product_id <> a.product_id JOIN orders o ON o.order_id = a.order_id AND o.status = 'completed' JOIN products pa ON pa.product_id = a.product_id JOIN products pb ON pb.product_id = b.product_id GROUP BY pa.name, pb.name ORDER BY orders_together DESC, pa.name, pb.name;`,
    techniques: ['join\\s+order_items'], patterns: [] }),

  P({ id: 'P356', title: 'True average basket', dataset: 'shop', topics: ['j_fanout', 'a_basic'], skills: 'Average at the right grain (order, not line)', domain: 'E-commerce', difficulty: 'Easy', timeTarget: 8,
    prompt: 'What is the average value of a completed order, and the average number of units per completed order? Round both to 2 decimals and return a single row.',
    output: ['avg_order_value', 'avg_units_per_order'], orderMatters: false,
    solution: `WITH per_order AS (
  SELECT oi.order_id, SUM(oi.quantity * oi.unit_price) AS value, SUM(oi.quantity) AS units
  FROM order_items oi
  JOIN orders o ON o.order_id = oi.order_id
  WHERE o.status = 'completed'
  GROUP BY oi.order_id
)
SELECT ROUND(AVG(value), 2) AS avg_order_value, ROUND(AVG(units), 2) AS avg_units_per_order FROM per_order;`,
    tests: [{ name: 'One very large order', category: 'Business logic', why: 'Averages must be taken per order, so one big basket moves them a lot.', patch: `INSERT INTO orders VALUES (1018,10,'2026-04-12','completed',NULL); INSERT INTO order_items VALUES (1018,105,10,2999);` }],
    hints: ['An "order value" needs one number per order first.', 'AVG over line items gives the average line, not the average order.', 'Sum to one row per order in a CTE, then AVG over that'],
    explain: 'Averaging after the join averages line items. Collapse to the order grain first, then average.',
    trap: `SELECT ROUND(AVG(oi.quantity * oi.unit_price), 2) AS avg_order_value, ROUND(AVG(oi.quantity), 2) AS avg_units_per_order FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE o.status = 'completed';`,
    techniques: ['with\\s+\\w+\\s+as|from\\s*\\(\\s*select'], patterns: ['fanout_guard'] }),
  // ───────────────────────── MULTI-TABLE JOINS & DEBUGGING ─────────────────────────
  P({ id: 'P360', title: 'Monthly category report', dataset: 'shop', topics: ['j_multi', 'j_fanout'], skills: 'Four-table join, orders vs lines, month bucketing', domain: 'E-commerce', timeTarget: 12,
    prompt: 'For each month and product category, report the number of completed orders that contained that category and the revenue (quantity × charged price). Months are shown as the first day of the month. Sort by month, then category.',
    output: ['month', 'category', 'orders', 'revenue'], orderMatters: true,
    solution: `SELECT date_trunc('month', o.order_date)::date AS month, p.category,
       COUNT(DISTINCT o.order_id) AS orders, SUM(oi.quantity * oi.unit_price) AS revenue
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p     ON p.product_id = oi.product_id
WHERE o.status = 'completed'
GROUP BY 1, 2
ORDER BY 1, 2;`,
    tests: [{ name: 'Order with three grocery lines', category: 'Joins', why: 'Several lines of one category are still one order.', patch: `INSERT INTO products VALUES (109,'Olive Oil','Grocery',650,true); INSERT INTO orders VALUES (1018,10,'2026-04-12','completed',NULL); INSERT INTO order_items VALUES (1018,106,1,899),(1018,107,1,349),(1018,109,1,650);` }],
    hints: ['After joining order_items, one row is a line, not an order.', 'An order with two Grocery items must count once in Grocery.', 'COUNT(DISTINCT o.order_id) and date_trunc(\'month\', o.order_date)'],
    explain: 'The grain of the report is (month, category); the join grain is the order line. Counting orders therefore needs DISTINCT, while revenue is a plain sum over lines.',
    trap: `SELECT date_trunc('month', o.order_date)::date AS month, p.category, COUNT(*) AS orders, SUM(oi.quantity * oi.unit_price) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status = 'completed' GROUP BY 1, 2 ORDER BY 1, 2;`,
    techniques: ['count\\s*\\(\\s*distinct'], patterns: ['fanout_guard'] }),

  P({ id: 'P361', title: 'Order payment board', dataset: 'shop', topics: ['j_multi', 'j_left', 'j_fanout'], skills: 'Collapse a many-side to a status, then LEFT JOIN', domain: 'Payments', difficulty: 'Hard', timeTarget: 14,
    prompt: 'Ops wants one row per order with the customer name and a payment state:\n• `paid` — at least one successful payment\n• `failed_only` — payment attempts exist but none succeeded\n• `no_payment` — no payment attempts at all\n\nSort by order id.',
    output: ['order_id', 'customer', 'payment_state'], orderMatters: true,
    solution: `WITH pay AS (
  SELECT order_id, COUNT(*) FILTER (WHERE status = 'success') AS ok FROM payments GROUP BY order_id
)
SELECT o.order_id, c.name AS customer,
       CASE WHEN p.order_id IS NULL THEN 'no_payment'
            WHEN p.ok > 0 THEN 'paid'
            ELSE 'failed_only' END AS payment_state
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN pay p  ON p.order_id = o.order_id
ORDER BY o.order_id;`,
    tests: [{ name: 'Order whose every attempt failed', category: 'Edge cases', why: 'Attempts without a success must be failed_only, not no_payment.', patch: `INSERT INTO payments VALUES (18,1010,'upi',2398.00,'2026-02-28 10:00','failed'),(19,1010,'card',2398.00,'2026-02-28 10:05','failed');` }],
    hints: ['An order can have several payment attempts. You want one row per order.', 'Summarise payments per order first (did any succeed?), then LEFT JOIN.', 'GROUP BY order_id with COUNT(*) FILTER (WHERE status = \'success\'), then CASE on the joined result'],
    explain: 'Joining raw payments repeats orders per attempt and cannot say "none succeeded". Collapsing payments to one row per order turns the many-side into a status you can classify.',
    trap: `SELECT o.order_id, c.name AS customer, CASE WHEN p.order_id IS NULL THEN 'no_payment' WHEN p.status = 'success' THEN 'paid' ELSE 'failed_only' END AS payment_state FROM orders o JOIN customers c ON c.customer_id = o.customer_id LEFT JOIN payments p ON p.order_id = o.order_id ORDER BY o.order_id;`,
    techniques: ['with\\s+\\w+\\s+as|\\(\\s*select[\\s\\S]*group\\s+by|exists'], patterns: ['fanout_guard'] }),

  P({ id: 'P362', title: 'Units bought by everyone', dataset: 'shop', topics: ['j_multi', 'j_left'], skills: 'A chain of LEFT JOINs must stay LEFT all the way', domain: 'E-commerce', timeTarget: 9,
    prompt: 'List every customer with the total units they have bought across all their orders, whatever the order status. Customers who have never ordered show 0 units. Sort by customer id.',
    output: ['customer_id', 'name', 'units'], orderMatters: true,
    solution: `SELECT c.customer_id, c.name, COALESCE(SUM(oi.quantity), 0) AS units
FROM customers c
LEFT JOIN orders o       ON o.customer_id = c.customer_id
LEFT JOIN order_items oi ON oi.order_id = o.order_id
GROUP BY c.customer_id, c.name
ORDER BY c.customer_id;`,
    tests: [{ name: 'Customer with an order that has no items yet', category: 'Joins', why: 'An empty order must not remove the customer.', patch: `INSERT INTO orders VALUES (1018,10,'2026-04-12','pending',NULL);` }],
    hints: ['Neha has no orders at all.', 'Once a join is LEFT, every join after it that depends on it must be LEFT too.', 'customers LEFT JOIN orders LEFT JOIN order_items'],
    explain: 'An INNER JOIN placed after a LEFT JOIN rejects the NULL-padded rows again, quietly turning the whole chain into an inner join.',
    trap: `SELECT c.customer_id, c.name, COALESCE(SUM(oi.quantity), 0) AS units FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id JOIN order_items oi ON oi.order_id = o.order_id GROUP BY c.customer_id, c.name ORDER BY c.customer_id;`,
    techniques: ['left\\s+(outer\\s+)?join[\\s\\S]*left\\s+(outer\\s+)?join'], patterns: [] }),

  P({ id: 'P363', title: 'Trip board', dataset: 'rides', topics: ['j_multi', 'j_left'], skills: 'INNER for a mandatory parent, LEFT for an optional one', domain: 'Ride-sharing', difficulty: 'Easy', timeTarget: 8,
    prompt: 'List every trip request with the rider\'s name, the driver\'s name and the trip status. Requests that were never assigned a driver show "Unassigned" as the driver. Sort by trip id.',
    output: ['trip_id', 'rider', 'driver', 'status'], orderMatters: true,
    solution: `SELECT t.trip_id, r.name AS rider, COALESCE(d.name, 'Unassigned') AS driver, t.status
FROM trips t
JOIN riders r       ON r.rider_id  = t.rider_id
LEFT JOIN drivers d ON d.driver_id = t.driver_id
ORDER BY t.trip_id;`,
    tests: [{ name: 'Another unassigned request', category: 'Joins', why: 'NULL driver_id never equals a driver id.', patch: `INSERT INTO trips VALUES (521,7,NULL,'Mumbai','2026-02-08 09:00','cancelled_rider',NULL,NULL);` }],
    hints: ['Some trips have a NULL driver_id.', 'Every trip has a rider, but not every trip has a driver.', 'JOIN riders … LEFT JOIN drivers, and COALESCE the driver name'],
    explain: 'Use INNER JOIN where the relationship is mandatory and LEFT JOIN where it is optional. A NULL foreign key can never match, so an INNER JOIN silently removes those rows.',
    trap: `SELECT t.trip_id, r.name AS rider, COALESCE(d.name, 'Unassigned') AS driver, t.status FROM trips t JOIN riders r ON r.rider_id = t.rider_id JOIN drivers d ON d.driver_id = t.driver_id ORDER BY t.trip_id;`,
    techniques: ['left\\s+(outer\\s+)?join'], patterns: [] }),

  P({ id: 'P364', title: 'Full transcript', dataset: 'campus', topics: ['j_multi', 'j_left'], skills: 'Five tables: optional parent, range join that must stay outer', domain: 'Education', difficulty: 'Very Hard', timeTarget: 18,
    prompt: 'Produce the full transcript: one row for every enrolment (any status) with the student name, course title, instructor name ("TBA" if none), term, status, grade and grade band (empty when there is no grade). Sort by student name, then term, then course title.',
    output: ['student', 'course', 'instructor', 'term', 'status', 'grade', 'band'], orderMatters: true,
    solution: `SELECT s.name AS student, c.title AS course, COALESCE(i.name, 'TBA') AS instructor,
       e.term, e.status, e.grade, b.band
FROM enrollments e
JOIN students s          ON s.student_id = e.student_id
JOIN courses c           ON c.course_id  = e.course_id
LEFT JOIN instructors i  ON i.instructor_id = c.instructor_id
LEFT JOIN grade_bands b  ON e.grade >= b.min_grade AND e.grade < b.max_grade
ORDER BY s.name, e.term, c.title;`,
    tests: [{ name: 'New unassigned course with an in-progress enrolment', category: 'Joins', why: 'Neither the missing instructor nor the missing grade may drop the row.', patch: `INSERT INTO courses VALUES ('C304','Compilers','CS',4,NULL); INSERT INTO enrollments VALUES (8,'C304','2026S',NULL,'in_progress');` }],
    hints: ['Count the rows: it should equal the number of enrolments.', 'Which of the five tables are optional for an enrolment?', 'JOIN students and courses; LEFT JOIN instructors and the grade_bands range join'],
    explain: 'Mandatory parents (student, course) use INNER JOIN. The instructor may be missing and ungraded enrolments match no band, so both of those must be LEFT JOINs, or those rows vanish.',
    trap: `SELECT s.name AS student, c.title AS course, COALESCE(i.name, 'TBA') AS instructor, e.term, e.status, e.grade, b.band FROM enrollments e JOIN students s ON s.student_id = e.student_id JOIN courses c ON c.course_id = e.course_id JOIN instructors i ON i.instructor_id = c.instructor_id JOIN grade_bands b ON e.grade >= b.min_grade AND e.grade < b.max_grade ORDER BY s.name, e.term, c.title;`,
    techniques: ['left\\s+(outer\\s+)?join[\\s\\S]*left\\s+(outer\\s+)?join'], patterns: [] }),

  P({ id: 'P365', title: 'Plan on 31 March', dataset: 'saas', topics: ['j_multi', 'j_inner'], skills: 'Point-in-time (as-of) join with an open-ended end date', domain: 'SaaS', difficulty: 'Hard', timeTarget: 12,
    prompt: 'Which plan was each user on at the end of 2026-03-31? A subscription covers its start date through its end date inclusive; an empty end date means it is still running. Return user id, country, plan and MRR for users who had an active subscription on that date, sorted by user id.',
    output: ['user_id', 'country', 'plan', 'mrr'], orderMatters: true,
    solution: `SELECT u.user_id, u.country, s.plan, s.mrr
FROM users u
JOIN subscriptions s ON s.user_id = u.user_id
 AND s.start_date <= DATE '2026-03-31'
 AND (s.end_date IS NULL OR s.end_date >= DATE '2026-03-31')
ORDER BY u.user_id;`,
    tests: [{ name: 'Subscription starting exactly on the date', category: 'Edge cases', why: 'The start date is inclusive.', patch: `INSERT INTO subscriptions VALUES (7,2,'pro',30,'2026-03-31',NULL);` }],
    hints: ['A row is "active on a date" when the date falls between its start and end.', 'Both ends are inclusive and the end can be NULL.', 's.start_date <= DATE \'2026-03-31\' AND (s.end_date IS NULL OR s.end_date >= DATE \'2026-03-31\')'],
    explain: 'Point-in-time joins put the date range in the ON clause. NULL end dates need an explicit IS NULL branch because NULL >= date is unknown.',
    trap: `SELECT u.user_id, u.country, s.plan, s.mrr FROM users u JOIN subscriptions s ON s.user_id = u.user_id AND s.start_date <= DATE '2026-03-31' AND s.end_date > DATE '2026-03-31' ORDER BY u.user_id;`,
    techniques: ['end_date\\s+is\\s+null|coalesce'], patterns: [] }),

  P({ id: 'P366', title: 'Fix the customer dashboard', dataset: 'shop', topics: ['j_multi', 'j_fanout'], skills: 'Debugging an inflated report', domain: 'Payments', difficulty: 'Hard', timeTarget: 16,
    prompt: 'The finance dashboard shows customer totals that are too high. This is the query behind it:\n\n`SELECT c.customer_id, c.name, SUM(oi.quantity * oi.unit_price) AS billed, SUM(p.amount) AS collected FROM customers c JOIN orders o ON o.customer_id = c.customer_id JOIN order_items oi ON oi.order_id = o.order_id JOIN payments p ON p.order_id = o.order_id WHERE o.status = \'completed\' GROUP BY c.customer_id, c.name ORDER BY c.customer_id`\n\nWrite the correct version. Per customer with at least one completed order: `billed` = what completed orders were billed (quantity × charged price) and `collected` = money actually received (successful payments on those orders; 0 if none). Sort by customer id.',
    output: ['customer_id', 'name', 'billed', 'collected'], orderMatters: true,
    solution: `WITH items AS (
  SELECT order_id, SUM(quantity * unit_price) AS billed FROM order_items GROUP BY order_id
), paid AS (
  SELECT order_id, SUM(amount) AS collected FROM payments WHERE status = 'success' GROUP BY order_id
)
SELECT c.customer_id, c.name, SUM(i.billed) AS billed, COALESCE(SUM(p.collected), 0) AS collected
FROM customers c
JOIN orders o     ON o.customer_id = c.customer_id AND o.status = 'completed'
JOIN items i      ON i.order_id = o.order_id
LEFT JOIN paid p  ON p.order_id = o.order_id
GROUP BY c.customer_id, c.name
ORDER BY c.customer_id;`,
    tests: [{ name: 'Completed order with no payment and a split payment', category: 'Joins', why: 'Missing payments must give 0 collected, and two successful payments must not duplicate billing.', patch: `INSERT INTO orders VALUES (1018,10,'2026-04-12','completed',NULL),(1019,9,'2026-04-13','completed',NULL); INSERT INTO order_items VALUES (1018,104,1,1199),(1019,101,1,799),(1019,107,1,349); INSERT INTO payments VALUES (18,1019,'card',500.00,'2026-04-13 10:00','success'),(19,1019,'upi',648.00,'2026-04-13 10:05','success');` }],
    hints: ['Order 1003 has 2 line items and 2 payment attempts. How many rows does the join produce for it?', 'Billing and payments are independent one-to-many children of the order. Also, are failed attempts "collected"?', 'Aggregate order_items and successful payments each to one row per order, then join them to orders'],
    explain: 'Items × payment attempts multiplies every order that has several lines and several attempts, and failed attempts were counted as money received. Pre-aggregate each child to order grain, filter the payments to successes, and LEFT JOIN them.',
    trap: `SELECT c.customer_id, c.name, SUM(oi.quantity * oi.unit_price) AS billed, SUM(p.amount) AS collected FROM customers c JOIN orders o ON o.customer_id = c.customer_id JOIN order_items oi ON oi.order_id = o.order_id JOIN payments p ON p.order_id = o.order_id WHERE o.status = 'completed' GROUP BY c.customer_id, c.name ORDER BY c.customer_id;`,
    techniques: ['with\\s+\\w+\\s+as|\\(\\s*select[\\s\\S]*group\\s+by'], patterns: ['fanout_guard'] }),

  P({ id: 'P367', title: 'Fix the merchant balances', dataset: 'recon', topics: ['j_multi', 'j_fanout'], skills: 'Debugging a double-counted expected amount', domain: 'Finance ops', difficulty: 'Very Hard', timeTarget: 16,
    prompt: 'Finance says the merchant "expected" figures are overstated. This is the query:\n\n`SELECT l.merchant, SUM(l.amount) AS expected, SUM(s.amount) AS received FROM ledger l LEFT JOIN settlements s ON s.ref = l.ref GROUP BY l.merchant`\n\nWrite the correct report: per merchant, the amount expected (from the ledger), the amount received (all their settlement lines; 0 if none) and the outstanding balance (expected − received). Sort by merchant.',
    output: ['merchant', 'expected', 'received', 'outstanding'], orderMatters: true,
    solution: `WITH s AS (
  SELECT ref, SUM(amount) AS received FROM settlements GROUP BY ref
)
SELECT l.merchant, SUM(l.amount) AS expected, COALESCE(SUM(s.received), 0) AS received,
       SUM(l.amount) - COALESCE(SUM(s.received), 0) AS outstanding
FROM ledger l
LEFT JOIN s ON s.ref = l.ref
GROUP BY l.merchant
ORDER BY l.merchant;`,
    tests: [{ name: 'A third settlement line on an existing order', category: 'Joins', why: 'More lines on one reference must not multiply the ledger amount.', patch: `INSERT INTO settlements VALUES (9,'ORD-4',300,'2026-03-10'),(10,'ORD-4',200,'2026-03-11'),(11,'ORD-4',300,'2026-03-12');` }],
    hints: ['ORD-2 was settled in two lines. What happens to its ledger amount?', 'The ledger amount is repeated once per matching settlement line.', 'Total the settlements per ref in a CTE, then LEFT JOIN to the ledger'],
    explain: 'The LEFT JOIN repeats each ledger row for every settlement line, so SUM(l.amount) counts a split order several times. One row per ref on the settlement side fixes the grain.',
    trap: `SELECT l.merchant, SUM(l.amount) AS expected, COALESCE(SUM(s.amount), 0) AS received, SUM(l.amount) - COALESCE(SUM(s.amount), 0) AS outstanding FROM ledger l LEFT JOIN settlements s ON s.ref = l.ref GROUP BY l.merchant ORDER BY l.merchant;`,
    techniques: ['with\\s+\\w+\\s+as|\\(\\s*select[\\s\\S]*group\\s+by'], patterns: ['fanout_guard'] }),
  /*END*/
];

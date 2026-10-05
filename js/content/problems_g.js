// Levels 3–4, part 2 (P456–P465).
import { Q } from './q.js';
export const PROBLEMS_G = [
  Q('P456', 'Bengaluru staff', 'hr', ['s_subquery'], 'Easy', 'IN (subquery) instead of hard-coded ids',
    'List employees who work in a department located in Bengaluru. Return emp id and name, sorted by id.', ['emp_id', 'name'], true,
    `SELECT emp_id, name FROM employees WHERE dept_id IN (SELECT dept_id FROM departments WHERE location = 'Bengaluru') ORDER BY emp_id;`,
    ['A new Bengaluru department', 'Data changes must flow through.', `INSERT INTO departments VALUES (6,'Research','Bengaluru'); INSERT INTO employees VALUES (17,'Advik',6,1,'Researcher',100000,'2026-04-01');`],
    ['Which departments are in Bengaluru?', 'Use that list inside IN (…).', 'WHERE dept_id IN (SELECT dept_id FROM departments WHERE location = \'Bengaluru\')'],
    'A subquery keeps the query correct when the underlying data changes; hard-coded ids do not.',
    `SELECT emp_id, name FROM employees WHERE dept_id IN (1, 2) ORDER BY emp_id;`),
  Q('P457', 'Restaurants with no cancellations', 'food', ['s_exists'], 'Medium', 'NOT EXISTS including entities with no rows',
    'Which restaurants have never had a cancelled order (restaurants with no orders at all qualify)? Return restaurant id and name, sorted by id.', ['restaurant_id', 'name'], true,
    `SELECT r.restaurant_id, r.name FROM restaurants r WHERE NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.restaurant_id = r.restaurant_id AND d.status = 'cancelled') ORDER BY r.restaurant_id;`,
    ['A restaurant with no orders', 'No orders means no cancellations.', `INSERT INTO restaurants VALUES (9,'New Cafe','Cafe','Pune',NULL,false,'2026-03-01');`],
    ['Negate the existence of a cancelled order.', 'Restaurants with no orders have none either.', 'NOT EXISTS (… d.status = \'cancelled\')'],
    'Joining to delivered orders keeps restaurants that also had cancellations. Negate existence instead.',
    `SELECT DISTINCT r.restaurant_id, r.name FROM restaurants r JOIN deliveries d ON d.restaurant_id = r.restaurant_id WHERE d.status = 'delivered' ORDER BY r.restaurant_id;`, { patterns: ['anti_join'] }),
  Q('P458', 'Orders above the customer\'s norm', 'shop', ['s_correlated', 'c_cte'], 'Hard', 'Correlated benchmark over an aggregated CTE',
    'List completed orders whose value (quantity × charged price) is above that customer\'s own average completed-order value. Return order id, customer id and value, sorted by order id.', ['order_id', 'customer_id', 'value'], true,
    `WITH ov AS (SELECT o.order_id, o.customer_id, SUM(oi.quantity * oi.unit_price) AS value FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.order_id, o.customer_id)
SELECT a.order_id, a.customer_id, a.value FROM ov a WHERE a.value > (SELECT AVG(b.value) FROM ov b WHERE b.customer_id = a.customer_id) ORDER BY a.order_id;`,
    ['A very large order', 'Each customer is compared with themselves.', `INSERT INTO orders VALUES (1018,1,'2026-04-12','completed',NULL); INSERT INTO order_items VALUES (1018,105,5,2999);`],
    ['First get one value per order.', 'Then correlate the benchmark on customer.', 'WHERE a.value > (SELECT AVG(b.value) FROM ov b WHERE b.customer_id = a.customer_id)'],
    'Order value needs the order grain first; the benchmark is per customer.',
    `WITH ov AS (SELECT o.order_id, o.customer_id, SUM(oi.quantity * oi.unit_price) AS value FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.order_id, o.customer_id) SELECT order_id, customer_id, value FROM ov WHERE value > (SELECT AVG(value) FROM ov) ORDER BY order_id;`),
  Q('P459', 'Came back after upgrading', 'saas', ['s_exists'], 'Medium', 'EXISTS with a later event',
    'Which users logged in at least once AFTER they upgraded? Return user id, sorted.', ['user_id'], true,
    `SELECT DISTINCT up.user_id FROM events up WHERE up.event_name = 'upgrade' AND EXISTS (SELECT 1 FROM events l WHERE l.user_id = up.user_id AND l.event_name = 'login' AND l.event_time > up.event_time) ORDER BY up.user_id;`,
    ['Login before the upgrade only', 'Order matters.', `UPDATE events SET event_time = '2026-03-01 09:00' WHERE event_id = 41;`],
    ['Two events, one must be later.', 'Compare event times inside EXISTS.', 'l.event_time > up.event_time'],
    'Existence checks can carry a time condition relative to the outer row.',
    `SELECT DISTINCT up.user_id FROM events up WHERE up.event_name = 'upgrade' AND EXISTS (SELECT 1 FROM events l WHERE l.user_id = up.user_id AND l.event_name = 'login') ORDER BY up.user_id;`),
  Q('P460', 'January buyers who did not return', 'shop', ['s_setops'], 'Medium', 'EXCEPT across periods',
    'Which customers completed an order in January 2026 but none in February 2026? Return customer id, sorted.', ['customer_id'], true,
    `SELECT customer_id FROM orders WHERE status = 'completed' AND order_date >= '2026-01-01' AND order_date < '2026-02-01'
EXCEPT
SELECT customer_id FROM orders WHERE status = 'completed' AND order_date >= '2026-02-01' AND order_date < '2026-03-01'
ORDER BY customer_id;`,
    ['A January buyer who returns in February', 'Any February order removes them.', `INSERT INTO orders VALUES (1018,2,'2026-02-05','completed',NULL);`],
    ['Two sets of customers.', 'Subtract February from January.', 'January query EXCEPT February query'],
    'EXCEPT removes anyone present in the second set.',
    `SELECT DISTINCT customer_id FROM orders WHERE status = 'completed' AND order_date >= '2026-01-01' AND order_date < '2026-02-01' ORDER BY customer_id;`),
  Q('P461', 'Strong cities', 'rides', ['c_cte'], 'Medium', 'CTE benchmark on aggregated rows',
    'Which cities have completed-trip revenue above the average city revenue? Return city and revenue, sorted by city.', ['city', 'revenue'], true,
    `WITH c AS (SELECT city, SUM(fare) AS revenue FROM trips WHERE status = 'completed' GROUP BY city) SELECT city, revenue FROM c WHERE revenue > (SELECT AVG(revenue) FROM c) ORDER BY city;`,
    ['A small new city', 'The benchmark moves with the data.', `INSERT INTO trips VALUES (521,7,16,'Pune','2026-02-08 09:00','completed',100,3.0);`],
    ['Revenue per city first.', 'Average those city totals.', 'WITH c AS (…) … WHERE revenue > (SELECT AVG(revenue) FROM c)'],
    'Benchmark and compared values must be at the same grain (city totals).',
    `SELECT city, SUM(fare) AS revenue FROM trips WHERE status = 'completed' GROUP BY city HAVING SUM(fare) > (SELECT AVG(fare) FROM trips) ORDER BY city;`),
  Q('P462', 'Account flows', 'bank', ['c_cte', 'j_left'], 'Medium', 'Two CTEs joined back to the dimension',
    'For every account, total credits, total debits (as a positive number) and net flow. Accounts with no activity show zeros. Sort by account id.', ['account_id', 'credits', 'debits', 'net'], true,
    `WITH cr AS (SELECT account_id, SUM(amount) AS credits FROM transactions WHERE amount > 0 GROUP BY account_id),
     db AS (SELECT account_id, -SUM(amount) AS debits FROM transactions WHERE amount < 0 GROUP BY account_id)
SELECT a.account_id, COALESCE(cr.credits, 0) AS credits, COALESCE(db.debits, 0) AS debits, COALESCE(cr.credits, 0) - COALESCE(db.debits, 0) AS net
FROM accounts a LEFT JOIN cr ON cr.account_id = a.account_id LEFT JOIN db ON db.account_id = a.account_id ORDER BY a.account_id;`,
    ['Credit-only account', 'Missing debits must be 0.', `INSERT INTO transactions VALUES (19,'A4','2026-03-01 10:00',500,'transfer','Deposit');`],
    ['Credits and debits are separate sets.', 'Start from accounts so quiet ones stay.', 'accounts LEFT JOIN cr LEFT JOIN db, COALESCE to 0'],
    'Start from the dimension and LEFT JOIN each CTE; joining the CTEs to each other loses accounts missing from one.',
    `WITH cr AS (SELECT account_id, SUM(amount) AS credits FROM transactions WHERE amount > 0 GROUP BY account_id), db AS (SELECT account_id, -SUM(amount) AS debits FROM transactions WHERE amount < 0 GROUP BY account_id) SELECT cr.account_id, cr.credits, db.debits, cr.credits - db.debits AS net FROM cr JOIN db ON db.account_id = cr.account_id ORDER BY cr.account_id;`),
  Q('P463', 'Org paths', 'hr', ['c_recursive'], 'Hard', 'Build a path string recursively',
    'For every employee show the path from the top of the org chart as names joined by " > " (e.g. Nandini > Arvind > Pooja). The top person\'s path is just their name. Return emp id and path, sorted by id.', ['emp_id', 'path'], true,
    `WITH RECURSIVE t AS (
  SELECT emp_id, name::text AS path FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.emp_id, t.path || ' > ' || e.name FROM employees e JOIN t ON e.manager_id = t.emp_id
) SELECT emp_id, path FROM t ORDER BY emp_id;`,
    ['A deeper level', 'Paths grow with depth.', `INSERT INTO employees VALUES (17,'Advik',1,6,'Intern',40000,'2026-04-01');`],
    ['Carry the path down as a column.', 'Append the child name at each step.', 't.path || \' > \' || e.name'],
    'A recursive CTE can accumulate values from level to level, such as a path.',
    `SELECT e.emp_id, m.name || ' > ' || e.name AS path FROM employees e JOIN employees m ON m.emp_id = e.manager_id ORDER BY e.emp_id;`, { patterns: ['hierarchy'] }),
  Q('P464', 'Referral generations', 'shop', ['c_recursive'], 'Hard', 'Count rows per recursion depth',
    'Customers who joined without a referral are generation 0, people they referred are generation 1, and so on. How many customers are in each generation? Return generation and customers, sorted by generation.', ['generation', 'customers'], true,
    `WITH RECURSIVE g AS (
  SELECT customer_id, 0 AS generation FROM customers WHERE referred_by IS NULL
  UNION ALL
  SELECT c.customer_id, g.generation + 1 FROM customers c JOIN g ON c.referred_by = g.customer_id
) SELECT generation, COUNT(*) AS customers FROM g GROUP BY generation ORDER BY generation;`,
    ['Third generation', 'Depth beyond 1 must be counted.', `INSERT INTO customers VALUES (11,'Tara Sen','tara@mail.com','Pune','2026-03-25',9),(12,'Uma Das','uma@mail.com','Pune','2026-03-26',11);`],
    ['Track the depth as a column.', 'Anchor at generation 0.', 'generation + 1 in the recursive step'],
    'Referral depth is unbounded, so a fixed number of self joins cannot cover it.',
    `SELECT CASE WHEN referred_by IS NULL THEN 0 ELSE 1 END AS generation, COUNT(*) AS customers FROM customers GROUP BY 1 ORDER BY 1;`, { patterns: ['hierarchy'] }),
  Q('P465', 'Well-paid departments', 'hr', ['c_cte'], 'Medium', 'Benchmark over rows vs over group averages',
    'Which departments have an average salary above the company-wide average salary of all employees? Return dept name and average salary (2 decimals), sorted by name.', ['dept_name', 'avg_salary'], true,
    `WITH d AS (SELECT dept_id, AVG(salary) AS avg_salary FROM employees WHERE dept_id IS NOT NULL GROUP BY dept_id)
SELECT dp.dept_name, ROUND(d.avg_salary, 2) AS avg_salary FROM d JOIN departments dp ON dp.dept_id = d.dept_id WHERE d.avg_salary > (SELECT AVG(salary) FROM employees) ORDER BY dp.dept_name;`,
    ['Many junior hires in one department', 'Company average is per employee.', `INSERT INTO employees SELECT 100+g, 'Temp'||g, 4, 14, 'Intern', 150000, '2026-04-01' FROM generate_series(1,30) g;`],
    ['Two different averages.', 'The benchmark averages employees, not departments.', 'WHERE d.avg_salary > (SELECT AVG(salary) FROM employees)'],
    'The average of department averages is not the company average; weight by employees when asked for the company-wide figure.',
    `WITH d AS (SELECT dept_id, AVG(salary) AS avg_salary FROM employees WHERE dept_id IS NOT NULL GROUP BY dept_id) SELECT dp.dept_name, ROUND(d.avg_salary, 2) AS avg_salary FROM d JOIN departments dp ON dp.dept_id = d.dept_id WHERE d.avg_salary > (SELECT AVG(avg_salary) FROM d) ORDER BY dp.dept_name;`),
];

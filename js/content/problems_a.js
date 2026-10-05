// Problem bank (part A: Levels 0–3).
// Fields: id (stable, never reuse), v (bump when a problem's logic changes), dataset, topics, difficulty,
// skills (revealed after first submission), prompt, output, orderMatters, solution, tests (hidden edge cases:
// a patch applied on top of the dataset), hints (3 levels), explain, trap (a realistic wrong query used only by
// the content validator to prove the tests have teeth), techniques (regexes for "idiomatic approach"),
// mistakes (problem-specific detectors), reasoning (business-definition questions), clarifications.

export const PROBLEMS_A = [
  {
    id: 'P001', v: 1, title: 'New Bengaluru signups', dataset: 'shop', difficulty: 'Easy', topics: ['f_filter', 'f_select'],
    skills: 'WHERE + date boundaries + ORDER BY', domain: 'E-commerce', diagnostic: true, timeTarget: 5,
    prompt: 'Marketing is running a city campaign. List every customer based in Bengaluru who signed up on or after 1 January 2026.\n\nSort by signup date (earliest first), then by name.',
    output: ['name', 'signup_date'], orderMatters: true,
    solution: `SELECT name, signup_date
FROM customers
WHERE city = 'Bengaluru' AND signup_date >= DATE '2026-01-01'
ORDER BY signup_date, name;`,
    tests: [
      { name: 'Signup exactly on 1 Jan', category: 'Edge cases', why: '"On or after" includes the boundary date.',
        patch: `INSERT INTO customers VALUES (11,'Zara Ali','zara@mail.com','Bengaluru','2026-01-01',NULL),(12,'Om Pai','om@mail.com','Bengaluru','2025-12-31',NULL);` },
      { name: 'Same-day signups', category: 'Logic', why: 'Ties on signup date must be broken by name.',
        patch: `INSERT INTO customers VALUES (13,'Aditi Rao','aditi@mail.com','Bengaluru','2026-03-01',NULL);` },
    ],
    hints: ['Two conditions must both hold. Think carefully about whether the boundary date is included.', 'Use >= for "on or after". ORDER BY accepts several columns.', "WHERE city = 'Bengaluru' AND signup_date >= DATE '2026-01-01' ORDER BY signup_date, name"],
    explain: 'A half-open range (>= start) is the safest way to express "on or after". The second sort key makes the order deterministic when dates tie.',
    trap: `SELECT name, signup_date FROM customers WHERE city = 'Bengaluru' AND signup_date > '2026-01-01' ORDER BY signup_date;`,
    techniques: ['>=\\s*(date\\s*)?\'2026-01-01\''], patterns: [],
  },
  {
    id: 'P002', v: 1, title: 'Incomplete customer profiles', dataset: 'shop', difficulty: 'Easy', topics: ['f_null', 'f_case'],
    skills: 'IS NULL + CASE', domain: 'E-commerce', timeTarget: 5,
    prompt: 'The CRM team wants to fix incomplete profiles. Return every customer missing an email, a city, or both, with a column `missing` whose value is exactly `email`, `city`, or `both`.\n\nSort by customer_id.',
    output: ['customer_id', 'name', 'missing'], orderMatters: true,
    solution: `SELECT customer_id, name,
       CASE WHEN email IS NULL AND city IS NULL THEN 'both'
            WHEN email IS NULL THEN 'email'
            ELSE 'city' END AS missing
FROM customers
WHERE email IS NULL OR city IS NULL
ORDER BY customer_id;`,
    tests: [
      { name: 'Missing both fields', category: 'Logic', why: 'The "both" branch must be checked before the single-field branches.',
        patch: `INSERT INTO customers VALUES (11,'Ghost User',NULL,NULL,'2026-03-20',NULL);` },
    ],
    hints: ['A comparison with NULL using = is never true.', 'In CASE, the first matching branch wins — which condition is most specific?', "CASE WHEN email IS NULL AND city IS NULL THEN 'both' WHEN email IS NULL THEN 'email' ELSE 'city' END"],
    explain: 'IS NULL is the only way to test for NULL. CASE branch order encodes precedence: the combined condition goes first.',
    trap: `SELECT customer_id, name, CASE WHEN email IS NULL THEN 'email' WHEN city IS NULL THEN 'city' ELSE 'both' END AS missing FROM customers WHERE email IS NULL OR city IS NULL ORDER BY customer_id;`,
    mistakes: [{ re: '=\\s*NULL|<>\\s*NULL|!=\\s*NULL', cat: 'NULL handling', msg: 'Compared with NULL using = or <>', concept: 'Use IS NULL / IS NOT NULL; comparisons with NULL yield NULL.' }],
    techniques: ['is\\s+null'], patterns: [],
  },
  {
    id: 'P003', v: 1, title: 'Price bands', dataset: 'shop', difficulty: 'Easy', topics: ['f_case'],
    skills: 'CASE + boundaries', domain: 'E-commerce', timeTarget: 5,
    prompt: 'Merchandising groups products into price bands: `budget` under ₹1,000; `mid` from ₹1,000 up to but not including ₹2,500; `premium` ₹2,500 and above.\n\nReturn every product with its band, most expensive first (ties by name).',
    output: ['name', 'price', 'band'], orderMatters: true,
    solution: `SELECT name, price,
       CASE WHEN price < 1000 THEN 'budget'
            WHEN price < 2500 THEN 'mid'
            ELSE 'premium' END AS band
FROM products
ORDER BY price DESC, name;`,
    tests: [
      { name: 'Prices exactly on band edges', category: 'Edge cases', why: '₹1,000 is mid and ₹2,500 is premium.',
        patch: `INSERT INTO products VALUES (109,'Water Bottle','Fitness',1000,true),(110,'Smart Scale','Fitness',2500,true);` },
    ],
    hints: ['Write the band rules as inequalities first, paying attention to each boundary.', 'Because CASE stops at the first match, you can check < 1000 then < 2500.', "CASE WHEN price < 1000 THEN 'budget' WHEN price < 2500 THEN 'mid' ELSE 'premium' END"],
    explain: 'Ordered CASE branches with strict upper bounds avoid overlapping or missing boundary values. BETWEEN is inclusive on both ends, which is why it is risky for bands.',
    trap: `SELECT name, price, CASE WHEN price <= 1000 THEN 'budget' WHEN price BETWEEN 1000 AND 2500 THEN 'mid' ELSE 'premium' END AS band FROM products ORDER BY price DESC, name;`,
    techniques: ['case\\s+when'], patterns: [],
  },
  {
    id: 'P004', v: 1, title: 'Email domains', dataset: 'shop', difficulty: 'Easy', topics: ['f_functions'],
    skills: 'String functions', domain: 'E-commerce', timeTarget: 6,
    prompt: 'For every customer who has an email, return their first name (the text before the first space in `name`) and their email domain (the text after `@`), with the domain in lowercase.\n\nSort by customer_id.',
    output: ['customer_id', 'first_name', 'email_domain'], orderMatters: true,
    solution: `SELECT customer_id,
       SPLIT_PART(name, ' ', 1) AS first_name,
       LOWER(SPLIT_PART(email, '@', 2)) AS email_domain
FROM customers
WHERE email IS NOT NULL
ORDER BY customer_id;`,
    tests: [
      { name: 'Mixed-case domain', category: 'Edge cases', why: 'Domains must be normalised to lowercase.',
        patch: `INSERT INTO customers VALUES (11,'Kiran Bose','Kiran@Work.COM','Pune','2026-03-12',NULL);` },
      { name: 'Single-word name', category: 'Edge cases', why: 'A name without a space should return the whole name.',
        patch: `INSERT INTO customers VALUES (12,'Madhu','madhu@mail.com','Pune','2026-03-13',NULL);` },
    ],
    hints: ['PostgreSQL has a function that splits a string on a delimiter and returns the n-th part.', 'SPLIT_PART(text, delimiter, n). Remember the lowercase requirement.', "SPLIT_PART(name,' ',1), LOWER(SPLIT_PART(email,'@',2)), WHERE email IS NOT NULL"],
    explain: 'SPLIT_PART handles both cases cleanly (no space → whole string). MySQL equivalent: SUBSTRING_INDEX(name, \' \', 1).',
    trap: `SELECT customer_id, SPLIT_PART(name,' ',1) AS first_name, SPLIT_PART(email,'@',2) AS email_domain FROM customers WHERE email IS NOT NULL ORDER BY customer_id;`,
    techniques: ['split_part|substring|position|strpos'], patterns: [],
  },
  {
    id: 'P005', v: 1, title: 'Weekend orders', dataset: 'shop', difficulty: 'Easy', topics: ['f_dates', 'f_filter'],
    skills: 'Date functions', domain: 'E-commerce', timeTarget: 6,
    prompt: 'Ops wants to staff weekends better. List every order placed on a Saturday or Sunday (any status) with the full English day name (e.g. `Saturday`).\n\nSort by order_date, then order_id.',
    output: ['order_id', 'order_date', 'day_name'], orderMatters: true,
    solution: `SELECT order_id, order_date, TO_CHAR(order_date, 'FMDay') AS day_name
FROM orders
WHERE EXTRACT(ISODOW FROM order_date) IN (6, 7)
ORDER BY order_date, order_id;`,
    tests: [
      { name: 'Sunday orders', category: 'Dates/time', why: 'Day-of-week numbering differs between DOW (0=Sun) and ISODOW (7=Sun).',
        patch: `INSERT INTO orders VALUES (1018,10,'2026-04-12','pending',NULL);` },
    ],
    hints: ['Extract the day of week from the date — but check which numbering scheme you are using.', 'EXTRACT(DOW …) returns 0–6 starting Sunday; EXTRACT(ISODOW …) returns 1–7 starting Monday. TO_CHAR can format day names.', "WHERE EXTRACT(ISODOW FROM order_date) IN (6,7); TO_CHAR(order_date,'FMDay')"],
    explain: "Mixing DOW and ISODOW is a classic off-by-one. MySQL: DAYOFWEEK() is 1=Sunday, DAYNAME() gives the name.",
    trap: `SELECT order_id, order_date, TO_CHAR(order_date,'FMDay') AS day_name FROM orders WHERE EXTRACT(DOW FROM order_date) IN (6,7) ORDER BY order_date, order_id;`,
    techniques: ['isodow|dow|to_char'], patterns: [],
  },
  // Level 1
  {
    id: 'P010', v: 1, title: 'Completed order summary', dataset: 'shop', difficulty: 'Easy', topics: ['a_basic', 'j_fanout'],
    skills: 'Aggregation + grain awareness', domain: 'E-commerce', diagnostic: true, timeTarget: 6,
    prompt: 'Finance wants one row summarising completed orders: how many completed orders there were, how many units they contained, and their gross revenue (quantity × unit price).',
    output: ['total_orders', 'total_units', 'gross_revenue'], orderMatters: false,
    solution: `SELECT COUNT(DISTINCT o.order_id) AS total_orders,
       SUM(oi.quantity) AS total_units,
       SUM(oi.quantity * oi.unit_price) AS gross_revenue
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
WHERE o.status = 'completed';`,
    tests: [
      { name: 'Order with many line items', category: 'Joins', why: 'Counting rows after joining line items counts lines, not orders.',
        patch: `INSERT INTO orders VALUES (1018,10,'2026-04-15','completed',NULL); INSERT INTO order_items VALUES (1018,101,1,799),(1018,102,1,3499),(1018,106,1,899);` },
    ],
    hints: ['What does one row represent after you combine orders with their line items?', 'COUNT(*) counts joined rows. You need the number of distinct orders.', 'COUNT(DISTINCT o.order_id), SUM(quantity), SUM(quantity * unit_price) … WHERE status = \'completed\''],
    explain: 'After joining to order_items the grain is "order line", so orders must be counted with COUNT(DISTINCT). Sums of line-level measures are correct at line grain.',
    trap: `SELECT COUNT(*) AS total_orders, SUM(oi.quantity) AS total_units, SUM(oi.quantity*oi.unit_price) AS gross_revenue FROM orders o JOIN order_items oi ON oi.order_id=o.order_id WHERE o.status='completed';`,
    reasoning: [{ q: 'After joining orders to order_items, what does one row represent?', options: ['One order', 'One customer', 'One product line within an order', 'One payment'], answer: 2,
      why: 'order_items has one row per product per order, so the join produces one row per line item.' }],
    techniques: ['count\\s*\\(\\s*distinct'], patterns: ['fanout_guard'],
  },
  {
    id: 'P011', v: 1, title: 'Revenue by category', dataset: 'shop', difficulty: 'Easy', topics: ['a_groupby', 'j_inner'],
    skills: 'JOIN + GROUP BY', domain: 'E-commerce', timeTarget: 6,
    prompt: 'Report gross revenue (quantity × unit price) per product category, counting only completed orders.\n\nSort by revenue, highest first.',
    output: ['category', 'revenue'], orderMatters: true,
    solution: `SELECT p.category, SUM(oi.quantity * oi.unit_price) AS revenue
FROM order_items oi
JOIN orders o   ON o.order_id = oi.order_id
JOIN products p ON p.product_id = oi.product_id
WHERE o.status = 'completed'
GROUP BY p.category
ORDER BY revenue DESC;`,
    tests: [
      { name: 'New category on a non-completed order', category: 'Business logic', why: 'Only completed orders count toward revenue.',
        patch: `INSERT INTO products VALUES (109,'Notebook','Stationery',199,true); INSERT INTO orders VALUES (1018,10,'2026-04-15','pending',NULL); INSERT INTO order_items VALUES (1018,109,10,199);` },
    ],
    hints: ['You need columns from three tables. Which table holds status? Which holds category?', 'Join order_items to orders and products, filter status, then group.', 'GROUP BY p.category with WHERE o.status = \'completed\''],
    explain: 'Line items carry the money; products carry the category; orders carry the status. Filter rows before grouping.',
    trap: `SELECT p.category, SUM(oi.quantity*oi.unit_price) AS revenue FROM order_items oi JOIN products p ON p.product_id=oi.product_id GROUP BY p.category ORDER BY revenue DESC;`,
    techniques: ['group\\s+by'], patterns: [],
  },
  {
    id: 'P012', v: 1, title: 'Repeat buyers', dataset: 'shop', difficulty: 'Medium', topics: ['a_having'],
    skills: 'WHERE vs HAVING', domain: 'E-commerce', diagnostic: true, timeTarget: 8,
    prompt: 'A loyalty programme targets repeat buyers: customers with at least 2 completed orders. Return each such customer with their number of completed orders.\n\nSort by completed orders (highest first), then customer_id.',
    output: ['customer_id', 'completed_orders'], orderMatters: true,
    solution: `SELECT customer_id, COUNT(*) AS completed_orders
FROM orders
WHERE status = 'completed'
GROUP BY customer_id
HAVING COUNT(*) >= 2
ORDER BY completed_orders DESC, customer_id;`,
    tests: [
      { name: 'Two orders, one cancelled', category: 'Business logic', why: 'Cancelled orders are not purchases.',
        patch: `INSERT INTO orders VALUES (1018,9,'2026-04-20','cancelled',NULL);` },
    ],
    hints: ['Some conditions apply to individual orders, one applies to a customer\'s total.', 'Row conditions go in WHERE; conditions on aggregates go in HAVING.', 'WHERE status = \'completed\' GROUP BY customer_id HAVING COUNT(*) >= 2'],
    explain: 'WHERE removes non-completed orders before counting; HAVING then filters customer groups by their count.',
    trap: `SELECT customer_id, COUNT(*) AS completed_orders FROM orders GROUP BY customer_id HAVING COUNT(*) >= 2 ORDER BY completed_orders DESC, customer_id;`,
    techniques: ['having'], patterns: [],
  },
  {
    id: 'P013', v: 1, title: 'Monthly completion rate', dataset: 'shop', difficulty: 'Medium', topics: ['a_conditional', 'f_functions'],
    skills: 'Conditional aggregation + rates', domain: 'E-commerce', timeTarget: 9,
    prompt: 'For each month with at least one order, report total orders, completed orders, cancelled orders and the completion rate (completed ÷ total, as a percentage rounded to 1 decimal).\n\nShow the month as text like `2026-01`. Sort by month.',
    output: ['month', 'total_orders', 'completed', 'cancelled', 'completion_rate_pct'], orderMatters: true,
    solution: `SELECT TO_CHAR(order_date, 'YYYY-MM') AS month,
       COUNT(*) AS total_orders,
       COUNT(*) FILTER (WHERE status = 'completed') AS completed,
       COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 1) AS completion_rate_pct
FROM orders
GROUP BY 1
ORDER BY 1;`,
    tests: [
      { name: 'Month with no completed orders', category: 'Edge cases', why: 'A month can have a 0% completion rate.',
        patch: `INSERT INTO orders VALUES (1018,5,'2026-05-02','pending',NULL);` },
    ],
    hints: ['You need several counts of different subsets in the same row per month.', 'Count with a condition: SUM(CASE …) or COUNT(*) FILTER (WHERE …). Watch integer division.', "ROUND(100.0 * COUNT(*) FILTER (WHERE status='completed') / COUNT(*), 1) grouped by TO_CHAR(order_date,'YYYY-MM')"],
    explain: 'Conditional aggregation computes several subset counts in one pass. Multiplying by 100.0 forces numeric division.',
    trap: `SELECT TO_CHAR(order_date,'YYYY-MM') AS month, COUNT(*) AS total_orders, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed, SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled, ROUND(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)/COUNT(*)*100,1) AS completion_rate_pct FROM orders GROUP BY 1 ORDER BY 1;`,
    techniques: ['filter\\s*\\(\\s*where|sum\\s*\\(\\s*case|count\\s*\\(\\s*case'], patterns: ['conditional_agg'],
  },
  {
    id: 'P014', v: 1, title: 'Buyers and coupons', dataset: 'shop', difficulty: 'Easy', topics: ['a_distinct'],
    skills: 'COUNT variants + NULL', domain: 'E-commerce', timeTarget: 5,
    prompt: 'Return one row with: the number of distinct customers who placed any order (any status), the number of distinct coupon codes used, and the number of orders that used a coupon.',
    output: ['buyers', 'distinct_coupons', 'orders_with_coupon'], orderMatters: false,
    solution: `SELECT COUNT(DISTINCT customer_id) AS buyers,
       COUNT(DISTINCT coupon_code) AS distinct_coupons,
       COUNT(coupon_code) AS orders_with_coupon
FROM orders;`,
    tests: [
      { name: 'More orders without coupons', category: 'NULL handling', why: 'COUNT(*) counts rows; COUNT(col) skips NULLs.',
        patch: `INSERT INTO orders VALUES (1018,10,'2026-04-15','pending',NULL),(1019,10,'2026-04-16','completed',NULL);` },
    ],
    hints: ['Three different counting behaviours are needed.', 'COUNT(*) vs COUNT(column) vs COUNT(DISTINCT column) treat NULLs differently.', 'COUNT(DISTINCT customer_id), COUNT(DISTINCT coupon_code), COUNT(coupon_code)'],
    explain: 'COUNT(coupon_code) counts non-NULL values — exactly the orders that used a coupon.',
    trap: `SELECT COUNT(DISTINCT customer_id) AS buyers, COUNT(DISTINCT coupon_code) AS distinct_coupons, COUNT(*) AS orders_with_coupon FROM orders;`,
    techniques: ['count\\s*\\(\\s*coupon_code|filter|case'], patterns: [],
  },
  {
    id: 'P015', v: 1, title: 'Fares by city and vehicle', dataset: 'rides', difficulty: 'Medium', topics: ['a_groupby', 'j_inner', 'a_basic'],
    skills: 'Multi-dimension GROUP BY + NULL in AVG', domain: 'Ride-sharing', timeTarget: 9,
    prompt: 'For completed trips, report per trip city and driver vehicle type: the number of completed trips, the average fare (2 decimals) and total fare revenue.\n\nA completed trip whose fare is missing still counts as a trip, but must not drag the average down.\n\nSort by city, then vehicle type.',
    output: ['city', 'vehicle_type', 'completed_trips', 'avg_fare', 'revenue'], orderMatters: true,
    solution: `SELECT t.city, d.vehicle_type,
       COUNT(*) AS completed_trips,
       ROUND(AVG(t.fare), 2) AS avg_fare,
       SUM(t.fare) AS revenue
FROM trips t
JOIN drivers d ON d.driver_id = t.driver_id
WHERE t.status = 'completed'
GROUP BY t.city, d.vehicle_type
ORDER BY t.city, d.vehicle_type;`,
    tests: [
      { name: 'Completed trip with missing fare', category: 'NULL handling', why: 'AVG ignores NULLs; treating NULL as 0 lowers the average.',
        patch: `INSERT INTO trips VALUES (521,2,12,'Bengaluru','2026-02-08 09:00','completed',NULL,6.0);` },
    ],
    hints: ['The output grain is (city, vehicle type). Which tables hold each?', 'AVG already skips NULLs. Don\'t replace NULL fares with 0.', 'JOIN drivers, WHERE status = \'completed\', GROUP BY t.city, d.vehicle_type, ROUND(AVG(fare),2)'],
    explain: 'Leaving NULL fares as NULL keeps them in COUNT(*) but out of AVG — exactly the requested definition.',
    trap: `SELECT t.city, d.vehicle_type, COUNT(*) AS completed_trips, ROUND(AVG(COALESCE(t.fare,0)),2) AS avg_fare, SUM(t.fare) AS revenue FROM trips t JOIN drivers d ON d.driver_id=t.driver_id WHERE t.status='completed' GROUP BY 1,2 ORDER BY 1,2;`,
    mistakes: [{ re: 'avg\\s*\\(\\s*coalesce', cat: 'NULL handling', msg: 'Replaced NULLs with 0 inside AVG', concept: 'AVG ignores NULLs by design; COALESCE(x,0) changes the metric.' }],
    techniques: ['avg\\s*\\('], patterns: [],
  },
  // Level 2
  {
    id: 'P020', v: 1, title: 'Order totals with customer names', dataset: 'shop', difficulty: 'Easy', topics: ['j_inner', 'a_groupby'],
    skills: 'JOIN + GROUP BY', domain: 'E-commerce', diagnostic: true, timeTarget: 6,
    prompt: 'List each completed order with the customer\'s name and the order total (sum of quantity × unit price).\n\nSort by order_id.',
    output: ['order_id', 'customer_name', 'order_total'], orderMatters: true,
    solution: `SELECT o.order_id, c.name AS customer_name, SUM(oi.quantity * oi.unit_price) AS order_total
FROM orders o
JOIN customers c    ON c.customer_id = o.customer_id
JOIN order_items oi ON oi.order_id = o.order_id
WHERE o.status = 'completed'
GROUP BY o.order_id, c.name
ORDER BY o.order_id;`,
    tests: [
      { name: 'Two customers with the same name', category: 'Aggregation', why: 'Group by the order, not by the name.',
        patch: `INSERT INTO customers VALUES (11,'Aarav Mehta','aarav2@mail.com','Pune','2026-03-20',NULL); INSERT INTO orders VALUES (1018,11,'2026-04-02','completed',NULL); INSERT INTO order_items VALUES (1018,107,1,349);` },
    ],
    hints: ['Line items must be rolled up to order grain.', 'Join three tables and group by the order identifier.', 'GROUP BY o.order_id, c.name; SUM(oi.quantity * oi.unit_price)'],
    explain: 'Grouping by the key (order_id) rather than a descriptive attribute keeps distinct entities separate.',
    trap: `SELECT MIN(o.order_id) AS order_id, c.name AS customer_name, SUM(oi.quantity*oi.unit_price) AS order_total FROM orders o JOIN customers c ON c.customer_id=o.customer_id JOIN order_items oi ON oi.order_id=o.order_id WHERE o.status='completed' GROUP BY c.name, o.order_date ORDER BY 1;`,
    techniques: ['join'], patterns: [],
  },
  {
    id: 'P021', v: 1, title: 'Every customer\'s spend', dataset: 'shop', difficulty: 'Medium', topics: ['j_left', 'f_null'],
    skills: 'LEFT JOIN + ON vs WHERE + COALESCE', domain: 'E-commerce', diagnostic: true, timeTarget: 9,
    prompt: 'Build a customer table for the CRM: every customer, their number of completed orders and their total completed spend (sum of quantity × unit price). Customers with no completed orders must appear with 0 for both.\n\nSort by customer_id.',
    output: ['customer_id', 'name', 'completed_orders', 'total_spend'], orderMatters: true,
    solution: `SELECT c.customer_id, c.name,
       COUNT(DISTINCT o.order_id) AS completed_orders,
       COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_spend
FROM customers c
LEFT JOIN orders o       ON o.customer_id = c.customer_id AND o.status = 'completed'
LEFT JOIN order_items oi ON oi.order_id = o.order_id
GROUP BY c.customer_id, c.name
ORDER BY c.customer_id;`,
    tests: [
      { name: 'Customer with only a cancelled order', category: 'Joins', why: 'A WHERE filter on the orders side removes them entirely.',
        patch: `INSERT INTO customers VALUES (11,'Tara Sen','tara@mail.com','Pune','2026-03-25',NULL); INSERT INTO orders VALUES (1018,11,'2026-04-01','cancelled',NULL); INSERT INTO order_items VALUES (1018,101,1,799);` },
    ],
    hints: ['Which customers disappear when a filter on orders is applied after joining?', 'Move the status condition into the ON clause, and count something that is NULL when there is no match.', "LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status = 'completed' … COUNT(DISTINCT o.order_id), COALESCE(SUM(…),0)"],
    explain: 'Filtering the optional side inside ON keeps unmatched customers; COUNT(o.order_id) counts 0 for them and COALESCE turns a NULL sum into 0.',
    trap: `SELECT c.customer_id, c.name, COUNT(DISTINCT o.order_id) AS completed_orders, COALESCE(SUM(oi.quantity*oi.unit_price),0) AS total_spend FROM customers c LEFT JOIN orders o ON o.customer_id=c.customer_id LEFT JOIN order_items oi ON oi.order_id=o.order_id WHERE o.status='completed' GROUP BY c.customer_id, c.name ORDER BY c.customer_id;`,
    mistakes: [{ re: 'left\\s+join[\\s\\S]*where[\\s\\S]*\\bo\\.status', cat: 'Joins', msg: 'Filtered the outer-joined table in WHERE', concept: 'A WHERE condition on the right side of a LEFT JOIN removes unmatched rows; put it in ON.' }],
    techniques: ['left\\s+(outer\\s+)?join'], patterns: ['anti_join'],
  },
  {
    id: 'P022', v: 1, title: 'Units vs payments', dataset: 'shop', difficulty: 'Medium', topics: ['j_fanout', 'c_cte'],
    skills: 'Pre-aggregation to avoid fan-out', domain: 'Payments', timeTarget: 10,
    prompt: 'Payments ops is reconciling completed orders. For each completed order, return the total units ordered and the total amount of SUCCESSFUL payments.\n\nSort by order_id.',
    output: ['order_id', 'units', 'paid_amount'], orderMatters: true,
    solution: `WITH items AS (
  SELECT order_id, SUM(quantity) AS units FROM order_items GROUP BY order_id
), paid AS (
  SELECT order_id, SUM(amount) AS paid_amount FROM payments WHERE status = 'success' GROUP BY order_id
)
SELECT o.order_id, i.units, COALESCE(p.paid_amount, 0) AS paid_amount
FROM orders o
JOIN items i     ON i.order_id = o.order_id
LEFT JOIN paid p ON p.order_id = o.order_id
WHERE o.status = 'completed'
ORDER BY o.order_id;`,
    tests: [
      { name: 'Split payment', category: 'Joins', why: 'Two successful payments on a multi-line order multiply rows when both child tables are joined directly.',
        patch: `UPDATE payments SET amount = 1000 WHERE payment_id = 13; INSERT INTO payments VALUES (18,1012,'upi',745.00,'2026-03-05 08:31','success'); INSERT INTO order_items VALUES (1012,106,1,899);` },
    ],
    hints: ['Order 1001 has 2 line items and 1 payment. What happens to the payment amount if you join both tables to orders at once?', 'Aggregate each child table to one row per order before joining them together.', 'CTE items: SUM(quantity) GROUP BY order_id; CTE paid: SUM(amount) WHERE status=\'success\' GROUP BY order_id; then join both to orders.'],
    explain: 'Joining two independent one-to-many children to the same parent creates items × payments rows. Pre-aggregating each child to order grain removes the multiplication.',
    trap: `SELECT o.order_id, SUM(oi.quantity) AS units, SUM(p.amount) AS paid_amount FROM orders o JOIN order_items oi ON oi.order_id=o.order_id JOIN payments p ON p.order_id=o.order_id AND p.status='success' WHERE o.status='completed' GROUP BY o.order_id ORDER BY o.order_id;`,
    techniques: ['with\\s+\\w+\\s+as|\\(\\s*select[\\s\\S]*group\\s+by[\\s\\S]*\\)'], patterns: ['fanout_guard'],
  },
  {
    id: 'P023', v: 1, title: 'Out-earning the boss', dataset: 'hr', difficulty: 'Medium', topics: ['j_self'],
    skills: 'SELF JOIN', domain: 'HR', timeTarget: 7,
    prompt: 'HR is auditing pay bands. Find employees who earn more than their direct manager.\n\nSort by employee name.',
    output: ['employee', 'employee_salary', 'manager', 'manager_salary'], orderMatters: true,
    solution: `SELECT e.name AS employee, e.salary AS employee_salary, m.name AS manager, m.salary AS manager_salary
FROM employees e
JOIN employees m ON m.emp_id = e.manager_id
WHERE e.salary > m.salary
ORDER BY e.name;`,
    tests: [
      { name: 'Another report out-earns their manager', category: 'Joins', why: 'Make sure the join direction is employee.manager_id → manager.emp_id.',
        patch: `UPDATE employees SET salary = 175000 WHERE emp_id = 10;` },
    ],
    hints: ['You need two copies of the employees table in one query.', 'Alias one as the employee and one as the manager; connect employee.manager_id to manager.emp_id.', 'FROM employees e JOIN employees m ON m.emp_id = e.manager_id WHERE e.salary > m.salary'],
    explain: 'A self-join turns a row-to-row relationship inside one table into columns you can compare.',
    trap: `SELECT e.name AS employee, e.salary AS employee_salary, m.name AS manager, m.salary AS manager_salary FROM employees e JOIN employees m ON e.emp_id = m.manager_id WHERE e.salary > m.salary ORDER BY e.name;`,
    techniques: ['employees\\s+\\w+\\s+(inner\\s+)?join\\s+employees'], patterns: [],
  },
  {
    id: 'P024', v: 1, title: 'Products nobody bought', dataset: 'shop', difficulty: 'Medium', topics: ['j_anti_semi'],
    skills: 'Anti-join with a condition', domain: 'E-commerce', timeTarget: 8,
    prompt: 'Merchandising wants products that have never been part of a completed order (active or not). A product that only ever appeared in cancelled or pending orders counts as never sold.\n\nSort by product_id.',
    output: ['product_id', 'name'], orderMatters: true,
    solution: `SELECT p.product_id, p.name
FROM products p
WHERE NOT EXISTS (
  SELECT 1
  FROM order_items oi
  JOIN orders o ON o.order_id = oi.order_id
  WHERE oi.product_id = p.product_id AND o.status = 'completed'
)
ORDER BY p.product_id;`,
    tests: [
      { name: 'Sold only in a cancelled order', category: 'Business logic', why: 'Appearing in order_items is not the same as being sold.',
        patch: `INSERT INTO products VALUES (109,'Foam Roller','Fitness',899,true),(110,'Jump Rope','Fitness',299,true); INSERT INTO order_items VALUES (1014,110,1,299);` },
    ],
    hints: ['Find the products for which a certain kind of row does NOT exist.', 'NOT EXISTS with a subquery that joins order_items to orders and checks status.', "WHERE NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o … WHERE oi.product_id = p.product_id AND o.status='completed')"],
    explain: 'NOT EXISTS expresses "no qualifying row" directly and is NULL-safe. The status condition belongs inside the subquery.',
    trap: `SELECT p.product_id, p.name FROM products p WHERE p.product_id NOT IN (SELECT product_id FROM order_items) ORDER BY p.product_id;`,
    techniques: ['not\\s+exists|left\\s+join[\\s\\S]*is\\s+null'], patterns: ['anti_join'],
  },
  {
    id: 'P025', v: 1, title: 'City supply snapshot', dataset: 'rides', difficulty: 'Hard', topics: ['j_multi', 'j_left', 'j_fanout'],
    skills: 'LEFT JOIN + COUNT DISTINCT + grain', domain: 'Ride-sharing', timeTarget: 15,
    prompt: 'For every city that has at least one registered driver, report: registered drivers, active drivers (drivers with at least one completed trip), completed trips performed by those drivers, and their total fare revenue (0 if none).\n\nUse the driver\'s registered city. Sort by city.',
    output: ['city', 'drivers', 'active_drivers', 'completed_trips', 'revenue'], orderMatters: true,
    solution: `SELECT d.city,
       COUNT(DISTINCT d.driver_id) AS drivers,
       COUNT(DISTINCT t.driver_id) AS active_drivers,
       COUNT(t.trip_id) AS completed_trips,
       COALESCE(SUM(t.fare), 0) AS revenue
FROM drivers d
LEFT JOIN trips t ON t.driver_id = d.driver_id AND t.status = 'completed'
WHERE d.city IS NOT NULL
GROUP BY d.city
ORDER BY d.city;`,
    tests: [
      { name: 'City with drivers but no trips', category: 'Joins', why: 'Cities without trips must still appear with zeros.',
        patch: `INSERT INTO drivers VALUES (17,'Selvi','Chennai','2026-02-01','auto');` },
      { name: 'Driver with no city', category: 'NULL handling', why: 'A NULL city is not a city.',
        patch: `INSERT INTO drivers VALUES (18,'Unknown',NULL,'2026-02-01','bike');` },
    ],
    hints: ['Start from drivers so every city with drivers survives; the trip side is optional.', 'After joining trips, a driver repeats once per trip — count drivers with DISTINCT. Put the status filter in ON.', 'FROM drivers d LEFT JOIN trips t ON t.driver_id = d.driver_id AND t.status = \'completed\' … COUNT(DISTINCT d.driver_id), COUNT(DISTINCT t.driver_id), COUNT(t.trip_id)'],
    explain: 'COUNT(DISTINCT t.driver_id) counts only drivers with a matched (non-NULL) trip, i.e. active drivers. Status in ON keeps idle drivers.',
    trap: `SELECT d.city, COUNT(d.driver_id) AS drivers, COUNT(DISTINCT t.driver_id) AS active_drivers, COUNT(t.trip_id) AS completed_trips, COALESCE(SUM(t.fare),0) AS revenue FROM drivers d LEFT JOIN trips t ON t.driver_id=d.driver_id WHERE t.status='completed' GROUP BY d.city ORDER BY d.city;`,
    techniques: ['left\\s+join'], patterns: ['fanout_guard'],
  },
  {
    id: 'P026', v: 1, title: 'Daily trips grid', dataset: 'rides', difficulty: 'Medium', topics: ['j_cross', 'x_dates'],
    skills: 'CROSS JOIN scaffold + LEFT JOIN', domain: 'Ride-sharing', timeTarget: 10,
    prompt: 'The city dashboard needs a complete grid: for every city with at least one registered driver and every date from 2026-02-01 to 2026-02-07 inclusive, the number of completed trips requested in that city on that date — showing 0 where there were none.\n\nSort by city, then date.',
    output: ['city', 'trip_date', 'completed_trips'], orderMatters: true,
    solution: `WITH cities AS (SELECT DISTINCT city FROM drivers WHERE city IS NOT NULL),
days AS (SELECT d::date AS trip_date FROM generate_series(DATE '2026-02-01', DATE '2026-02-07', INTERVAL '1 day') d)
SELECT c.city, dy.trip_date, COUNT(t.trip_id) AS completed_trips
FROM cities c
CROSS JOIN days dy
LEFT JOIN trips t ON t.city = c.city AND t.requested_at::date = dy.trip_date AND t.status = 'completed'
GROUP BY c.city, dy.trip_date
ORDER BY c.city, dy.trip_date;`,
    tests: [
      { name: 'City with drivers but no trips', category: 'Joins', why: 'The grid comes from the dimension tables, not from trips.',
        patch: `INSERT INTO drivers VALUES (17,'Selvi','Chennai','2026-02-01','auto');` },
    ],
    hints: ['Grouping trips alone can never produce rows for days with zero trips.', 'Build every (city, date) pair first, then attach trips with an outer join.', "cities CROSS JOIN generate_series(…) LEFT JOIN trips ON city, date AND status='completed'; COUNT(t.trip_id)"],
    explain: 'A scaffold (cross product of dimensions) guarantees every combination exists; the LEFT JOIN + COUNT(column) turns missing facts into 0.',
    trap: `SELECT city, requested_at::date AS trip_date, COUNT(*) AS completed_trips FROM trips WHERE status='completed' GROUP BY 1,2 ORDER BY 1,2;`,
    techniques: ['cross\\s+join|generate_series'], patterns: ['date_spine'],
  },
  {
    id: 'P027', v: 1, title: 'Driver rating scorecard', dataset: 'rides', difficulty: 'Hard', topics: ['j_fanout', 'j_left'],
    skills: 'Many ratings per trip + outer join', domain: 'Ride-sharing', timeTarget: 14,
    prompt: 'For every driver, report the number of completed trips and the average star rating that riders gave them on those trips (2 decimals; NULL if never rated). Ratings that drivers gave to riders must not count.\n\nSort by driver_id.',
    output: ['driver_id', 'completed_trips', 'avg_rider_rating'], orderMatters: true,
    solution: `SELECT d.driver_id,
       COUNT(t.trip_id) AS completed_trips,
       ROUND(AVG(r.stars), 2) AS avg_rider_rating
FROM drivers d
LEFT JOIN trips t   ON t.driver_id = d.driver_id AND t.status = 'completed'
LEFT JOIN ratings r ON r.trip_id = t.trip_id AND r.rated_by = 'rider'
GROUP BY d.driver_id
ORDER BY d.driver_id;`,
    tests: [
      { name: 'Trip rated by both sides', category: 'Joins', why: 'Two rating rows per trip double-count trips unless restricted to rider ratings.',
        patch: `INSERT INTO ratings VALUES (513,'driver',1),(519,'driver',3);` },
    ],
    hints: ['How many rating rows can a single trip have?', 'Restrict ratings to the rider side in the join condition so each trip matches at most one rating row.', "LEFT JOIN ratings r ON r.trip_id = t.trip_id AND r.rated_by = 'rider'"],
    explain: 'Filtering ratings to one side in ON restores a one-to-at-most-one relationship, so trip counts stay correct.',
    trap: `SELECT d.driver_id, COUNT(t.trip_id) AS completed_trips, ROUND(AVG(r.stars),2) AS avg_rider_rating FROM drivers d LEFT JOIN trips t ON t.driver_id=d.driver_id AND t.status='completed' LEFT JOIN ratings r ON r.trip_id=t.trip_id GROUP BY d.driver_id ORDER BY d.driver_id;`,
    techniques: ['rated_by'], patterns: ['fanout_guard'],
  },
  // Level 3
  {
    id: 'P030', v: 1, title: 'Above-average active products', dataset: 'shop', difficulty: 'Easy', topics: ['s_subquery'],
    skills: 'Scalar subquery', domain: 'E-commerce', timeTarget: 6,
    prompt: 'Among ACTIVE products, list those priced above the average price of active products.\n\nSort by price, highest first.',
    output: ['name', 'price'], orderMatters: true,
    solution: `SELECT name, price
FROM products
WHERE is_active
  AND price > (SELECT AVG(price) FROM products WHERE is_active)
ORDER BY price DESC;`,
    tests: [
      { name: 'Expensive inactive product', category: 'Logic', why: 'The benchmark must be computed on the same population.',
        patch: `INSERT INTO products VALUES (109,'Treadmill','Fitness',45000,false),(110,'Kettlebell','Fitness',1700,true);` },
    ],
    hints: ['You need one number (an average) to compare every row against.', 'A subquery that returns a single value can sit on the right of >.', 'WHERE is_active AND price > (SELECT AVG(price) FROM products WHERE is_active)'],
    explain: 'Both the filter and the benchmark must use the same population (active products).',
    trap: `SELECT name, price FROM products WHERE is_active AND price > (SELECT AVG(price) FROM products) ORDER BY price DESC;`,
    techniques: ['\\(\\s*select\\s+avg|over\\s*\\('], patterns: [],
  },
  {
    id: 'P031', v: 1, title: 'Above department average', dataset: 'hr', difficulty: 'Medium', topics: ['s_correlated'],
    skills: 'Correlated subquery / group comparison', domain: 'HR', diagnostic: true, timeTarget: 9,
    prompt: 'List employees who earn more than the average salary of their own department, with the department name and that average (2 decimals). Employees without a department are excluded.\n\nSort by department name, then salary (highest first).',
    output: ['name', 'dept_name', 'salary', 'dept_avg'], orderMatters: true,
    solution: `WITH dept_avg AS (
  SELECT dept_id, AVG(salary) AS avg_salary FROM employees WHERE dept_id IS NOT NULL GROUP BY dept_id
)
SELECT e.name, d.dept_name, e.salary, ROUND(a.avg_salary, 2) AS dept_avg
FROM employees e
JOIN dept_avg a    ON a.dept_id = e.dept_id
JOIN departments d ON d.dept_id = e.dept_id
WHERE e.salary > a.avg_salary
ORDER BY d.dept_name, e.salary DESC;`,
    tests: [
      { name: 'Small high-paying department', category: 'Logic', why: 'Each employee is compared with their own department, not the company.',
        patch: `INSERT INTO employees VALUES (17,'Advik',5,1,'General Counsel',260000,'2022-01-01'),(18,'Mira',5,17,'Counsel',240000,'2023-01-01');` },
    ],
    hints: ['The benchmark changes depending on which department the row belongs to.', 'Either a subquery that references the outer row\'s department, or pre-compute department averages and join.', 'WHERE e.salary > (SELECT AVG(salary) FROM employees x WHERE x.dept_id = e.dept_id)'],
    explain: 'Pre-aggregating to department grain and joining back is equivalent to a correlated subquery and lets you also output the average.',
    trap: `SELECT e.name, d.dept_name, e.salary, ROUND((SELECT AVG(salary) FROM employees),2) AS dept_avg FROM employees e JOIN departments d ON d.dept_id=e.dept_id WHERE e.salary > (SELECT AVG(salary) FROM employees) ORDER BY d.dept_name, e.salary DESC;`,
    techniques: ['avg'], patterns: [],
  },
  {
    id: 'P032', v: 1, title: 'Gadget buyers who skip groceries', dataset: 'shop', difficulty: 'Medium', topics: ['s_exists'],
    skills: 'EXISTS + NOT EXISTS', domain: 'E-commerce', timeTarget: 10,
    prompt: 'Cross-sell team: find customers who bought at least one Electronics product in a completed order, but have never bought a Grocery product in a completed order.\n\nSort by customer_id.',
    output: ['customer_id', 'name'], orderMatters: true,
    solution: `SELECT c.customer_id, c.name
FROM customers c
WHERE EXISTS (
  SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id
  WHERE o.customer_id = c.customer_id AND o.status = 'completed' AND p.category = 'Electronics')
AND NOT EXISTS (
  SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id
  WHERE o.customer_id = c.customer_id AND o.status = 'completed' AND p.category = 'Grocery')
ORDER BY c.customer_id;`,
    tests: [
      { name: 'Grocery only in a cancelled order', category: 'Business logic', why: 'A cancelled grocery order is not a grocery purchase.',
        patch: `INSERT INTO orders VALUES (1018,5,'2026-04-20','cancelled',NULL); INSERT INTO order_items VALUES (1018,106,1,899);` },
    ],
    hints: ['Two conditions about the existence (and non-existence) of purchases.', 'Use EXISTS for "at least one" and NOT EXISTS for "never"; both subqueries need the completed filter.', 'WHERE EXISTS (… category = \'Electronics\') AND NOT EXISTS (… category = \'Grocery\')'],
    explain: 'EXISTS/NOT EXISTS answer yes/no questions per customer without multiplying rows.',
    trap: `SELECT c.customer_id, c.name FROM customers c WHERE EXISTS (SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id=o.order_id JOIN products p ON p.product_id=oi.product_id WHERE o.customer_id=c.customer_id AND o.status='completed' AND p.category='Electronics') AND NOT EXISTS (SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id=o.order_id JOIN products p ON p.product_id=oi.product_id WHERE o.customer_id=c.customer_id AND p.category='Grocery') ORDER BY c.customer_id;`,
    techniques: ['exists'], patterns: ['anti_join'],
  },
  {
    id: 'P033', v: 1, title: 'Drivers never dispatched', dataset: 'rides', difficulty: 'Medium', topics: ['s_exists', 'f_null'],
    skills: 'NOT IN vs NOT EXISTS with NULLs', domain: 'Ride-sharing', diagnostic: true, timeTarget: 7,
    prompt: 'Supply ops wants drivers who have never been assigned to any trip request (regardless of trip status).\n\nSort by driver_id.',
    output: ['driver_id', 'name'], orderMatters: true,
    solution: `SELECT d.driver_id, d.name
FROM drivers d
WHERE NOT EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = d.driver_id)
ORDER BY d.driver_id;`,
    tests: [
      { name: 'Another idle driver', category: 'NULL handling', why: 'Unassigned trips have NULL driver_id.',
        patch: `INSERT INTO drivers VALUES (17,'Selvi','Chennai','2026-02-01','auto');` },
    ],
    hints: ['Look closely at the trips table: are there trips with no driver?', 'x NOT IN (… NULL …) is never TRUE. Use a NULL-safe anti-join.', 'WHERE NOT EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = d.driver_id)'],
    explain: 'Because trips.driver_id contains NULLs, NOT IN returns no rows at all. NOT EXISTS is NULL-safe.',
    trap: `SELECT driver_id, name FROM drivers WHERE driver_id NOT IN (SELECT driver_id FROM trips) ORDER BY driver_id;`,
    mistakes: [{ re: 'not\\s+in\\s*\\(\\s*select(?![\\s\\S]*is\\s+not\\s+null)', cat: 'NULL handling', msg: 'NOT IN against a subquery that can return NULL', concept: 'If the NOT IN list contains NULL, the predicate is never TRUE. Use NOT EXISTS or filter NULLs out.' }],
    techniques: ['not\\s+exists|left\\s+join[\\s\\S]*is\\s+null|is\\s+not\\s+null'], patterns: ['anti_join'],
  },
  {
    id: 'P034', v: 1, title: 'Where we operate', dataset: 'rides', difficulty: 'Easy', topics: ['s_setops'],
    skills: 'UNION vs UNION ALL', domain: 'Ride-sharing', timeTarget: 5,
    prompt: 'List every city where the company has either a rider\'s home city or a driver\'s registered city — each city once, ignoring missing cities.\n\nSort alphabetically.',
    output: ['city'], orderMatters: true,
    solution: `SELECT home_city AS city FROM riders WHERE home_city IS NOT NULL
UNION
SELECT city FROM drivers WHERE city IS NOT NULL
ORDER BY city;`,
    tests: [
      { name: 'Cities on only one side, plus a missing city', category: 'Edge cases', why: 'Each source can add cities; NULL is not a city.',
        patch: `INSERT INTO riders VALUES (8,'Hema','2026-02-10','Pune'),(9,'Nobody','2026-02-11',NULL); INSERT INTO drivers VALUES (17,'Selvi','Chennai','2026-02-01','auto');` },
    ],
    hints: ['Two lists of the same kind of value need to be combined.', 'One set operator removes duplicates, the other keeps them.', 'SELECT home_city … UNION SELECT city … with IS NOT NULL filters'],
    explain: 'UNION de-duplicates across both inputs. UNION ALL would repeat each shared city.',
    trap: `SELECT home_city AS city FROM riders UNION ALL SELECT city FROM drivers ORDER BY city;`,
    techniques: ['union(?!\\s+all)'], patterns: [],
  },
];

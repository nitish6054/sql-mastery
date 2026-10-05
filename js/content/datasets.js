// Datasets used by problems. Each problem runs against a fresh copy of its dataset
// (plus an optional patch for hidden test cases), so nothing a learner runs can break them.
// Data is intentionally messy: NULLs, duplicates, ties, users with no activity, boundary dates.

export const DATASETS = {
  shop: {
    name: 'E-commerce (shop)',
    description: 'Customers, products, orders, order line items and payment attempts for an online store.',
    tables: [
      { name: 'customers', grain: 'one row per customer', columns: [
        ['customer_id', 'int', 'PK'], ['name', 'text', ''], ['email', 'text', 'nullable'], ['city', 'text', 'nullable'],
        ['signup_date', 'date', ''], ['referred_by', 'int', 'FK → customers.customer_id, nullable']] },
      { name: 'products', grain: 'one row per product', columns: [
        ['product_id', 'int', 'PK'], ['name', 'text', ''], ['category', 'text', ''], ['price', 'numeric(10,2)', 'current list price'], ['is_active', 'boolean', '']] },
      { name: 'orders', grain: 'one row per order', columns: [
        ['order_id', 'int', 'PK'], ['customer_id', 'int', 'FK → customers'], ['order_date', 'date', ''],
        ['status', 'text', "'completed' | 'cancelled' | 'returned' | 'pending'"], ['coupon_code', 'text', 'nullable']] },
      { name: 'order_items', grain: 'one row per product within an order', columns: [
        ['order_id', 'int', 'FK → orders'], ['product_id', 'int', 'FK → products'], ['quantity', 'int', ''], ['unit_price', 'numeric(10,2)', 'price actually charged per unit']] },
      { name: 'payments', grain: 'one row per payment ATTEMPT (an order can have several, including failures)', columns: [
        ['payment_id', 'int', 'PK'], ['order_id', 'int', 'FK → orders'], ['method', 'text', "'card' | 'upi' | 'cod'"],
        ['amount', 'numeric(10,2)', ''], ['paid_at', 'timestamp', ''], ['status', 'text', "'success' | 'failed'"]] },
    ],
    setup: `
CREATE TABLE customers (customer_id int PRIMARY KEY, name text NOT NULL, email text, city text, signup_date date NOT NULL, referred_by int REFERENCES customers(customer_id));
INSERT INTO customers VALUES
 (1,'Aarav Mehta','aarav@mail.com','Mumbai','2025-11-03',NULL),
 (2,'Diya Sharma','diya@mail.com','Delhi','2025-11-20',1),
 (3,'Kabir Rao','kabir@mail.com','Bengaluru','2025-12-05',NULL),
 (4,'Meera Iyer','meera@mail.com','Bengaluru','2026-01-08',3),
 (5,'Rohan Gupta',NULL,'Delhi','2026-01-15',1),
 (6,'Sara Khan','sara@mail.com',NULL,'2026-01-22',NULL),
 (7,'Vikram Singh','vikram@mail.com','Mumbai','2026-02-02',2),
 (8,'Ananya Das','ananya@mail.com','Kolkata','2026-02-14',NULL),
 (9,'Ishaan Nair','ishaan@mail.com','Bengaluru','2026-03-01',4),
 (10,'Neha Joshi','neha@mail.com','Pune','2026-03-10',NULL);
CREATE TABLE products (product_id int PRIMARY KEY, name text NOT NULL, category text NOT NULL, price numeric(10,2) NOT NULL, is_active boolean NOT NULL);
INSERT INTO products VALUES
 (101,'Wireless Mouse','Electronics',799,true),(102,'Mechanical Keyboard','Electronics',3499,true),
 (103,'USB-C Hub','Electronics',1999,true),(104,'Yoga Mat','Fitness',1199,true),
 (105,'Dumbbell Set','Fitness',2999,true),(106,'Coffee Beans 1kg','Grocery',899,true),
 (107,'Green Tea 100 bags','Grocery',349,true),(108,'Desk Lamp','Home',1499,false);
CREATE TABLE orders (order_id int PRIMARY KEY, customer_id int NOT NULL REFERENCES customers(customer_id), order_date date NOT NULL, status text NOT NULL, coupon_code text);
INSERT INTO orders VALUES
 (1001,1,'2026-01-05','completed',NULL),(1002,2,'2026-01-07','completed','NEW10'),
 (1003,1,'2026-01-19','completed',NULL),(1004,3,'2026-01-25','cancelled',NULL),
 (1005,4,'2026-02-01','completed','NEW10'),(1006,2,'2026-02-03','returned',NULL),
 (1007,5,'2026-02-10','completed',NULL),(1008,1,'2026-02-14','completed','LOVE14'),
 (1009,3,'2026-02-20','completed',NULL),(1010,6,'2026-02-28','pending',NULL),
 (1011,7,'2026-03-03','completed','NEW10'),(1012,4,'2026-03-05','completed',NULL),
 (1013,2,'2026-03-15','completed',NULL),(1014,8,'2026-03-22','cancelled',NULL),
 (1015,9,'2026-03-31','completed',NULL),(1016,1,'2026-04-02','completed',NULL),
 (1017,7,'2026-04-10','completed',NULL);
CREATE TABLE order_items (order_id int REFERENCES orders(order_id), product_id int REFERENCES products(product_id), quantity int NOT NULL, unit_price numeric(10,2) NOT NULL, PRIMARY KEY (order_id, product_id));
INSERT INTO order_items VALUES
 (1001,101,1,799),(1001,106,2,899),(1002,102,1,3499),(1003,107,3,349),(1003,106,1,899),
 (1004,105,1,2999),(1005,104,1,1199),(1005,107,2,349),(1006,103,1,1999),
 (1007,101,2,799),(1007,103,1,1999),(1008,102,1,3299),(1008,101,1,799),
 (1009,106,4,899),(1010,104,2,1199),(1011,105,1,2999),(1011,104,1,1199),
 (1012,107,5,349),(1013,103,1,1999),(1013,106,1,899),(1014,102,1,3499),
 (1015,101,1,799),(1016,106,2,899),(1016,107,2,349),(1017,102,1,3499),(1017,103,1,1999);
CREATE TABLE payments (payment_id int PRIMARY KEY, order_id int REFERENCES orders(order_id), method text NOT NULL, amount numeric(10,2) NOT NULL, paid_at timestamp NOT NULL, status text NOT NULL);
INSERT INTO payments VALUES
 (1,1001,'card',2597.00,'2026-01-05 10:12','success'),(2,1002,'upi',3149.10,'2026-01-07 18:40','success'),
 (3,1003,'card',1946.00,'2026-01-19 09:05','failed'),(4,1003,'card',1946.00,'2026-01-19 09:07','success'),
 (5,1005,'upi',1707.30,'2026-02-01 16:20','success'),(6,1006,'card',1999.00,'2026-02-03 13:00','success'),
 (7,1007,'cod',3597.00,'2026-02-12 17:30','success'),(8,1008,'card',4098.00,'2026-02-14 21:15','success'),
 (9,1009,'upi',3596.00,'2026-02-20 11:11','failed'),(10,1009,'upi',3596.00,'2026-02-20 11:13','failed'),
 (11,1009,'card',3596.00,'2026-02-20 11:20','success'),(12,1011,'upi',3778.20,'2026-03-03 15:45','success'),
 (13,1012,'card',1745.00,'2026-03-05 08:30','success'),(14,1013,'upi',2898.00,'2026-03-15 19:00','success'),
 (15,1015,'card',799.00,'2026-03-31 23:58','success'),(16,1016,'upi',2496.00,'2026-04-02 12:00','success'),
 (17,1017,'card',5498.00,'2026-04-10 10:10','success');
`,
  },

  food: {
    name: 'Food delivery (food)',
    description: 'Restaurants and delivery orders for a food-delivery app. Cancelled orders have no delivery time.',
    tables: [
      { name: 'restaurants', grain: 'one row per restaurant', columns: [['restaurant_id', 'int', 'PK'], ['name', 'text', ''], ['cuisine', 'text', ''], ['city', 'text', ''],
        ['rating', 'numeric(2,1)', 'NULL for new, unrated restaurants'], ['is_veg_only', 'boolean', ''], ['opened_on', 'date', '']] },
      { name: 'deliveries', grain: 'one row per order placed', columns: [['delivery_id', 'int', 'PK'], ['restaurant_id', 'int', 'FK → restaurants'], ['customer_id', 'int', ''],
        ['ordered_at', 'timestamp', ''], ['delivered_at', 'timestamp', 'NULL if cancelled'], ['status', 'text', "'delivered' | 'cancelled'"],
        ['order_value', 'numeric(10,2)', 'food value'], ['delivery_fee', 'numeric(10,2)', ''], ['tip', 'numeric(10,2)', 'NULL = no tip recorded'], ['distance_km', 'numeric(5,1)', ''], ['rating', 'int', '1–5, NULL if not rated']] },
    ],
    setup: `
CREATE TABLE restaurants (restaurant_id int PRIMARY KEY, name text NOT NULL, cuisine text NOT NULL, city text NOT NULL, rating numeric(2,1), is_veg_only boolean NOT NULL, opened_on date NOT NULL);
INSERT INTO restaurants VALUES (1,'Meghana Foods','Biryani','Bengaluru',4.5,false,'2015-03-01'),(2,'Vidyarthi Bhavan','South Indian','Bengaluru',4.7,true,'1943-06-01'),
 (3,'Truffles','Burgers','Bengaluru',4.3,false,'2009-08-15'),(4,'Paradise','Biryani','Hyderabad',4.1,false,'1953-01-01'),
 (5,'Chutneys','South Indian','Hyderabad',NULL,true,'2026-02-10'),(6,'Bombay Canteen','Modern Indian','Mumbai',4.6,false,'2015-02-01'),
 (7,'Theobroma','Desserts','Mumbai',4.4,true,'2004-05-01'),(8,'Burger Singh','Burgers','Delhi',3.9,false,'2014-11-11');
CREATE TABLE deliveries (delivery_id int PRIMARY KEY, restaurant_id int NOT NULL REFERENCES restaurants(restaurant_id), customer_id int NOT NULL, ordered_at timestamp NOT NULL,
 delivered_at timestamp, status text NOT NULL, order_value numeric(10,2) NOT NULL, delivery_fee numeric(10,2) NOT NULL, tip numeric(10,2), distance_km numeric(5,1) NOT NULL, rating int);
INSERT INTO deliveries VALUES
 (1,1,101,'2026-03-01 12:10','2026-03-01 12:48','delivered',540,30,20,3.2,5),(2,3,102,'2026-03-01 13:05','2026-03-01 13:40','delivered',420,25,NULL,2.1,4),
 (3,4,103,'2026-03-01 20:15','2026-03-01 21:05','delivered',680,40,50,5.5,5),(4,2,101,'2026-03-02 08:30','2026-03-02 08:55','delivered',160,20,NULL,1.4,5),
 (5,8,104,'2026-03-02 19:40',NULL,'cancelled',350,0,NULL,4.0,NULL),(6,6,105,'2026-03-02 21:00','2026-03-02 21:52','delivered',1250,50,100,6.8,4),
 (7,1,102,'2026-03-03 13:00','2026-03-03 13:55','delivered',610,30,0,3.0,3),(8,7,106,'2026-03-03 16:20','2026-03-03 16:50','delivered',380,25,NULL,2.5,NULL),
 (9,5,103,'2026-03-04 09:10','2026-03-04 09:40','delivered',220,20,10,2.0,4),(10,4,107,'2026-03-04 21:30',NULL,'cancelled',720,0,NULL,7.2,NULL),
 (11,3,101,'2026-03-05 12:45','2026-03-05 13:20','delivered',460,25,20,2.1,5),(12,1,108,'2026-03-05 20:00','2026-03-05 21:10','delivered',890,30,NULL,3.4,2),
 (13,6,105,'2026-03-06 20:30','2026-03-06 21:15','delivered',1100,50,80,6.5,5),(14,2,109,'2026-03-07 08:15','2026-03-07 08:35','delivered',140,20,NULL,1.2,5),
 (15,8,104,'2026-03-07 13:30','2026-03-07 14:05','delivered',330,25,NULL,3.8,3),(16,7,110,'2026-03-07 17:00','2026-03-07 17:25','delivered',520,25,30,1.9,5),
 (17,4,103,'2026-03-08 19:45','2026-03-08 20:40','delivered',700,40,NULL,5.6,4),(18,1,101,'2026-03-08 20:10',NULL,'cancelled',480,0,NULL,3.2,NULL),
 (19,3,111,'2026-03-09 13:10','2026-03-09 13:50','delivered',400,25,15,2.3,4),(20,5,112,'2026-03-09 19:00','2026-03-09 19:30','delivered',260,20,NULL,2.2,NULL);
`,
  },

  rides: {
    name: 'Ride-sharing (rides)',
    description: 'Riders, drivers, trip requests and two-sided ratings for a ride-hailing app.',
    tables: [
      { name: 'riders', grain: 'one row per rider', columns: [['rider_id', 'int', 'PK'], ['name', 'text', ''], ['signup_date', 'date', ''], ['home_city', 'text', 'nullable']] },
      { name: 'drivers', grain: 'one row per driver', columns: [['driver_id', 'int', 'PK'], ['name', 'text', ''], ['city', 'text', 'nullable'], ['joined_date', 'date', ''], ['vehicle_type', 'text', "'sedan' | 'auto' | 'bike'"]] },
      { name: 'trips', grain: 'one row per trip REQUEST', columns: [
        ['trip_id', 'int', 'PK'], ['rider_id', 'int', 'FK → riders'], ['driver_id', 'int', 'FK → drivers, NULL if never assigned'], ['city', 'text', ''],
        ['requested_at', 'timestamp', ''], ['status', 'text', "'completed' | 'cancelled_rider' | 'cancelled_driver'"], ['fare', 'numeric(10,2)', 'NULL unless completed (and occasionally missing)'], ['distance_km', 'numeric(6,1)', 'nullable']] },
      { name: 'ratings', grain: 'one row per trip per rating side', columns: [['trip_id', 'int', 'FK → trips'], ['rated_by', 'text', "'rider' (rider rates driver) | 'driver' (driver rates rider)"], ['stars', 'int', '1–5']] },
    ],
    setup: `
CREATE TABLE riders (rider_id int PRIMARY KEY, name text NOT NULL, signup_date date NOT NULL, home_city text);
INSERT INTO riders VALUES (1,'Ankit','2025-12-01','Bengaluru'),(2,'Priya','2025-12-15','Bengaluru'),(3,'Rahul','2026-01-03','Hyderabad'),
 (4,'Sneha','2026-01-10','Hyderabad'),(5,'Arjun','2026-01-20','Bengaluru'),(6,'Kavya','2026-02-01','Mumbai'),(7,'Dev','2026-02-05','Mumbai');
CREATE TABLE drivers (driver_id int PRIMARY KEY, name text NOT NULL, city text, joined_date date NOT NULL, vehicle_type text NOT NULL);
INSERT INTO drivers VALUES (11,'Suresh','Bengaluru','2025-06-01','sedan'),(12,'Ramesh','Bengaluru','2025-09-15','auto'),
 (13,'Imran','Hyderabad','2025-10-01','sedan'),(14,'Lakshmi','Hyderabad','2026-01-05','bike'),
 (15,'Joseph','Mumbai','2025-08-20','sedan'),(16,'Farhan','Mumbai','2026-02-10','auto');
CREATE TABLE trips (trip_id int PRIMARY KEY, rider_id int NOT NULL REFERENCES riders(rider_id), driver_id int REFERENCES drivers(driver_id), city text NOT NULL,
 requested_at timestamp NOT NULL, status text NOT NULL, fare numeric(10,2), distance_km numeric(6,1));
INSERT INTO trips VALUES
 (501,1,11,'Bengaluru','2026-02-01 08:05','completed',320,12.4),(502,2,12,'Bengaluru','2026-02-01 08:30','completed',110,4.1),
 (503,1,NULL,'Bengaluru','2026-02-01 19:10','cancelled_rider',NULL,NULL),(504,3,13,'Hyderabad','2026-02-01 09:00','completed',450,18.0),
 (505,4,14,'Hyderabad','2026-02-02 10:15','completed',90,5.2),(506,5,11,'Bengaluru','2026-02-02 18:45','cancelled_driver',NULL,NULL),
 (507,1,11,'Bengaluru','2026-02-02 19:00','completed',300,11.9),(508,6,15,'Mumbai','2026-02-03 07:40','completed',510,16.5),
 (509,2,12,'Bengaluru','2026-02-03 08:20','completed',120,4.4),(510,3,13,'Hyderabad','2026-02-03 22:10','completed',620,24.0),
 (511,4,13,'Hyderabad','2026-02-04 09:30','cancelled_rider',NULL,NULL),(512,5,12,'Bengaluru','2026-02-04 13:00','completed',95,3.0),
 (513,1,11,'Bengaluru','2026-02-05 08:00','completed',330,12.6),(514,6,15,'Mumbai','2026-02-05 18:00','completed',480,15.1),
 (515,2,11,'Bengaluru','2026-02-05 21:30','completed',250,9.8),(516,3,14,'Hyderabad','2026-02-06 11:00','completed',85,4.7),
 (517,1,12,'Bengaluru','2026-02-06 08:10','completed',140,5.0),(518,4,13,'Hyderabad','2026-02-07 10:00','completed',400,15.5),
 (519,5,11,'Bengaluru','2026-02-07 19:20','completed',280,10.2),(520,6,NULL,'Mumbai','2026-02-07 23:50','cancelled_driver',NULL,NULL);
CREATE TABLE ratings (trip_id int REFERENCES trips(trip_id), rated_by text NOT NULL, stars int NOT NULL, PRIMARY KEY (trip_id, rated_by));
INSERT INTO ratings VALUES (501,'rider',5),(501,'driver',5),(502,'rider',4),(504,'rider',5),(505,'rider',3),(507,'rider',5),
 (508,'rider',4),(508,'driver',2),(509,'rider',2),(510,'rider',5),(512,'rider',4),(513,'rider',5),(514,'rider',3),
 (515,'rider',4),(516,'rider',5),(518,'rider',4),(519,'rider',5);
`,
  },

  saas: {
    name: 'SaaS product analytics (saas)',
    description: 'Users, product event stream (with JSONB properties), daily activity, page views and paid subscriptions. Data is observed through 2026-04-30.',
    tables: [
      { name: 'users', grain: 'one row per user', columns: [['user_id', 'int', 'PK'], ['signup_date', 'date', ''], ['country', 'text', ''], ['channel', 'text', "acquisition channel: 'organic' | 'paid_search' | 'paid_social' | 'referral'"]] },
      { name: 'events', grain: 'one row per tracked event (duplicates happen)', columns: [['event_id', 'int', 'PK'], ['user_id', 'int', 'FK → users'],
        ['event_name', 'text', "'signup' | 'create_project' | 'invite_teammate' | 'upgrade' | 'login'"], ['event_time', 'timestamp', ''], ['properties', 'jsonb', 'e.g. {"device":"ios"}; keys may be missing']] },
      { name: 'user_activity', grain: 'one row per activity ping — a user can have several on the same date', columns: [['user_id', 'int', 'FK → users'], ['activity_date', 'date', '']] },
      { name: 'page_views', grain: 'one row per page view', columns: [['user_id', 'int', 'FK → users'], ['viewed_at', 'timestamp', ''], ['page', 'text', '']] },
      { name: 'subscriptions', grain: 'one row per subscription period (a plan change starts a new row)', columns: [['sub_id', 'int', 'PK'], ['user_id', 'int', 'FK → users'],
        ['plan', 'text', ''], ['mrr', 'numeric(10,2)', 'monthly recurring revenue'], ['start_date', 'date', ''], ['end_date', 'date', 'last active day; NULL = still active']] },
    ],
    setup: `
CREATE TABLE users (user_id int PRIMARY KEY, signup_date date NOT NULL, country text NOT NULL, channel text NOT NULL);
INSERT INTO users VALUES (1,'2026-01-05','IN','organic'),(2,'2026-01-06','IN','paid_search'),(3,'2026-01-12','US','organic'),
 (4,'2026-01-20','IN','referral'),(5,'2026-01-28','US','paid_social'),(6,'2026-02-02','IN','organic'),(7,'2026-02-09','UK','paid_search'),
 (8,'2026-02-15','IN','referral'),(9,'2026-02-25','US','organic'),(10,'2026-03-03','IN','paid_social'),(11,'2026-03-10','UK','organic'),
 (12,'2026-03-18','IN','paid_search');
CREATE TABLE events (event_id int PRIMARY KEY, user_id int NOT NULL REFERENCES users(user_id), event_name text NOT NULL, event_time timestamp NOT NULL, properties jsonb);
INSERT INTO events VALUES
 (1,1,'signup','2026-01-05 09:00','{"device":"web"}'),(2,1,'create_project','2026-01-05 09:20','{"device":"web","template":"blank"}'),
 (3,1,'invite_teammate','2026-01-07 10:00','{"device":"web"}'),(4,1,'upgrade','2026-01-15 12:00','{"device":"web","plan":"pro"}'),
 (5,1,'login','2026-02-03 08:00','{"device":"ios"}'),(6,1,'login','2026-03-02 08:00','{"device":"ios"}'),
 (7,2,'signup','2026-01-06 14:00','{"device":"android"}'),(8,2,'create_project','2026-01-08 11:00','{"device":"android"}'),
 (9,2,'login','2026-02-10 09:30','{"device":"android"}'),
 (10,3,'signup','2026-01-12 08:00','{"device":"web"}'),(11,3,'create_project','2026-01-12 08:30','{"device":"web","template":"kanban"}'),
 (12,3,'invite_teammate','2026-01-12 09:00','{"device":"web"}'),(13,3,'upgrade','2026-02-01 10:00','{"plan":"pro"}'),
 (14,3,'login','2026-02-14 10:00','{"device":"web"}'),(15,3,'login','2026-03-20 10:00','{"device":"web"}'),(16,3,'login','2026-04-02 10:00','{"device":"ios"}'),
 (17,4,'signup','2026-01-20 19:00','{"device":"ios"}'),
 (18,5,'signup','2026-01-28 07:00','{"device":"web"}'),(19,5,'invite_teammate','2026-01-29 07:30','{"device":"web"}'),
 (20,5,'create_project','2026-01-30 08:00','{"device":"web"}'),(21,5,'login','2026-03-05 12:00','{"device":"web"}'),
 (22,6,'signup','2026-02-02 10:00','{"device":"ios"}'),(23,6,'create_project','2026-02-02 10:05','{}'),
 (24,6,'invite_teammate','2026-02-05 15:00','{"device":"ios"}'),(25,6,'login','2026-03-01 09:00','{"device":"ios"}'),
 (26,7,'signup','2026-02-09 12:00','{"device":"web"}'),(27,7,'create_project','2026-02-12 12:00','{"device":"web"}'),
 (28,7,'upgrade','2026-02-20 12:00','{"device":"web","plan":"pro"}'),(29,7,'login','2026-03-15 12:00','{"device":"web"}'),(30,7,'login','2026-04-10 12:00','{"device":"web"}'),
 (31,8,'signup','2026-02-15 16:00','{"device":"android"}'),(32,8,'create_project','2026-02-15 16:10','{"device":"android"}'),
 (33,8,'create_project','2026-02-15 16:10','{"device":"android"}'),(34,8,'invite_teammate','2026-02-16 09:00','{"device":"android"}'),
 (35,9,'signup','2026-02-25 18:00','{"device":"web"}'),(36,9,'login','2026-03-26 18:00','{"device":"web"}'),
 (37,10,'signup','2026-03-03 09:00','{"device":"ios"}'),(38,10,'create_project','2026-03-04 09:00','{"device":"ios"}'),
 (39,10,'invite_teammate','2026-03-04 09:30','{"device":"ios"}'),(40,10,'upgrade','2026-03-10 09:00','{"device":"ios","plan":"team"}'),
 (41,10,'login','2026-04-05 09:00','{"device":"ios"}'),
 (42,11,'signup','2026-03-10 13:00','{"device":"web"}'),
 (43,12,'signup','2026-03-18 20:00','{"device":"android"}'),(44,12,'create_project','2026-03-19 20:00',NULL),(45,12,'login','2026-04-20 20:00','{"device":"android"}');
CREATE TABLE user_activity (user_id int NOT NULL REFERENCES users(user_id), activity_date date NOT NULL);
INSERT INTO user_activity VALUES
 (1,'2026-03-01'),(1,'2026-03-02'),(1,'2026-03-03'),(1,'2026-03-05'),(1,'2026-03-06'),(1,'2026-03-06'),(1,'2026-03-07'),(1,'2026-03-08'),(1,'2026-03-10'),
 (2,'2026-03-01'),(2,'2026-03-03'),(2,'2026-03-04'),(2,'2026-03-05'),
 (3,'2026-03-02'),
 (4,'2026-03-04'),(4,'2026-03-05'),(4,'2026-03-06'),(4,'2026-03-07'),(4,'2026-03-08');
CREATE TABLE page_views (user_id int NOT NULL REFERENCES users(user_id), viewed_at timestamp NOT NULL, page text NOT NULL);
INSERT INTO page_views VALUES
 (1,'2026-02-10 09:00','/home'),(1,'2026-02-10 09:05','/pricing'),(1,'2026-02-10 09:20','/docs'),(1,'2026-02-10 10:10','/home'),(1,'2026-02-10 10:15','/signup'),
 (1,'2026-02-11 08:00','/home'),(3,'2026-02-10 09:00','/home'),(3,'2026-02-10 09:31','/blog'),(3,'2026-02-10 09:40','/pricing'),
 (5,'2026-02-10 23:50','/home'),(5,'2026-02-11 00:10','/docs');
CREATE TABLE subscriptions (sub_id int PRIMARY KEY, user_id int NOT NULL REFERENCES users(user_id), plan text NOT NULL, mrr numeric(10,2) NOT NULL, start_date date NOT NULL, end_date date);
INSERT INTO subscriptions VALUES (1,1,'pro',30,'2026-01-15',NULL),(2,3,'pro',30,'2026-02-01','2026-03-31'),(3,3,'team',90,'2026-04-01',NULL),
 (4,7,'pro',30,'2026-02-20','2026-03-19'),(5,10,'team',90,'2026-03-10',NULL),(6,5,'pro',25,'2026-03-01','2026-03-31');
`,
  },

  hr: {
    name: 'Company org (hr)',
    description: 'Departments and employees with a manager hierarchy.',
    tables: [
      { name: 'departments', grain: 'one row per department', columns: [['dept_id', 'int', 'PK'], ['dept_name', 'text', ''], ['location', 'text', '']] },
      { name: 'employees', grain: 'one row per employee', columns: [['emp_id', 'int', 'PK'], ['name', 'text', ''], ['dept_id', 'int', 'FK → departments, nullable'],
        ['manager_id', 'int', 'FK → employees.emp_id, NULL for the top'], ['title', 'text', ''], ['salary', 'numeric(10,2)', 'annual'], ['hire_date', 'date', '']] },
    ],
    setup: `
CREATE TABLE departments (dept_id int PRIMARY KEY, dept_name text NOT NULL, location text NOT NULL);
INSERT INTO departments VALUES (1,'Engineering','Bengaluru'),(2,'Product','Bengaluru'),(3,'Sales','Mumbai'),(4,'Finance','Hyderabad'),(5,'Legal','Delhi');
CREATE TABLE employees (emp_id int PRIMARY KEY, name text NOT NULL, dept_id int REFERENCES departments(dept_id), manager_id int REFERENCES employees(emp_id), title text NOT NULL, salary numeric(10,2) NOT NULL, hire_date date NOT NULL);
INSERT INTO employees VALUES
 (1,'Nandini',1,NULL,'CTO',300000,'2019-04-01'),(2,'Arvind',1,1,'Engineering Manager',180000,'2020-06-15'),
 (3,'Pooja',1,2,'Senior Engineer',185000,'2021-01-10'),(4,'Manoj',1,2,'Engineer',110000,'2022-03-01'),
 (5,'Tanvi',1,2,'Engineer',110000,'2023-07-19'),(6,'Harsh',1,2,'Engineer',95000,'2024-02-01'),
 (7,'Ritu',2,1,'Product Lead',170000,'2020-09-01'),(8,'Sameer',2,7,'Product Manager',140000,'2022-05-16'),
 (9,'Gauri',2,7,'Product Manager',140000,'2023-01-09'),(10,'Zoya',2,7,'Associate PM',90000,'2025-01-06'),
 (11,'Kunal',3,1,'Sales Head',160000,'2019-11-11'),(12,'Bhavna',3,11,'Account Executive',85000,'2021-08-23'),
 (13,'Omkar',3,11,'Account Executive',92000,'2024-10-01'),(14,'Leela',4,1,'Finance Manager',150000,'2020-02-03'),
 (15,'Yash',4,14,'Analyst',70000,'2025-06-30'),(16,'Irfan',NULL,1,'Chief of Staff',200000,'2021-03-15');
`,
  },

  bank: {
    name: 'Retail banking (bank)',
    description: 'Accounts and signed transactions (credits positive, debits negative).',
    tables: [
      { name: 'accounts', grain: 'one row per account', columns: [['account_id', 'text', 'PK'], ['customer_name', 'text', ''], ['opened_date', 'date', ''], ['account_type', 'text', "'savings' | 'current'"]] },
      { name: 'transactions', grain: 'one row per posted transaction', columns: [['txn_id', 'int', 'PK'], ['account_id', 'text', 'FK → accounts'], ['txn_time', 'timestamp', ''],
        ['amount', 'numeric(12,2)', 'positive = credit, negative = debit'], ['channel', 'text', "'card' | 'upi' | 'atm' | 'transfer'"], ['merchant', 'text', '']] },
    ],
    setup: `
CREATE TABLE accounts (account_id text PRIMARY KEY, customer_name text NOT NULL, opened_date date NOT NULL, account_type text NOT NULL);
INSERT INTO accounts VALUES ('A1','Rhea','2025-10-01','savings'),('A2','Tarun','2025-11-15','current'),('A3','Mehul','2026-01-05','savings'),('A4','Ira','2026-02-20','savings');
CREATE TABLE transactions (txn_id int PRIMARY KEY, account_id text NOT NULL REFERENCES accounts(account_id), txn_time timestamp NOT NULL, amount numeric(12,2) NOT NULL, channel text NOT NULL, merchant text NOT NULL);
INSERT INTO transactions VALUES
 (1,'A1','2026-01-01 09:00',50000,'transfer','Salary'),(2,'A1','2026-01-02 12:30',-1200,'card','Swiggy'),
 (3,'A1','2026-01-02 12:31',-1200,'card','Swiggy'),(4,'A1','2026-01-05 18:00',-15000,'upi','Rent'),
 (5,'A1','2026-01-10 20:15',-3500,'card','Amazon'),(6,'A1','2026-01-15 07:45',-500,'atm','ATM'),
 (7,'A2','2026-01-03 10:00',120000,'transfer','Client Payment'),(8,'A2','2026-01-03 23:55',-9000,'upi','Vendor'),
 (9,'A2','2026-01-04 00:02',-9000,'upi','Vendor'),(10,'A2','2026-01-04 00:05',-9000,'upi','Vendor'),
 (11,'A2','2026-01-12 14:00',-45000,'transfer','Payroll'),(12,'A3','2026-01-06 11:00',20000,'transfer','Deposit'),
 (13,'A3','2026-01-07 16:20',-800,'card','Uber'),(14,'A3','2026-01-08 16:25',-650,'card','Uber'),
 (15,'A3','2026-01-20 02:13',-18500,'card','ElectroWorld'),(16,'A1','2026-02-01 09:00',50000,'transfer','Salary'),
 (17,'A1','2026-02-03 13:00',-2200,'card','Swiggy'),(18,'A3','2026-02-02 10:00',20000,'transfer','Deposit');
`,
  },

  campus: {
    name: 'University (campus)',
    description: 'Students, courses, instructors and enrolments (a many-to-many link with retakes, withdrawals and in-progress rows). Grades are on a 0–10 scale.',
    tables: [
      { name: 'students', grain: 'one row per student', columns: [['student_id', 'int', 'PK'], ['name', 'text', ''], ['major', 'text', 'NULL = undeclared'], ['joined_on', 'date', '']] },
      { name: 'instructors', grain: 'one row per instructor', columns: [['instructor_id', 'int', 'PK'], ['name', 'text', ''], ['dept', 'text', '']] },
      { name: 'courses', grain: 'one row per course', columns: [['course_id', 'text', 'PK'], ['title', 'text', ''], ['dept', 'text', ''], ['credits', 'int', ''], ['instructor_id', 'int', 'FK → instructors, NULL if not yet assigned']] },
      { name: 'enrollments', grain: 'one row per student per course per term (a retake is a new row)', columns: [['student_id', 'int', 'FK → students'], ['course_id', 'text', 'FK → courses'], ['term', 'text', "'2024F' | '2025S' | '2025F' | '2026S'"],
        ['grade', 'numeric(3,1)', 'NULL unless completed'], ['status', 'text', "'completed' | 'in_progress' | 'withdrawn'"]] },
      { name: 'course_prereqs', grain: 'one row per (course, required prerequisite) pair', columns: [['course_id', 'text', 'FK → courses'], ['prereq_id', 'text', 'FK → courses']] },
      { name: 'grade_bands', grain: 'one row per band; a grade belongs to a band when min_grade <= grade < max_grade', columns: [['band', 'text', ''], ['min_grade', 'numeric(4,1)', 'inclusive'], ['max_grade', 'numeric(4,1)', 'exclusive']] },
    ],
    setup: `
CREATE TABLE students (student_id int PRIMARY KEY, name text NOT NULL, major text, joined_on date NOT NULL);
INSERT INTO students VALUES (1,'Asha','CS','2024-08-01'),(2,'Bilal','CS','2024-08-01'),(3,'Chitra','Math','2024-08-01'),(4,'Dev','Physics','2024-08-01'),
 (5,'Esha',NULL,'2025-08-01'),(6,'Farid','CS','2025-08-01'),(7,'Gita','Math','2024-08-01'),(8,'Hari','CS','2026-01-10');
CREATE TABLE instructors (instructor_id int PRIMARY KEY, name text NOT NULL, dept text NOT NULL);
INSERT INTO instructors VALUES (1,'Dr. Rao','CS'),(2,'Dr. Menon','Math'),(3,'Dr. Iyer','CS'),(4,'Dr. Bose','Physics');
CREATE TABLE courses (course_id text PRIMARY KEY, title text NOT NULL, dept text NOT NULL, credits int NOT NULL, instructor_id int REFERENCES instructors(instructor_id));
INSERT INTO courses VALUES ('C101','Intro to Programming','CS',4,1),('C102','Data Structures','CS',4,1),('C201','Databases','CS',3,3),
 ('C202','Linear Algebra','Math',3,2),('C203','Statistics','Math',3,2),('C301','Machine Learning','CS',4,3),
 ('C302','Quantum Basics','Physics',3,NULL),('C303','Seminar: Ethics','CS',1,1);
CREATE TABLE enrollments (student_id int NOT NULL REFERENCES students(student_id), course_id text NOT NULL REFERENCES courses(course_id), term text NOT NULL, grade numeric(3,1), status text NOT NULL, PRIMARY KEY (student_id, course_id, term));
INSERT INTO enrollments VALUES
 (1,'C101','2024F',9.0,'completed'),(1,'C102','2025S',8.0,'completed'),(1,'C201','2025F',9.5,'completed'),(1,'C301','2026S',NULL,'in_progress'),
 (2,'C101','2024F',6.0,'completed'),(2,'C102','2025S',4.0,'completed'),(2,'C102','2025F',7.0,'completed'),(2,'C202','2025F',NULL,'withdrawn'),
 (3,'C202','2024F',9.0,'completed'),(3,'C203','2025S',8.5,'completed'),(3,'C101','2025F',7.5,'completed'),
 (4,'C202','2024F',7.0,'completed'),(4,'C302','2025S',8.0,'completed'),
 (5,'C101','2025F',NULL,'withdrawn'),(5,'C203','2025F',6.5,'completed'),
 (6,'C101','2025F',8.0,'completed'),(6,'C201','2026S',NULL,'in_progress'),(6,'C203','2026S',NULL,'in_progress'),
 (7,'C202','2025S',9.5,'completed'),(7,'C203','2025S',9.0,'completed'),(7,'C301','2026S',NULL,'in_progress');
CREATE TABLE course_prereqs (course_id text NOT NULL REFERENCES courses(course_id), prereq_id text NOT NULL REFERENCES courses(course_id), PRIMARY KEY (course_id, prereq_id));
INSERT INTO course_prereqs VALUES ('C102','C101'),('C201','C102'),('C301','C201'),('C301','C203'),('C203','C202'),('C302','C202');
CREATE TABLE grade_bands (band text PRIMARY KEY, min_grade numeric(4,1) NOT NULL, max_grade numeric(4,1) NOT NULL);
INSERT INTO grade_bands VALUES ('Fail',0,5),('Pass',5,7.5),('Merit',7.5,9),('Distinction',9,10.5);
`,
  },

  recon: {
    name: 'Payment reconciliation (recon)',
    description: 'A merchant ledger of what we expect to be paid, and the settlement lines the bank actually sent. Settlements can be split, short, orphaned or missing a reference.',
    tables: [
      { name: 'ledger', grain: 'one row per booked order', columns: [['ref', 'text', 'PK, e.g. ORD-1'], ['merchant', 'text', ''], ['amount', 'numeric(10,2)', 'amount we expect to receive'], ['booked_on', 'date', '']] },
      { name: 'settlements', grain: 'one row per settlement line from the bank (an order can be settled in several lines)', columns: [['settlement_id', 'int', 'PK'], ['ref', 'text', 'order reference; NULL if the bank did not supply one'], ['amount', 'numeric(10,2)', ''], ['settled_on', 'date', '']] },
    ],
    setup: `
CREATE TABLE ledger (ref text PRIMARY KEY, merchant text NOT NULL, amount numeric(10,2) NOT NULL, booked_on date NOT NULL);
INSERT INTO ledger VALUES ('ORD-1','Acme',500,'2026-03-01'),('ORD-2','Acme',300,'2026-03-01'),('ORD-3','Bolt',1200,'2026-03-02'),('ORD-4','Bolt',800,'2026-03-02'),
 ('ORD-5','Cato',150,'2026-03-03'),('ORD-6','Cato',640,'2026-03-03'),('ORD-7','Dyna',900,'2026-03-04');
CREATE TABLE settlements (settlement_id int PRIMARY KEY, ref text, amount numeric(10,2) NOT NULL, settled_on date NOT NULL);
INSERT INTO settlements VALUES (1,'ORD-1',500,'2026-03-03'),(2,'ORD-2',100,'2026-03-04'),(3,'ORD-2',200,'2026-03-06'),(4,'ORD-3',1150,'2026-03-05'),
 (5,'ORD-5',150,'2026-03-05'),(6,'ORD-9',75,'2026-03-07'),(7,NULL,60,'2026-03-08'),(8,'ORD-6',640,'2026-03-09');
`,
  },

  billing: {
    name: 'Subscription billing (billing)',
    description: 'Accounts and their subscription periods (a plan change or a gap starts a new row). end_date is the last paid day; NULL = still active. Data is observed through 2026-06-30.',
    tables: [
      { name: 'accounts', grain: 'one row per account', columns: [['account_id', 'int', 'PK'], ['name', 'text', ''], ['signup_date', 'date', ''], ['country', 'text', '']] },
      { name: 'subs', grain: 'one row per subscription period', columns: [['sub_id', 'int', 'PK'], ['account_id', 'int', 'FK → accounts'], ['plan', 'text', "'basic' | 'pro' | 'team'"],
        ['mrr', 'numeric(10,2)', 'monthly recurring revenue'], ['start_date', 'date', ''], ['end_date', 'date', 'last active day; NULL = still active']] },
    ],
    setup: `
CREATE TABLE accounts (account_id int PRIMARY KEY, name text NOT NULL, signup_date date NOT NULL, country text NOT NULL);
INSERT INTO accounts VALUES (1,'Acme','2025-10-05','IN'),(2,'Bolt','2025-10-20','US'),(3,'Cato','2025-11-02','IN'),(4,'Dyna','2025-11-15','UK'),(5,'Echo','2025-12-01','US'),
 (6,'Fox','2025-12-10','IN'),(7,'Gale','2026-01-04','UK'),(8,'Halo','2026-01-18','US'),(9,'Iris','2026-02-03','IN'),(10,'Jade','2026-02-20','US');
CREATE TABLE subs (sub_id int PRIMARY KEY, account_id int NOT NULL REFERENCES accounts(account_id), plan text NOT NULL, mrr numeric(10,2) NOT NULL, start_date date NOT NULL, end_date date);
INSERT INTO subs VALUES (1,1,'basic',20,'2025-10-05','2026-03-31'),(2,1,'pro',50,'2026-04-01',NULL),(3,2,'basic',20,'2025-10-20','2026-01-31'),(4,3,'pro',50,'2025-11-02',NULL),
 (5,4,'basic',20,'2025-11-15','2026-02-28'),(6,4,'basic',20,'2026-05-01',NULL),(7,5,'pro',50,'2025-12-01','2026-04-30'),(8,6,'basic',20,'2025-12-10',NULL),
 (9,7,'team',100,'2026-01-04','2026-02-28'),(10,7,'basic',20,'2026-03-01',NULL),(11,8,'pro',50,'2026-01-18','2026-03-31'),(12,9,'basic',20,'2026-02-03',NULL);
`,
  },

  ads: {
    name: 'Advertising attribution (ads)',
    description: 'Campaigns and a user-level touchpoint log: impressions, clicks and purchases (purchases carry revenue and no campaign). Duplicate click rows happen.',
    tables: [
      { name: 'campaigns', grain: 'one row per campaign', columns: [['campaign_id', 'int', 'PK'], ['name', 'text', ''], ['channel', 'text', ''], ['spend', 'numeric(10,2)', 'total spend']] },
      { name: 'ad_events', grain: 'one row per tracked event (duplicates happen)', columns: [['event_id', 'int', 'PK'], ['user_id', 'int', ''], ['campaign_id', 'int', 'FK → campaigns; NULL for purchases'],
        ['event_type', 'text', "'impression' | 'click' | 'purchase'"], ['event_time', 'timestamp', ''], ['revenue', 'numeric(10,2)', 'only on purchases']] },
    ],
    setup: `
CREATE TABLE campaigns (campaign_id int PRIMARY KEY, name text NOT NULL, channel text NOT NULL, spend numeric(10,2) NOT NULL);
INSERT INTO campaigns VALUES (1,'Search Brand','search',500),(2,'Social Spring','social',300),(3,'Display Retarget','display',200),(4,'Email Promo','email',50);
CREATE TABLE ad_events (event_id int PRIMARY KEY, user_id int NOT NULL, campaign_id int REFERENCES campaigns(campaign_id), event_type text NOT NULL, event_time timestamp NOT NULL, revenue numeric(10,2));
INSERT INTO ad_events VALUES
 (1,1,2,'impression','2026-03-01 09:00',NULL),(2,1,2,'click','2026-03-01 09:05',NULL),(3,1,1,'click','2026-03-03 10:00',NULL),(4,1,NULL,'purchase','2026-03-03 10:30',100),
 (5,2,3,'impression','2026-03-02 11:55',NULL),(6,2,3,'click','2026-03-02 12:00',NULL),(7,2,NULL,'purchase','2026-03-09 12:00',80),
 (8,3,1,'click','2026-03-04 08:00',NULL),(9,3,2,'click','2026-03-04 09:00',NULL),(10,3,NULL,'purchase','2026-03-04 09:30',60),
 (11,4,2,'impression','2026-03-05 10:00',NULL),(12,4,NULL,'purchase','2026-03-06 10:00',40),
 (13,5,4,'click','2026-03-07 07:00',NULL),(14,5,NULL,'purchase','2026-03-07 07:20',30),(15,5,NULL,'purchase','2026-03-20 18:00',50),
 (16,6,1,'click','2026-03-08 11:00',NULL),(17,6,1,'click','2026-03-08 11:00',NULL),(18,6,NULL,'purchase','2026-03-08 11:30',90),
 (19,7,3,'impression','2026-03-09 15:00',NULL),(20,7,3,'click','2026-03-10 10:00',NULL),(21,8,NULL,'purchase','2026-03-11 09:00',20);
`,
  },
};

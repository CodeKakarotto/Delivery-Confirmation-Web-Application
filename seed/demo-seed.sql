-- SYNTHETIC DEMO DATA ONLY. Every name, address and order below is made up for development and testing.
-- Delivery dates are relative to the day the seed is loaded, in US Eastern standard time (UTC-5, close enough
-- for demo data), so the shop's "today" always has deliveries.
-- Some orders deliberately have no zone, product total or stop number, to show how missing values display.

INSERT INTO deliveries
  (order_id, recipient_name, address_line, city, state, postal_code, address_notes, delivery_notes, zone,
   total_products, stop_number, delivery_date, cancelled_at, created_at, updated_at)
VALUES
  ('MF-10482', 'Avery Demo',   '100 Sample Way',        'Lake Ridge',  'VA', '22192', 'Blue door, side entrance',
   'Ring the bell twice. Keep the arrangement upright.', 'A', 3, 1, date('now', '-5 hours'), NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('MF-10483', 'Jordan Example','2200 Placeholder Ct',  'Woodbridge',  'VA', '22191', NULL,
   'Birthday surprise: do not call ahead.', 'A', 1, 2, date('now', '-5 hours'), NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('MF-10484', 'Sam Testcase',  '45 Fictional Blvd, Suite 300', 'Dale City', 'VA', '22193', 'Reception on 3rd floor',
   'Office delivery. Leave with reception if the recipient is in a meeting.', 'B', 2, 3, date('now', '-5 hours'), NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('MF-10485', 'Riley Mockdata','9 Imaginary Ln',       'Occoquan',    'VA', '22125', NULL,
   NULL, NULL, NULL, NULL, date('now', '-5 hours'), NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('FTD-2207731', 'Casey Sample','77 Notreal Rd',       'Lorton',      'VA', '22079', 'Gate code is on the ticket',
   'Sympathy arrangement. Please be discreet.', 'C', 4, 4, date('now', '-5 hours'), NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('MF-10470', 'Morgan Fixture','310 Example Ave',      'Lake Ridge',  'VA', '22192', NULL,
   'Leave on the porch if no answer.', 'A', 2, 5, date('now', '-5 hours', '-1 day'), NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('MF-10471', 'Taylor Stub',   '18 Pretend St',        'Woodbridge',  'VA', '22191', NULL,
   NULL, 'B', 1, 6, date('now', '-5 hours', '-1 day'), NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('MF-10490', 'Quinn Cancelled','5 Nowhere Pl',        'Dale City',   'VA', '22193', NULL,
   'Order cancelled by the customer.', 'B', 1, NULL, date('now', '-5 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now'),
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Products on the demo orders (synthetic). Quantities add up to each order's total_products.
UPDATE deliveries SET products = CASE order_id
  WHEN 'MF-10482'    THEN '[{"name":"Dozen red roses","quantity":1},{"name":"Glass vase","quantity":1},{"name":"Greeting card","quantity":1}]'
  WHEN 'MF-10483'    THEN '[{"name":"Birthday balloon bouquet","quantity":1}]'
  WHEN 'MF-10484'    THEN '[{"name":"Office desk arrangement","quantity":1},{"name":"Box of chocolates","quantity":1}]'
  WHEN 'FTD-2207731' THEN '[{"name":"Sympathy standing spray","quantity":1},{"name":"White lily bouquet","quantity":2},{"name":"Condolence card","quantity":1}]'
  WHEN 'MF-10470'    THEN '[{"name":"Mixed spring bouquet","quantity":1},{"name":"Ceramic pot","quantity":1}]'
  WHEN 'MF-10471'    THEN '[{"name":"Single orchid plant","quantity":1}]'
  WHEN 'MF-10490'    THEN '[{"name":"Sunflower bunch","quantity":1}]'
  ELSE products END;

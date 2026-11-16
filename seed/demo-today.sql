-- SYNTHETIC DEMO DATA ONLY: twelve made-up orders scheduled for "today" in the shop's day (US Eastern standard time,
-- UTC-5, close enough for demo data), so the driver list always has something to confirm.
-- Safe to run every day and more than once: order IDs include the date (e.g. MF-1115-01) and INSERT OR IGNORE skips
-- orders that already exist, so saved confirmations are never touched. Start-App.bat runs it on every start.

INSERT OR IGNORE INTO deliveries
  (order_id, recipient_name, address_line, city, state, postal_code, address_notes, delivery_notes, zone,
   total_products, stop_number, delivery_date, created_at, updated_at)
SELECT 'MF-' || strftime('%m%d', 'now', '-5 hours') || '-' || printf('%02d', v.column1),
       v.column2, v.column3, v.column4, 'VA', v.column5, v.column6, v.column7, v.column8, v.column9, v.column1,
       date('now', '-5 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM (VALUES
    (1,  'Avery Demo',      '100 Sample Way',          'Lake Ridge', '22192', 'Blue door, side entrance', 'Ring the bell twice. Keep the arrangement upright.', 'A', 3),
    (2,  'Jordan Example',  '2200 Placeholder Ct',     'Woodbridge', '22191', NULL,                       'Birthday surprise: do not call ahead.',               'A', 1),
    (3,  'Sam Testcase',    '45 Fictional Blvd, Ste 300', 'Dale City', '22193', 'Reception on 3rd floor',  'Office delivery. Leave with reception if needed.',   'B', 2),
    (4,  'Casey Sample',    '77 Notreal Rd',           'Lorton',     '22079', 'Gate code is on the ticket', 'Sympathy arrangement. Please be discreet.',          'C', 4),
    (5,  'Riley Mockdata',  '9 Imaginary Ln',          'Occoquan',   '22125', NULL,                       NULL,                                                  NULL, NULL),
    (6,  'Morgan Fixture',  '310 Example Ave',         'Lake Ridge', '22192', NULL,                       'Leave on the porch if no answer.',                    'A', 2),
    (7,  'Taylor Stub',     '18 Pretend St',           'Woodbridge', '22191', 'Back door',                NULL,                                                  'B', 1),
    (8,  'Drew Synthetic',  '5 Madeup Ct',             'Dale City',  '22193', NULL,                       'Anniversary flowers: call on arrival.',              'B', 2),
    (9,  'Jamie Placeholder','61 Sample Loop',         'Lorton',     '22079', 'Apt 2B',                   'Buzz apartment 2B.',                                  'C', 1),
    (10, 'Quinn Testdata',  '880 Fakeville Rd',        'Occoquan',   '22125', NULL,                       'Get well soon arrangement for the patient.',         'C', 3),
    (11, 'Robin Example',   '14 Demo Dr',              'Lake Ridge', '22192', NULL,                       NULL,                                                  'A', 1),
    (12, 'Sky Mockup',      '230 Nowhere Blvd',        'Woodbridge', '22191', 'Leasing office',           'Deliver to the leasing office before 5 PM.',         'A', 2)
  ) AS v;

-- Products for today's demo orders (synthetic), also for orders added before products existed. Only fills empty values.
UPDATE deliveries SET products = CASE substr(order_id, -2)
  WHEN '01' THEN '[{"name":"Dozen red roses","quantity":1},{"name":"Glass vase","quantity":1},{"name":"Greeting card","quantity":1}]'
  WHEN '02' THEN '[{"name":"Birthday balloon bouquet","quantity":1}]'
  WHEN '03' THEN '[{"name":"Office desk arrangement","quantity":1},{"name":"Box of chocolates","quantity":1}]'
  WHEN '04' THEN '[{"name":"Sympathy standing spray","quantity":1},{"name":"White lily bouquet","quantity":2},{"name":"Condolence card","quantity":1}]'
  WHEN '06' THEN '[{"name":"Mixed spring bouquet","quantity":1},{"name":"Ceramic pot","quantity":1}]'
  WHEN '07' THEN '[{"name":"Single orchid plant","quantity":1}]'
  WHEN '08' THEN '[{"name":"Anniversary rose box","quantity":1},{"name":"Champagne flutes","quantity":1}]'
  WHEN '09' THEN '[{"name":"Sunflower bunch","quantity":1}]'
  WHEN '10' THEN '[{"name":"Get-well tulip bouquet","quantity":1},{"name":"Teddy bear","quantity":1},{"name":"Mylar balloon","quantity":1}]'
  WHEN '11' THEN '[{"name":"Succulent planter","quantity":1}]'
  WHEN '12' THEN '[{"name":"Lobby centerpiece","quantity":1},{"name":"Thank-you card","quantity":1}]'
  END
 WHERE products IS NULL
   AND order_id GLOB 'MF-[0-9][0-9][0-9][0-9]-[0-9][0-9]'
   AND substr(order_id, -2) <> '05';

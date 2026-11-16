-- SYNTHETIC DEMO DATA ONLY: forty made-up orders a day (about what the shop delivers), for today and the next seven
-- days, Monday to Saturday: the shop is closed on Sundays. Days are the shop's day (US Eastern standard time, UTC-5,
-- close enough for demo data). The driver list always has something to confirm and the calendars show the week ahead.
-- Safe to run every day and more than once: order IDs include the date (e.g. MF-1116-01) and INSERT OR IGNORE skips
-- orders that already exist, so saved confirmations are never touched. Start-App.bat runs it on every start.
-- Recipients and addresses rotate by the date itself, so the result is the same whichever day the script ran.
-- Stop 12 deliberately has no zone and no product list, to show how the app handles incomplete order data.

-- The shop is closed on Sundays: remove upcoming Sunday demo orders added by older versions of this script
-- (only ones that have no confirmation).
DELETE FROM deliveries
 WHERE order_id GLOB 'MF-[0-9][0-9][0-9][0-9]-[0-9][0-9]'
   AND strftime('%w', delivery_date) = '0'
   AND delivery_date >= date('now', '-5 hours')
   AND NOT EXISTS (SELECT 1 FROM delivery_confirmations c WHERE c.delivery_id = deliveries.id);

INSERT OR IGNORE INTO deliveries
  (order_id, recipient_name, address_line, city, state, postal_code, address_notes, delivery_notes, zone,
   total_products, products, stop_number, delivery_date, created_at, updated_at)
WITH RECURSIVE
  days(n, day) AS (
    SELECT 0, date('now', '-5 hours')
    UNION ALL
    SELECT n + 1, date('now', '-5 hours', '+' || (n + 1) || ' days') FROM days WHERE n < 7
  ),
  open_days(day, k) AS (
    SELECT day, CAST(julianday(day) AS INTEGER) FROM days WHERE strftime('%w', day) <> '0'
  ),
  stops(stop) AS (SELECT 1 UNION ALL SELECT stop + 1 FROM stops WHERE stop < 40),
  names(i, name) AS (
    VALUES
    (0, 'Avery Demo'), (1, 'Jordan Example'), (2, 'Sam Testcase'), (3, 'Casey Sample'), (4, 'Riley Mockdata'),
    (5, 'Morgan Fixture'), (6, 'Taylor Stub'), (7, 'Drew Synthetic'), (8, 'Jamie Placeholder'), (9, 'Quinn Testdata'),
    (10, 'Robin Example'), (11, 'Sky Mockup'), (12, 'Parker Sample'), (13, 'Reese Demo'), (14, 'Emerson Stub'),
    (15, 'Rowan Fixture'), (16, 'Hayden Testcase'), (17, 'Finley Mockdata'), (18, 'Sage Placeholder'), (19, 'Blake Example'),
    (20, 'Dakota Synthetic'), (21, 'Kendall Testdata'), (22, 'Logan Mockup'), (23, 'Peyton Demo'), (24, 'Cameron Sample'),
    (25, 'Harper Fixture'), (26, 'Elliot Stub'), (27, 'Remy Example'), (28, 'Shawn Testcase'), (29, 'Ari Placeholder'),
    (30, 'Lane Mockdata'), (31, 'Jules Synthetic'), (32, 'Marlowe Demo'), (33, 'Indy Testdata'), (34, 'Tatum Sample'),
    (35, 'Charlie Mockup'), (36, 'Noel Fixture'), (37, 'Wren Example'), (38, 'Kai Stub'), (39, 'Ellis Testcase')
  ),
  template(t, street, city, postal, address_notes, delivery_notes, zone, total, products) AS (
    VALUES
    (1,  'Sample Way',              'Lake Ridge', '22192', 'Blue door, side entrance',   'Ring the bell twice. Keep the arrangement upright.', 'A', 3,
         '[{"name":"Dozen red roses","quantity":1},{"name":"Glass vase","quantity":1},{"name":"Greeting card","quantity":1}]'),
    (2,  'Placeholder Ct',          'Woodbridge', '22191', NULL,                         'Birthday surprise: do not call ahead.',               'A', 1,
         '[{"name":"Birthday balloon bouquet","quantity":1}]'),
    (3,  'Fictional Blvd, Ste 300', 'Dale City',  '22193', 'Reception on 3rd floor',     'Office delivery. Leave with reception if needed.',   'B', 2,
         '[{"name":"Office desk arrangement","quantity":1},{"name":"Box of chocolates","quantity":1}]'),
    (4,  'Notreal Rd',              'Lorton',     '22079', 'Gate code is on the ticket', 'Sympathy arrangement. Please be discreet.',          'C', 4,
         '[{"name":"Sympathy standing spray","quantity":1},{"name":"White lily bouquet","quantity":2},{"name":"Condolence card","quantity":1}]'),
    (5,  'Imaginary Ln',            'Occoquan',   '22125', NULL,                         NULL,                                                  'C', 1,
         '[{"name":"Fruit and flower basket","quantity":1}]'),
    (6,  'Example Ave',             'Lake Ridge', '22192', NULL,                         'Leave on the porch if no answer.',                    'A', 2,
         '[{"name":"Mixed spring bouquet","quantity":1},{"name":"Ceramic pot","quantity":1}]'),
    (7,  'Pretend St',              'Woodbridge', '22191', 'Back door',                  NULL,                                                  'B', 1,
         '[{"name":"Single orchid plant","quantity":1}]'),
    (8,  'Madeup Ct',               'Dale City',  '22193', NULL,                         'Anniversary flowers: call on arrival.',              'B', 2,
         '[{"name":"Anniversary rose box","quantity":1},{"name":"Champagne flutes","quantity":1}]'),
    (9,  'Sample Loop, Apt 2B',     'Lorton',     '22079', 'Apt 2B',                     'Buzz apartment 2B.',                                  'C', 1,
         '[{"name":"Sunflower bunch","quantity":1}]'),
    (10, 'Fakeville Rd',            'Occoquan',   '22125', NULL,                         'Get well soon arrangement for the patient.',         'C', 3,
         '[{"name":"Get-well tulip bouquet","quantity":1},{"name":"Teddy bear","quantity":1},{"name":"Mylar balloon","quantity":1}]'),
    (11, 'Demo Dr',                 'Lake Ridge', '22192', NULL,                         NULL,                                                  'A', 1,
         '[{"name":"Succulent planter","quantity":1}]'),
    (12, 'Nowhere Blvd',            'Woodbridge', '22191', 'Leasing office',             'Deliver to the leasing office before 5 PM.',         'A', 2,
         '[{"name":"Lobby centerpiece","quantity":1},{"name":"Thank-you card","quantity":1}]')
  )
SELECT 'MF-' || strftime('%m%d', d.day) || '-' || printf('%02d', s.stop),
       n.name,
       (10 + ((s.stop * 37 + d.k * 11) % 890)) || ' ' || t.street,
       t.city, 'VA', t.postal, t.address_notes, t.delivery_notes,
       CASE WHEN s.stop = 12 THEN NULL ELSE t.zone END,
       CASE WHEN s.stop = 12 THEN NULL ELSE t.total END,
       CASE WHEN s.stop = 12 THEN NULL ELSE t.products END,
       s.stop, d.day,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM open_days d
  CROSS JOIN stops s
  JOIN names n ON n.i = (s.stop - 1 + d.k) % 40
  JOIN template t ON t.t = ((s.stop - 1 + d.k) % 12) + 1;

-- 0003: delivery exceptions take no customer signature, and orders list their products.
--
-- 1. deliveries.products: the order's products as a JSON array of {"name": "...", "quantity": n}. NULL = not recorded.
-- 2. delivery_confirmations.signature_png becomes optional: a delivery exception (left at the door, with the front desk,
--    with a neighbor, other) records an exception note and who received it, and no signature. A hand-off to the
--    recipient still requires the signature (enforced below and by the Worker).
--    SQLite cannot drop NOT NULL in place, so the table is rebuilt and EVERY row copied unchanged. The refused-attempt
--    table that points at it is copied aside first and restored afterwards, so no row is lost.

ALTER TABLE deliveries ADD COLUMN products TEXT
  CHECK (products IS NULL OR (json_valid(products) AND json_type(products) = 'array' AND length(products) <= 4000));

-- Keep the refused attempts while the table they point to is rebuilt.
CREATE TABLE confirmation_attempts_copy AS SELECT id, confirmation_id, kind, received_by, outcome, created_at FROM confirmation_attempts;
DROP TABLE confirmation_attempts;

CREATE TABLE delivery_confirmations_new (
  id                   TEXT    PRIMARY KEY CHECK (length(id) = 36),
  delivery_id          INTEGER NOT NULL UNIQUE REFERENCES deliveries(id) ON DELETE RESTRICT,
  order_id             TEXT    NOT NULL COLLATE NOCASE,
  stop_number          INTEGER,
  zone                 TEXT,
  received_by          TEXT    NOT NULL CHECK (length(received_by) BETWEEN 1 AND 100),
  outcome              TEXT    NOT NULL CHECK (outcome IN (
                         'delivered_to_recipient', 'left_at_door', 'left_with_front_desk', 'left_with_neighbor', 'other')),
  outcome_detail       TEXT    CHECK (outcome_detail IS NULL OR length(outcome_detail) BETWEEN 1 AND 300),
  note                 TEXT    CHECK (note IS NULL OR length(note) BETWEEN 1 AND 500),
  -- NULL for delivery exceptions (no signature is taken).
  signature_png        BLOB    CHECK (signature_png IS NULL OR length(signature_png) BETWEEN 67 AND 204800),
  signature_width      INTEGER CHECK (signature_width IS NULL OR signature_width BETWEEN 100 AND 2400),
  signature_height     INTEGER CHECK (signature_height IS NULL OR signature_height BETWEEN 50 AND 1200),
  result               TEXT    NOT NULL CHECK (result IN ('confirmed', 'needs_review')),
  idempotency_key      TEXT    NOT NULL UNIQUE CHECK (length(idempotency_key) = 36),
  request_hash         TEXT    NOT NULL CHECK (length(request_hash) = 64),
  confirmed_at         TEXT    NOT NULL,
  confirmed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CHECK (outcome <> 'other' OR outcome_detail IS NOT NULL),
  CHECK ((outcome = 'delivered_to_recipient') = (result = 'confirmed')),
  -- A hand-off to the recipient always has the customer's signature.
  CHECK (outcome <> 'delivered_to_recipient' OR signature_png IS NOT NULL),
  -- The image and its size are stored together or not at all.
  CHECK ((signature_png IS NULL) = (signature_width IS NULL) AND (signature_png IS NULL) = (signature_height IS NULL))
);

INSERT INTO delivery_confirmations_new
  (id, delivery_id, order_id, stop_number, zone, received_by, outcome, outcome_detail, note, signature_png,
   signature_width, signature_height, result, idempotency_key, request_hash, confirmed_at, confirmed_by_user_id)
SELECT id, delivery_id, order_id, stop_number, zone, received_by, outcome, outcome_detail, note, signature_png,
       signature_width, signature_height, result, idempotency_key, request_hash, confirmed_at, confirmed_by_user_id
  FROM delivery_confirmations;

DROP TABLE delivery_confirmations;
ALTER TABLE delivery_confirmations_new RENAME TO delivery_confirmations;
CREATE INDEX idx_confirmations_confirmed_at ON delivery_confirmations(confirmed_at);
CREATE INDEX idx_confirmations_by_user ON delivery_confirmations(confirmed_by_user_id, confirmed_at);

-- Restore the refused attempts, exactly as before.
CREATE TABLE confirmation_attempts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  confirmation_id  TEXT    NOT NULL REFERENCES delivery_confirmations(id) ON DELETE CASCADE,
  kind             TEXT    NOT NULL CHECK (kind IN ('duplicate', 'conflict')),
  received_by      TEXT    CHECK (received_by IS NULL OR length(received_by) <= 100),
  outcome          TEXT    CHECK (outcome IS NULL OR outcome IN (
                     'delivered_to_recipient', 'left_at_door', 'left_with_front_desk', 'left_with_neighbor', 'other')),
  created_at       TEXT    NOT NULL
);
INSERT INTO confirmation_attempts (id, confirmation_id, kind, received_by, outcome, created_at)
  SELECT id, confirmation_id, kind, received_by, outcome, created_at FROM confirmation_attempts_copy;
DROP TABLE confirmation_attempts_copy;
CREATE INDEX idx_confirmation_attempts_confirmation ON confirmation_attempts(confirmation_id, created_at);

-- 0004: corrections, voiding and paper-slip entries.
--
-- * Employees can CORRECT a confirmation (received-by name, outcome, exception note) or VOID it (e.g. saved against
--   the wrong order). A written reason is required; every change is kept in confirmation_corrections with the old and
--   new values, so the original stays visible. The signature is never changed.
-- * A voided confirmation no longer counts: its order goes back to "awaiting" and can be confirmed again. So "one
--   confirmation per order" becomes "one ACTIVE (not voided) confirmation per order" (a partial unique index).
-- * PAPER entries: when the app could not be used, an employee types in the paper slip later. They are marked
--   source = 'paper', with the time written on the slip, where the paper is filed, and optionally a photo of it.
--
-- SQLite cannot change these constraints in place, so delivery_confirmations is rebuilt and EVERY row copied
-- unchanged (existing rows become source 'app', not voided). The refused-attempts table is copied aside and restored.

CREATE TABLE confirmation_attempts_copy AS SELECT id, confirmation_id, kind, received_by, outcome, created_at FROM confirmation_attempts;
DROP TABLE confirmation_attempts;

CREATE TABLE delivery_confirmations_new (
  id                    TEXT    PRIMARY KEY CHECK (length(id) = 36),
  -- Not UNIQUE any more: see ux_confirmations_active_delivery below (one active confirmation per order).
  delivery_id           INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
  order_id              TEXT    NOT NULL COLLATE NOCASE,
  stop_number           INTEGER,
  zone                  TEXT,
  received_by           TEXT    NOT NULL CHECK (length(received_by) BETWEEN 1 AND 100),
  outcome               TEXT    NOT NULL CHECK (outcome IN (
                          'delivered_to_recipient', 'left_at_door', 'left_with_front_desk', 'left_with_neighbor', 'other')),
  outcome_detail        TEXT    CHECK (outcome_detail IS NULL OR length(outcome_detail) BETWEEN 1 AND 300),
  note                  TEXT    CHECK (note IS NULL OR length(note) BETWEEN 1 AND 500),
  signature_png         BLOB    CHECK (signature_png IS NULL OR length(signature_png) BETWEEN 67 AND 204800),
  signature_width       INTEGER CHECK (signature_width IS NULL OR signature_width BETWEEN 100 AND 2400),
  signature_height      INTEGER CHECK (signature_height IS NULL OR signature_height BETWEEN 50 AND 1200),
  result                TEXT    NOT NULL CHECK (result IN ('confirmed', 'needs_review')),
  idempotency_key       TEXT    NOT NULL UNIQUE CHECK (length(idempotency_key) = 36),
  request_hash          TEXT    NOT NULL CHECK (length(request_hash) = 64),
  -- Server time the record was saved (for paper entries: when the employee entered it).
  confirmed_at          TEXT    NOT NULL,
  confirmed_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- 'app' = confirmed by the driver in the app; 'paper' = entered later from a paper slip.
  source                TEXT    NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'paper')),
  -- Paper entries: the employee who typed it in, the delivery time written on the slip, and where the slip is filed.
  entered_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reported_delivered_at TEXT,
  paper_reference       TEXT    CHECK (paper_reference IS NULL OR length(paper_reference) BETWEEN 1 AND 200),
  -- Optional photo of the signed paper slip (JPEG, re-encoded in the browser, which also removes photo metadata).
  slip_photo            BLOB    CHECK (slip_photo IS NULL OR length(slip_photo) BETWEEN 100 AND 614400),
  -- Voided: no longer counts; the reason and who did it are required.
  voided_at             TEXT,
  voided_by_user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  void_reason           TEXT    CHECK (void_reason IS NULL OR length(void_reason) BETWEEN 1 AND 500),
  CHECK (outcome <> 'other' OR outcome_detail IS NOT NULL),
  CHECK ((outcome = 'delivered_to_recipient') = (result = 'confirmed')),
  -- A hand-off to the recipient has the customer's signature, or (paper entries) the signed slip on file.
  CHECK (outcome <> 'delivered_to_recipient' OR signature_png IS NOT NULL OR source = 'paper'),
  CHECK ((signature_png IS NULL) = (signature_width IS NULL) AND (signature_png IS NULL) = (signature_height IS NULL)),
  CHECK (source <> 'paper' OR (paper_reference IS NOT NULL AND reported_delivered_at IS NOT NULL)),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

INSERT INTO delivery_confirmations_new
  (id, delivery_id, order_id, stop_number, zone, received_by, outcome, outcome_detail, note, signature_png,
   signature_width, signature_height, result, idempotency_key, request_hash, confirmed_at, confirmed_by_user_id)
SELECT id, delivery_id, order_id, stop_number, zone, received_by, outcome, outcome_detail, note, signature_png,
       signature_width, signature_height, result, idempotency_key, request_hash, confirmed_at, confirmed_by_user_id
  FROM delivery_confirmations;

DROP TABLE delivery_confirmations;
ALTER TABLE delivery_confirmations_new RENAME TO delivery_confirmations;
CREATE UNIQUE INDEX ux_confirmations_active_delivery ON delivery_confirmations(delivery_id) WHERE voided_at IS NULL;
CREATE INDEX idx_confirmations_delivery ON delivery_confirmations(delivery_id);
CREATE INDEX idx_confirmations_confirmed_at ON delivery_confirmations(confirmed_at);
CREATE INDEX idx_confirmations_by_user ON delivery_confirmations(confirmed_by_user_id, confirmed_at);

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

-- Every correction and void, never updated or deleted: the old and new values, the reason, who and when.
CREATE TABLE confirmation_corrections (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  confirmation_id     TEXT    NOT NULL REFERENCES delivery_confirmations(id) ON DELETE CASCADE,
  kind                TEXT    NOT NULL CHECK (kind IN ('correction', 'void')),
  reason              TEXT    NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  old_received_by     TEXT,
  new_received_by     TEXT,
  old_outcome         TEXT,
  new_outcome         TEXT,
  old_outcome_detail  TEXT,
  new_outcome_detail  TEXT,
  by_user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT    NOT NULL
);
CREATE INDEX idx_confirmation_corrections ON confirmation_corrections(confirmation_id, created_at);

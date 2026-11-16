-- 0005: "Undo void". The change history can also record that a void was undone ('unvoid'), with its reason.
-- SQLite cannot change a CHECK in place, so confirmation_corrections is rebuilt and every row copied unchanged.

CREATE TABLE confirmation_corrections_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  confirmation_id     TEXT    NOT NULL REFERENCES delivery_confirmations(id) ON DELETE CASCADE,
  kind                TEXT    NOT NULL CHECK (kind IN ('correction', 'void', 'unvoid')),
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
INSERT INTO confirmation_corrections_new
  (id, confirmation_id, kind, reason, old_received_by, new_received_by, old_outcome, new_outcome, old_outcome_detail,
   new_outcome_detail, by_user_id, created_at)
SELECT id, confirmation_id, kind, reason, old_received_by, new_received_by, old_outcome, new_outcome, old_outcome_detail,
       new_outcome_detail, by_user_id, created_at
  FROM confirmation_corrections;
DROP TABLE confirmation_corrections;
ALTER TABLE confirmation_corrections_new RENAME TO confirmation_corrections;
CREATE INDEX idx_confirmation_corrections ON confirmation_corrections(confirmation_id, created_at);

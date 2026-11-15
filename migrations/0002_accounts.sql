-- Sign-in accounts for drivers and shop employees, server-side sessions, and who confirmed each delivery.
-- Additive: no existing row changes. Passwords are never stored, only salted PBKDF2-SHA256 hashes.

CREATE TABLE users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(username) BETWEEN 3 AND 40),
  display_name   TEXT    NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  role           TEXT    NOT NULL CHECK (role IN ('driver', 'employee')),
  -- 'pbkdf2-sha256$<iterations>$<salt, base64>$<hash, base64>'
  password_hash  TEXT    NOT NULL CHECK (password_hash LIKE 'pbkdf2-sha256$%'),
  -- Deactivated accounts cannot sign in, and their sessions stop working.
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  last_login_at  TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

-- One row per signed-in browser. `id` is the SHA-256 (hex) of the random cookie token, so the database never holds a
-- usable session token. Sessions end after 2 hours without activity or 12 hours in total, and on sign-out.
CREATE TABLE sessions (
  id            TEXT    PRIMARY KEY CHECK (length(id) = 64),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Anti-forgery token the app sends back in X-CSRF-Token on every change.
  csrf_token    TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  last_seen_at  TEXT    NOT NULL,
  expires_at    TEXT    NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- The driver account that saved each confirmation (NULL for confirmations saved before accounts existed).
ALTER TABLE delivery_confirmations ADD COLUMN confirmed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_confirmations_by_user ON delivery_confirmations(confirmed_by_user_id, confirmed_at);

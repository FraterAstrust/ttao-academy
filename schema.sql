-- TTAO Academy — D1 schema
-- Run: npx wrangler d1 execute ttao-academy --file=schema.sql

-- PRAGMA journal_mode = WAL;
-- PRAGMA foreign_keys = ON;

-- ── USERS ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,          -- crypto.randomUUID()
    patreon_id      TEXT UNIQUE NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    username        TEXT UNIQUE,               -- NULL until setup complete
    password_hash   TEXT,                      -- NULL until setup complete
    tier            TEXT NOT NULL DEFAULT 'tyro',
    tier_override   INTEGER NOT NULL DEFAULT 0, -- 1 = manually set by admin
    is_admin        INTEGER NOT NULL DEFAULT 0, -- 1 = admin user override
    bio             TEXT,
    avatar_r2_key   TEXT,
    created_at      TEXT NOT NULL,
    last_seen       TEXT,
    patreon_synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username  ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_patreon   ON users(patreon_id);

-- ── BBS — PHASE 2 (schema created now, populated later) ──────────────────────

CREATE TABLE IF NOT EXISTS boards (
    id          TEXT PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    min_tier    TEXT NOT NULL DEFAULT 'tyro',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
    id          TEXT PRIMARY KEY,
    board_id    TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    author_id   TEXT NOT NULL REFERENCES users(id),
    title       TEXT NOT NULL,
    pinned      INTEGER NOT NULL DEFAULT 0,
    locked      INTEGER NOT NULL DEFAULT 0,
    post_count  INTEGER NOT NULL DEFAULT 0,
    last_post_at TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_threads_board ON threads(board_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS posts (
    id          TEXT PRIMARY KEY,
    thread_id   TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    author_id   TEXT NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT                            -- soft delete
);

CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(thread_id, created_at ASC);

CREATE TABLE IF NOT EXISTS attachments (
    id          TEXT PRIMARY KEY,
    post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    r2_key      TEXT NOT NULL,
    filename    TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    size        INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL
);

-- ── SEED: suggestion board ────────────────────────────────────────────────────

INSERT OR IGNORE INTO boards (id, slug, name, description, min_tier, sort_order, created_at)
VALUES (
    'board-suggestions',
    'suggestions',
    'Suggestions',
    'Propose new boards, topics, and features. Open to all members.',
    'tyro',
    0,
    datetime('now')
);

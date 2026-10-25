import sqlite3

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    destination TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    budget NUMERIC NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_activities_trip_id ON activities(trip_id);
"""



def _migrate_trips_user_id(db):
    """Add trips.user_id to databases created before authentication existed.

    Idempotent: safe to run on every startup and multiple times in a row.
    Existing trip/activity rows are preserved; legacy trips keep a NULL
    user_id so they stay unowned and inaccessible instead of leaking to
    whichever user registers first.
    """
    columns = [row["name"] for row in db.execute("PRAGMA table_info(trips)").fetchall()]
    if "user_id" not in columns:
        db.execute("ALTER TABLE trips ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
    db.execute("CREATE INDEX IF NOT EXISTS idx_trips_user_id ON trips(user_id)")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    _migrate_trips_user_id(db)
    db.commit()
    db.close()

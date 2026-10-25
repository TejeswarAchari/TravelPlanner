import sqlite3

from conftest import make_user_client


LEGACY_SCHEMA = """
CREATE TABLE trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    destination TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    budget NUMERIC NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
);
"""


def make_legacy_db(path):
    db = sqlite3.connect(str(path))
    db.executescript(LEGACY_SCHEMA)
    trip_id = db.execute(
        "INSERT INTO trips (name, destination, start_date, end_date, budget, description)"
        " VALUES ('Legacy', 'Rome', '2026-11-10', '2026-11-14', 5000, 'old')"
    ).lastrowid
    db.execute(
        "INSERT INTO activities (trip_id, title, date, time) VALUES (?, 'Colosseum', '2026-11-11', '09:00')",
        (trip_id,),
    )
    db.commit()
    db.close()
    return trip_id


def test_migration_preserves_legacy_records(tmp_path):
    from app import create_app

    db_path = tmp_path / "legacy.db"
    legacy_trip_id = make_legacy_db(db_path)

    app = create_app(str(db_path), secret_key="migration-secret")
    app.config.update(TESTING=True)
    user = make_user_client(app, "new@example.com")

    # Records survived the migration, with activity relationship intact.
    with app.app_context():
        from database import get_db
        trip = get_db().execute("SELECT * FROM trips WHERE id = ?", (legacy_trip_id,)).fetchone()
        assert trip["name"] == "Legacy"
        assert trip["user_id"] is None
        activities = get_db().execute("SELECT * FROM activities WHERE trip_id = ?", (legacy_trip_id,)).fetchall()
        assert len(activities) == 1
        assert activities[0]["title"] == "Colosseum"

    # Legacy unowned trips are not exposed to newly registered users.
    assert user.get("/api/trips").get_json() == []
    assert user.get(f"/api/trips/{legacy_trip_id}").status_code == 404
    assert user.get(f"/api/trips/{legacy_trip_id}/activities").status_code == 404

    # Re-running startup migration is a no-op (idempotent).
    create_app(str(db_path), secret_key="migration-secret")
    db = sqlite3.connect(str(db_path))
    assert db.execute("SELECT COUNT(*) FROM trips").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM activities").fetchone()[0] == 1
    db.close()

    # New trips get the owner's id (verified at the database level; the
    # API response itself must not expose it).
    created = user.post("/api/trips", json={
        "name": "New", "destination": "Paris",
        "start_date": "2026-12-01", "end_date": "2026-12-05",
    })
    assert created.status_code == 201
    assert "user_id" not in created.get_json()
    me = user.get("/api/auth/me").get_json()
    with app.app_context():
        from database import get_db
        row = get_db().execute(
            "SELECT user_id FROM trips WHERE id = ?", (created.get_json()["id"],)
        ).fetchone()
    assert row["user_id"] == me["id"]
    assert [t["name"] for t in user.get("/api/trips").get_json()] == ["New"]


def test_fresh_database_has_owner_column(tmp_path):
    from app import create_app

    db_path = tmp_path / "fresh.db"
    create_app(str(db_path), secret_key="fresh-secret")
    db = sqlite3.connect(str(db_path))
    columns = [row[1] for row in db.execute("PRAGMA table_info(trips)").fetchall()]
    assert "user_id" in columns
    assert db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
    db.close()

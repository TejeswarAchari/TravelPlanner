from datetime import date

from database import get_db

TRIP_STATUSES = ("upcoming", "ongoing", "completed")


def get_trip_status(start_date, end_date):
    today = date.today().isoformat()
    if today < start_date:
        return "upcoming"
    if today > end_date:
        return "completed"
    return "ongoing"


def trip_to_dict(row):
    trip = dict(row)
    # user_id stays server-side: it drives owner-scoped queries but is
    # never part of the public API response.
    trip.pop("user_id", None)
    trip["status"] = get_trip_status(trip["start_date"], trip["end_date"])
    return trip


def find_trip(trip_id):
    return get_db().execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()


def find_activity(activity_id):
    return get_db().execute("SELECT * FROM activities WHERE id = ?", (activity_id,)).fetchone()


def find_trip_for_user(trip_id, user_id):
    return (
        get_db()
        .execute("SELECT * FROM trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
        .fetchone()
    )


def find_activity_for_user(activity_id, user_id):
    return (
        get_db()
        .execute(
            """SELECT activities.* FROM activities
               JOIN trips ON trips.id = activities.trip_id
               WHERE activities.id = ? AND trips.user_id = ?""",
            (activity_id, user_id),
        )
        .fetchone()
    )


def find_user_by_email(email):
    return (
        get_db()
        .execute("SELECT * FROM users WHERE email = ? COLLATE NOCASE", (email,))
        .fetchone()
    )

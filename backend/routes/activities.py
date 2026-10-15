from flask import Blueprint, jsonify, request

from database import get_db
from models import find_activity, find_trip
from validation import parse_id, validate_activity

bp = Blueprint("activities", __name__, url_prefix="/api")


def has_schedule_conflict(trip_id, activity, exclude_activity_id=None):
    if not activity["time"]:
        return False

    query = "SELECT 1 FROM activities WHERE trip_id = ? AND date = ? AND time = ?"
    params = [trip_id, activity["date"], activity["time"]]
    if exclude_activity_id is not None:
        query += " AND id != ?"
        params.append(exclude_activity_id)
    return get_db().execute(query, params).fetchone() is not None


@bp.get("/trips/<trip_id>/activities")
def list_activities(trip_id):
    trip_id = parse_id(trip_id)
    if trip_id is None:
        return jsonify(error="Invalid trip id"), 400
    if find_trip(trip_id) is None:
        return jsonify(error="Trip not found"), 404

    rows = get_db().execute(
        "SELECT * FROM activities WHERE trip_id = ? ORDER BY date, time, id", (trip_id,)
    ).fetchall()
    return jsonify([dict(row) for row in rows])


@bp.post("/trips/<trip_id>/activities")
def create_activity(trip_id):
    trip_id = parse_id(trip_id)
    if trip_id is None:
        return jsonify(error="Invalid trip id"), 400
    trip = find_trip(trip_id)
    if trip is None:
        return jsonify(error="Trip not found"), 404

    activity, error = validate_activity(request.get_json(silent=True), trip)
    if error:
        return jsonify(error=error), 400
    db = get_db()
    with db:
        db.execute("BEGIN IMMEDIATE")
        if has_schedule_conflict(trip_id, activity):
            return jsonify(error="An activity is already scheduled at this date and time. Choose a different time."), 400

        cursor = db.execute(
            """INSERT INTO activities (trip_id, title, date, time, location, notes)
               VALUES (:trip_id, :title, :date, :time, :location, :notes)""",
            {**activity, "trip_id": trip_id},
        )
    return jsonify(dict(find_activity(cursor.lastrowid))), 201


@bp.put("/activities/<activity_id>")
def update_activity(activity_id):
    activity_id = parse_id(activity_id)
    if activity_id is None:
        return jsonify(error="Invalid activity id"), 400
    existing = find_activity(activity_id)
    if existing is None:
        return jsonify(error="Activity not found"), 404

    trip = find_trip(existing["trip_id"])
    activity, error = validate_activity(request.get_json(silent=True), trip)
    if error:
        return jsonify(error=error), 400
    db = get_db()
    with db:
        db.execute("BEGIN IMMEDIATE")
        if has_schedule_conflict(trip["id"], activity, exclude_activity_id=activity_id):
            return jsonify(error="An activity is already scheduled at this date and time. Choose a different time."), 400

        db.execute(
            """UPDATE activities SET title = :title, date = :date, time = :time,
               location = :location, notes = :notes WHERE id = :id""",
            {**activity, "id": activity_id},
        )
    return jsonify(dict(find_activity(activity_id)))


@bp.delete("/activities/<activity_id>")
def delete_activity(activity_id):
    activity_id = parse_id(activity_id)
    if activity_id is None:
        return jsonify(error="Invalid activity id"), 400
    if find_activity(activity_id) is None:
        return jsonify(error="Activity not found"), 404

    db = get_db()
    db.execute("DELETE FROM activities WHERE id = ?", (activity_id,))
    db.commit()
    return jsonify(message="Activity deleted")

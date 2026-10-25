from flask import Blueprint, jsonify, request

from auth import get_current_user, login_required
from database import get_db
from models import find_activity, find_activity_for_user, find_trip_for_user
from validation import parse_id, validate_activity

bp = Blueprint("activities", __name__, url_prefix="/api")


@bp.get("/trips/<trip_id>/activities")
@login_required
def list_activities(trip_id):
    user = get_current_user()
    trip_id = parse_id(trip_id)
    if trip_id is None:
        return jsonify(error="Invalid trip id"), 400
    if find_trip_for_user(trip_id, user["id"]) is None:
        return jsonify(error="Trip not found"), 404

    rows = get_db().execute(
        "SELECT * FROM activities WHERE trip_id = ? ORDER BY date, time, id", (trip_id,)
    ).fetchall()
    return jsonify([dict(row) for row in rows])


@bp.post("/trips/<trip_id>/activities")
@login_required
def create_activity(trip_id):
    user = get_current_user()
    trip_id = parse_id(trip_id)
    if trip_id is None:
        return jsonify(error="Invalid trip id"), 400
    trip = find_trip_for_user(trip_id, user["id"])
    if trip is None:
        return jsonify(error="Trip not found"), 404

    activity, error = validate_activity(request.get_json(silent=True), trip)
    if error:
        return jsonify(error=error), 400

    db = get_db()
    cursor = db.execute(
        """INSERT INTO activities (trip_id, title, date, time, location, notes)
           VALUES (:trip_id, :title, :date, :time, :location, :notes)""",
        {**activity, "trip_id": trip_id},
    )
    db.commit()
    return jsonify(dict(find_activity(cursor.lastrowid))), 201


@bp.put("/activities/<activity_id>")
@login_required
def update_activity(activity_id):
    user = get_current_user()
    activity_id = parse_id(activity_id)
    if activity_id is None:
        return jsonify(error="Invalid activity id"), 400
    # Ownership is checked through the parent trip, so activity IDs cannot
    # be used to bypass trip ownership.
    existing = find_activity_for_user(activity_id, user["id"])
    if existing is None:
        return jsonify(error="Activity not found"), 404

    trip = find_trip_for_user(existing["trip_id"], user["id"])
    activity, error = validate_activity(request.get_json(silent=True), trip)
    if error:
        return jsonify(error=error), 400

    db = get_db()
    db.execute(
        """UPDATE activities SET title = :title, date = :date, time = :time,
           location = :location, notes = :notes WHERE id = :id""",
        {**activity, "id": activity_id},
    )
    db.commit()
    return jsonify(dict(find_activity(activity_id)))


@bp.delete("/activities/<activity_id>")
@login_required
def delete_activity(activity_id):
    user = get_current_user()
    activity_id = parse_id(activity_id)
    if activity_id is None:
        return jsonify(error="Invalid activity id"), 400
    if find_activity_for_user(activity_id, user["id"]) is None:
        return jsonify(error="Activity not found"), 404

    db = get_db()
    db.execute("DELETE FROM activities WHERE id = ?", (activity_id,))
    db.commit()
    return jsonify(message="Activity deleted")

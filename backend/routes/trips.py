from flask import Blueprint, jsonify, request

from auth import get_current_user, login_required
from database import get_db
from models import TRIP_STATUSES, find_trip, find_trip_for_user, trip_to_dict
from validation import parse_id, validate_trip

bp = Blueprint("trips", __name__, url_prefix="/api/trips")


@bp.get("")
@login_required
def list_trips():
    user = get_current_user()
    search = request.args.get("search", "").strip()
    status = request.args.get("status", "").strip().lower()
    if status and status not in TRIP_STATUSES:
        return jsonify(error=f"Status must be one of: {', '.join(TRIP_STATUSES)}"), 400

    query = "SELECT * FROM trips WHERE user_id = ?"
    params = [user["id"]]
    if search:
        query += " AND (name LIKE ? ESCAPE '\\' OR destination LIKE ? ESCAPE '\\')"
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        params += [f"%{escaped}%", f"%{escaped}%"]
    query += " ORDER BY start_date, id"

    rows = get_db().execute(query, params).fetchall()
    trips = [trip_to_dict(row) for row in rows]
    if status:
        trips = [trip for trip in trips if trip["status"] == status]
    return jsonify(trips)


@bp.post("")
@login_required
def create_trip():
    user = get_current_user()
    trip, error = validate_trip(request.get_json(silent=True))
    if error:
        return jsonify(error=error), 400

    db = get_db()
    cursor = db.execute(
        """INSERT INTO trips (user_id, name, destination, start_date, end_date, budget, description)
           VALUES (:user_id, :name, :destination, :start_date, :end_date, :budget, :description)""",
        {**trip, "user_id": user["id"]},
    )
    db.commit()
    return jsonify(trip_to_dict(find_trip(cursor.lastrowid))), 201


@bp.get("/<trip_id>")
@login_required
def get_trip(trip_id):
    user = get_current_user()
    trip_id = parse_id(trip_id)
    if trip_id is None:
        return jsonify(error="Invalid trip id"), 400
    # 404 for foreign trips too, so ownership is not disclosed.
    row = find_trip_for_user(trip_id, user["id"])
    if row is None:
        return jsonify(error="Trip not found"), 404
    return jsonify(trip_to_dict(row))


@bp.put("/<trip_id>")
@login_required
def update_trip(trip_id):
    user = get_current_user()
    trip_id = parse_id(trip_id)
    if trip_id is None:
        return jsonify(error="Invalid trip id"), 400
    if find_trip_for_user(trip_id, user["id"]) is None:
        return jsonify(error="Trip not found"), 404

    trip, error = validate_trip(request.get_json(silent=True))
    if error:
        return jsonify(error=error), 400

    db = get_db()
    outside_dates = db.execute(
        "SELECT COUNT(*) FROM activities WHERE trip_id = ? AND (date < ? OR date > ?)",
        (trip_id, trip["start_date"], trip["end_date"]),
    ).fetchone()[0]
    if outside_dates:
        return jsonify(error="Some activities fall outside the new trip dates. Edit or delete them first"), 400

    db.execute(
        """UPDATE trips SET name = :name, destination = :destination, start_date = :start_date,
           end_date = :end_date, budget = :budget, description = :description
           WHERE id = :id AND user_id = :user_id""",
        {**trip, "id": trip_id, "user_id": user["id"]},
    )
    db.commit()
    return jsonify(trip_to_dict(find_trip_for_user(trip_id, user["id"])))


@bp.delete("/<trip_id>")
@login_required
def delete_trip(trip_id):
    user = get_current_user()
    trip_id = parse_id(trip_id)
    if trip_id is None:
        return jsonify(error="Invalid trip id"), 400
    if find_trip_for_user(trip_id, user["id"]) is None:
        return jsonify(error="Trip not found"), 404

    db = get_db()
    db.execute("DELETE FROM trips WHERE id = ? AND user_id = ?", (trip_id, user["id"]))
    db.commit()
    return jsonify(message="Trip deleted")

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock

import pytest

from app import create_app
from database import get_db
from routes import activities as activities_routes


def activity_data(**changes):
    data = {
        "title": "Dinner",
        "date": "2026-11-11",
        "time": "20:00",
        "location": "Fisherman's Wharf",
        "notes": "Book a table",
    }
    return {**data, **changes}


def run_concurrent_activity_requests(app, monkeypatch, requests):
    barrier = Barrier(len(requests))
    connection_ids = set()
    connection_ids_lock = Lock()
    get_connection = activities_routes.get_db

    class SynchronizedConnection:
        def __init__(self, connection):
            self.connection = connection

        def execute(self, statement, parameters=()):
            if statement == "BEGIN IMMEDIATE":
                with connection_ids_lock:
                    connection_ids.add(id(self.connection))
                barrier.wait(timeout=10)
            return self.connection.execute(statement, parameters)

        def __enter__(self):
            self.connection.__enter__()
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return self.connection.__exit__(exc_type, exc_value, traceback)

    monkeypatch.setattr(
        activities_routes,
        "get_db",
        lambda: SynchronizedConnection(get_connection()),
    )

    def send_request(method, path, data):
        with app.test_client() as concurrent_client:
            return concurrent_client.open(path, method=method, json=data)

    with ThreadPoolExecutor(max_workers=len(requests)) as executor:
        responses = list(executor.map(lambda request: send_request(*request), requests))

    assert len(connection_ids) == len(requests)
    return responses


def concurrent_app(tmp_path):
    app = create_app(str(tmp_path / "concurrent.db"))
    app.config["TESTING"] = True
    with app.test_client() as client:
        trip = client.post("/api/trips", json={
            "name": "Concurrent trip",
            "destination": "Somewhere",
            "start_date": "2026-11-10",
            "end_date": "2026-11-14",
        }).get_json()
    return app, trip


def test_get_activities_empty(client, trip):
    response = client.get(f"/api/trips/{trip['id']}/activities")
    assert response.status_code == 200
    assert response.get_json() == []


def test_create_activity(client, trip):
    response = client.post(f"/api/trips/{trip['id']}/activities", json=activity_data())
    assert response.status_code == 201
    activity = response.get_json()
    assert activity["trip_id"] == trip["id"]
    assert activity["title"] == "Dinner"
    assert activity["time"] == "20:00"


def test_create_activity_with_only_required_fields(client, trip):
    data = {"title": "Free day", "date": "2026-11-12"}
    response = client.post(f"/api/trips/{trip['id']}/activities", json=data)
    assert response.status_code == 201
    assert response.get_json()["location"] == ""


def test_create_activity_rejects_matching_schedule(client, trip, activity):
    response = client.post(
        f"/api/trips/{trip['id']}/activities",
        json=activity_data(date=activity["date"], time=f" {activity['time']} "),
    )

    assert response.status_code == 400
    assert response.get_json() == {
        "error": "An activity is already scheduled at this date and time. Choose a different time."
    }


def test_concurrent_activity_creates_allow_only_one_matching_schedule(tmp_path, monkeypatch):
    app, trip = concurrent_app(tmp_path)
    url = f"/api/trips/{trip['id']}/activities"
    requests = [
        ("POST", url, activity_data(title=f"Activity {index}"))
        for index in range(2)
    ]

    responses = run_concurrent_activity_requests(app, monkeypatch, requests)

    assert sorted(response.status_code for response in responses) == [201, 400]
    loser = next(response for response in responses if response.status_code == 400)
    assert loser.get_json() == {
        "error": "An activity is already scheduled at this date and time. Choose a different time."
    }
    with app.app_context():
        count = get_db().execute(
            "SELECT COUNT(*) FROM activities WHERE trip_id = ? AND date = ? AND time = ?",
            (trip["id"], "2026-11-11", "20:00"),
        ).fetchone()[0]
    assert count == 1


def test_get_activities_sorted_by_date_and_time(client, trip):
    url = f"/api/trips/{trip['id']}/activities"
    client.post(url, json=activity_data(title="Late", date="2026-11-12", time="09:00"))
    client.post(url, json=activity_data(title="Evening", date="2026-11-11", time="20:00"))
    client.post(url, json=activity_data(title="Morning", date="2026-11-11", time="08:00"))

    titles = [a["title"] for a in client.get(url).get_json()]
    assert titles == ["Morning", "Evening", "Late"]


def test_get_activities_only_returns_own_trip(client, trip, activity):
    other = client.post("/api/trips", json={
        "name": "Other", "destination": "Elsewhere",
        "start_date": "2026-11-10", "end_date": "2026-11-14",
    }).get_json()
    assert client.get(f"/api/trips/{other['id']}/activities").get_json() == []


def test_update_activity(client, activity):
    data = activity_data(title="Sunset at Baga", date="2026-11-13", time="17:30")
    response = client.put(f"/api/activities/{activity['id']}", json=data)
    assert response.status_code == 200
    updated = response.get_json()
    assert updated["title"] == "Sunset at Baga"
    assert updated["date"] == "2026-11-13"
    assert updated["trip_id"] == activity["trip_id"]


def test_update_activity_rejects_matching_schedule(client, trip, activity):
    other = client.post(
        f"/api/trips/{trip['id']}/activities",
        json=activity_data(date=activity["date"], time="20:00"),
    ).get_json()

    response = client.put(
        f"/api/activities/{activity['id']}",
        json=activity_data(date=activity["date"], time=other["time"]),
    )

    assert response.status_code == 400
    assert response.get_json() == {
        "error": "An activity is already scheduled at this date and time. Choose a different time."
    }


def test_concurrent_activity_updates_allow_only_one_matching_schedule(tmp_path, monkeypatch):
    app, trip = concurrent_app(tmp_path)
    with app.test_client() as client:
        first = client.post(
            f"/api/trips/{trip['id']}/activities",
            json=activity_data(title="First", time="10:00"),
        ).get_json()
        second = client.post(
            f"/api/trips/{trip['id']}/activities",
            json=activity_data(title="Second", time="11:00"),
        ).get_json()
    requests = [
        (
            "PUT",
            f"/api/activities/{activity['id']}",
            activity_data(title=activity["title"], time="12:00"),
        )
        for activity in (first, second)
    ]

    responses = run_concurrent_activity_requests(app, monkeypatch, requests)

    assert sorted(response.status_code for response in responses) == [200, 400]
    loser = next(response for response in responses if response.status_code == 400)
    assert loser.get_json() == {
        "error": "An activity is already scheduled at this date and time. Choose a different time."
    }
    with app.app_context():
        count = get_db().execute(
            "SELECT COUNT(*) FROM activities WHERE trip_id = ? AND date = ? AND time = ?",
            (trip["id"], "2026-11-11", "12:00"),
        ).fetchone()[0]
    assert count == 1


def test_update_activity_does_not_conflict_with_itself(client, activity):
    response = client.put(
        f"/api/activities/{activity['id']}",
        json=activity_data(date=activity["date"], time=activity["time"]),
    )

    assert response.status_code == 200
    assert response.get_json()["id"] == activity["id"]


def test_activities_at_different_times_on_same_date_are_allowed(client, trip, activity):
    response = client.post(
        f"/api/trips/{trip['id']}/activities",
        json=activity_data(date=activity["date"], time="11:00"),
    )

    assert response.status_code == 201


def test_activities_at_same_time_on_different_dates_are_allowed(client, trip, activity):
    response = client.post(
        f"/api/trips/{trip['id']}/activities",
        json=activity_data(date="2026-11-11", time=activity["time"]),
    )

    assert response.status_code == 201


def test_matching_schedules_in_different_trips_are_allowed(client, trip, activity):
    other_trip = client.post("/api/trips", json={
        "name": "Other trip",
        "destination": "Elsewhere",
        "start_date": "2026-11-10",
        "end_date": "2026-11-14",
    }).get_json()

    response = client.post(
        f"/api/trips/{other_trip['id']}/activities",
        json=activity_data(date=activity["date"], time=activity["time"]),
    )

    assert response.status_code == 201


def test_unspecified_activity_times_do_not_conflict(client, trip, activity):
    url = f"/api/trips/{trip['id']}/activities"
    unscheduled = {"title": "Unscheduled visit", "date": activity["date"]}

    assert client.post(url, json=unscheduled).status_code == 201
    assert client.post(url, json=unscheduled).status_code == 201
    assert client.post(url, json=activity_data(date=activity["date"], time="12:00")).status_code == 201


def test_delete_activity(client, trip, activity):
    response = client.delete(f"/api/activities/{activity['id']}")
    assert response.status_code == 200
    assert client.get(f"/api/trips/{trip['id']}/activities").get_json() == []


def test_activities_for_missing_trip(client):
    assert client.get("/api/trips/999/activities").status_code == 404
    response = client.post("/api/trips/999/activities", json=activity_data())
    assert response.status_code == 404
    assert response.get_json() == {"error": "Trip not found"}


def test_activity_not_found(client):
    assert client.put("/api/activities/999", json=activity_data()).status_code == 404
    response = client.delete("/api/activities/999")
    assert response.status_code == 404
    assert response.get_json() == {"error": "Activity not found"}


def test_invalid_activity_id(client):
    response = client.delete("/api/activities/abc")
    assert response.status_code == 400
    assert response.get_json() == {"error": "Invalid activity id"}


@pytest.mark.parametrize("changes, message", [
    ({"title": ""}, "Title is required"),
    ({"date": ""}, "Date is required"),
    ({"date": "tomorrow"}, "Date must be a valid date (YYYY-MM-DD)"),
    ({"date": "2026-11-09"}, "Activity date must be within the trip dates"),
    ({"date": "2026-11-15"}, "Activity date must be within the trip dates"),
    ({"time": "25:00"}, "Time must be in HH:MM format"),
])
def test_create_activity_invalid_data(client, trip, changes, message):
    response = client.post(f"/api/trips/{trip['id']}/activities", json=activity_data(**changes))
    assert response.status_code == 400
    assert response.get_json() == {"error": message}


def test_activity_allowed_on_first_and_last_trip_day(client, trip):
    url = f"/api/trips/{trip['id']}/activities"
    assert client.post(url, json=activity_data(date="2026-11-10")).status_code == 201
    assert client.post(url, json=activity_data(date="2026-11-14")).status_code == 201


def test_update_activity_invalid_date(client, activity):
    response = client.put(f"/api/activities/{activity['id']}", json=activity_data(date="2027-01-01"))
    assert response.status_code == 400

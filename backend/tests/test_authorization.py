from conftest import make_user_client


def trip_data(**changes):
    data = {
        "name": "Manali Trip",
        "destination": "Manali",
        "start_date": "2026-12-01",
        "end_date": "2026-12-05",
        "budget": 15000,
        "description": "Snow",
    }
    return {**data, **changes}


def activity_data(**changes):
    data = {
        "title": "Dinner",
        "date": "2026-11-11",
        "time": "20:00",
        "location": "Lodge",
        "notes": "",
    }
    return {**data, **changes}


def test_trip_listing_only_shows_own_trips(app, client, trip):
    other = make_user_client(app, "other@example.com")
    assert other.get("/api/trips").get_json() == []

    own = client.get("/api/trips").get_json()
    assert [t["id"] for t in own] == [trip["id"]]


def owner_id(app, trip_id):
    with app.app_context():
        from database import get_db
        return get_db().execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,)).fetchone()[0]


def test_create_trip_ignores_client_user_id(app, client):
    response = client.post("/api/trips", json={**trip_data(), "user_id": 9999})
    assert response.status_code == 201
    created = response.get_json()

    # Ownership is verified at the database level, not via the response.
    me = client.get("/api/auth/me").get_json()
    assert owner_id(app, created["id"]) == me["id"]

    other = make_user_client(app, "other2@example.com")
    assert other.get(f"/api/trips/{created['id']}").status_code == 404


def test_trip_responses_do_not_expose_user_id(app, client, trip, activity):
    created = client.post("/api/trips", json=trip_data()).get_json()
    assert "user_id" not in created

    for response in (
        client.get("/api/trips"),
        client.get(f"/api/trips/{trip['id']}"),
        client.put(f"/api/trips/{trip['id']}", json=trip_data(name="Renamed")),
    ):
        body = response.get_json()
        items = body if isinstance(body, list) else [body]
        assert items, response
        for item in items:
            assert "user_id" not in item

    # Ownership is still enforced without the field: another user is shut out.
    other = make_user_client(app, "nouserid@example.com")
    assert other.get(f"/api/trips/{trip['id']}").status_code == 404
    assert owner_id(app, trip["id"]) != other.get("/api/auth/me").get_json()["id"]


def test_cannot_get_other_users_trip(app, client, trip):
    other = make_user_client(app, "stranger@example.com")
    response = other.get(f"/api/trips/{trip['id']}")
    assert response.status_code == 404
    assert response.get_json() == {"error": "Trip not found"}


def test_cannot_update_other_users_trip(app, client, trip):
    other = make_user_client(app, "stranger2@example.com")
    response = other.put(f"/api/trips/{trip['id']}", json=trip_data(name="Hijacked"))
    assert response.status_code == 404
    assert client.get(f"/api/trips/{trip['id']}").get_json()["name"] == "Goa Trip"


def test_cannot_delete_other_users_trip(app, client, trip):
    other = make_user_client(app, "stranger3@example.com")
    response = other.delete(f"/api/trips/{trip['id']}")
    assert response.status_code == 404
    assert client.get(f"/api/trips/{trip['id']}").status_code == 200


def test_cannot_list_or_create_activities_on_foreign_trip(app, client, trip, activity):
    other = make_user_client(app, "stranger4@example.com")

    listed = other.get(f"/api/trips/{trip['id']}/activities")
    assert listed.status_code == 404
    assert listed.get_json() == {"error": "Trip not found"}

    created = other.post(f"/api/trips/{trip['id']}/activities", json=activity_data())
    assert created.status_code == 404

    own = client.get(f"/api/trips/{trip['id']}/activities").get_json()
    assert [a["id"] for a in own] == [activity["id"]]


def test_cannot_update_or_delete_foreign_activity(app, client, trip, activity):
    other = make_user_client(app, "stranger5@example.com")

    updated = other.put(f"/api/activities/{activity['id']}", json=activity_data(title="Hijacked"))
    assert updated.status_code == 404
    assert updated.get_json() == {"error": "Activity not found"}

    deleted = other.delete(f"/api/activities/{activity['id']}")
    assert deleted.status_code == 404

    # Owner's activity is untouched.
    assert client.put(f"/api/activities/{activity['id']}", json=activity_data()).status_code == 200


def test_search_and_status_filters_are_owner_scoped(app, client):
    client.post("/api/trips", json=trip_data(name="Goa Escape", destination="Goa"))
    other = make_user_client(app, "filter@example.com")
    other.post("/api/trips", json=trip_data(name="Goa Escape", destination="Goa"))

    assert client.get("/api/trips?search=goa").get_json() != []
    names = [t["name"] for t in client.get("/api/trips?search=goa").get_json()]
    assert names == ["Goa Escape"]
    assert len(other.get("/api/trips?search=goa").get_json()) == 1

    # Each user only sees their own trip in status filters.
    for status in ("upcoming", "ongoing", "completed"):
        for viewer in (client, other):
            for t in viewer.get(f"/api/trips?status={status}").get_json():
                assert t["name"] == "Goa Escape"


def test_validation_still_applies_to_owned_trips(client, trip):
    response = client.post("/api/trips", json=trip_data(budget=-5))
    assert response.status_code == 400

    response = client.put(f"/api/trips/{trip['id']}", json=trip_data(budget="lots"))
    assert response.status_code == 400

    response = client.post(
        f"/api/trips/{trip['id']}/activities", json=activity_data(date="2027-01-01")
    )
    assert response.status_code == 400


def test_error_messages_do_not_leak_foreign_data(app, client, trip, activity):
    other = make_user_client(app, "snoop@example.com")
    for response in (
        other.get(f"/api/trips/{trip['id']}"),
        other.get(f"/api/trips/{trip['id']}/activities"),
        other.put(f"/api/activities/{activity['id']}", json=activity_data()),
    ):
        body = response.get_json()
        assert response.status_code == 404
        assert "Goa" not in str(body)
        assert "Baga" not in str(body)

import pytest

from app import create_app


class AuthedClient:
    """Flask test client wrapper that behaves like the frontend.

    Automatically attaches a fresh CSRF token to state-changing requests,
    so existing trip/activity tests exercise the authenticated + CSRF-armed
    stack without spelling out the header on every call. CSRF enforcement
    itself is covered by dedicated tests using the raw client (.raw).
    """

    def __init__(self, raw):
        self.raw = raw

    def csrf_token(self):
        return self.raw.get("/api/auth/csrf").get_json()["csrf_token"]

    def _mutate(self, method, *args, **kwargs):
        headers = dict(kwargs.pop("headers", {}) or {})
        headers.setdefault("X-CSRF-Token", self.csrf_token())
        return method(*args, headers=headers, **kwargs)

    def post(self, *args, **kwargs):
        return self._mutate(self.raw.post, *args, **kwargs)

    def put(self, *args, **kwargs):
        return self._mutate(self.raw.put, *args, **kwargs)

    def patch(self, *args, **kwargs):
        return self._mutate(self.raw.patch, *args, **kwargs)

    def delete(self, *args, **kwargs):
        return self._mutate(self.raw.delete, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self.raw, name)


def register_user(raw, email, password="password123"):
    token = raw.get("/api/auth/csrf").get_json()["csrf_token"]
    return raw.post(
        "/api/auth/register",
        json={"email": email, "password": password},
        headers={"X-CSRF-Token": token},
    )


def login_user(raw, email, password="password123"):
    token = raw.get("/api/auth/csrf").get_json()["csrf_token"]
    return raw.post(
        "/api/auth/login",
        json={"email": email, "password": password},
        headers={"X-CSRF-Token": token},
    )


def make_user_client(app, email, password="password123"):
    """Fresh client with its own session, registered and logged in."""
    client = AuthedClient(app.test_client())
    response = register_user(client.raw, email, password)
    assert response.status_code == 201, response.get_json()
    return client


@pytest.fixture
def app(tmp_path):
    app = create_app(str(tmp_path / "test.db"), secret_key="test-secret-key")
    app.config.update(TESTING=True)
    return app


@pytest.fixture
def client(app):
    # Default user, mirroring what the frontend does: fetch a CSRF token,
    # register (which logs the session in), then attach CSRF automatically.
    return make_user_client(app, "test@example.com")


@pytest.fixture
def trip(client):
    response = client.post("/api/trips", json={
        "name": "Goa Trip",
        "destination": "Goa",
        "start_date": "2026-11-10",
        "end_date": "2026-11-14",
        "budget": 20000,
        "description": "Weekend trip with friends",
    })
    assert response.status_code == 201, response.get_json()
    return response.get_json()


@pytest.fixture
def activity(client, trip):
    response = client.post(f"/api/trips/{trip['id']}/activities", json={
        "title": "Visit Baga Beach",
        "date": "2026-11-10",
        "time": "10:00",
        "location": "Baga Beach",
        "notes": "Spend the morning at the beach",
    })
    assert response.status_code == 201, response.get_json()
    return response.get_json()

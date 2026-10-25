import pytest

from conftest import login_user, register_user


def user_count(app):
    with app.app_context():
        from database import get_db
        return get_db().execute("SELECT COUNT(*) FROM users").fetchone()[0]


def test_csrf_token_endpoint_sets_session_cookie(app):
    raw = app.test_client()
    response = raw.get("/api/auth/csrf")
    assert response.status_code == 200
    token = response.get_json()["csrf_token"]
    assert isinstance(token, str) and len(token) >= 32
    assert "session=" in response.headers.get("Set-Cookie", "")


def test_register_success(app):
    raw = app.test_client()
    response = register_user(raw, "  New@Example.com  ")
    assert response.status_code == 201
    body = response.get_json()
    assert body["email"] == "new@example.com"
    assert body["id"] == 1
    assert body["csrf_token"]
    assert "password" not in body and "password_hash" not in body

    me = raw.get("/api/auth/me")
    assert me.status_code == 200
    assert me.get_json() == {"id": 1, "email": "new@example.com"}


def test_register_duplicate_email(app):
    raw = app.test_client()
    assert register_user(raw, "dup@example.com").status_code == 201

    other = app.test_client()
    response = register_user(other, "dup@example.com")
    assert response.status_code == 409
    assert response.get_json() == {"error": "Email is already registered"}


def test_register_duplicate_email_case_insensitive(app):
    raw = app.test_client()
    assert register_user(raw, "Case@Example.com").status_code == 201

    other = app.test_client()
    response = register_user(other, "case@example.COM")
    assert response.status_code == 409


@pytest.mark.parametrize("payload, message", [
    ({}, "Email is required"),
    ({"email": "", "password": "password123"}, "Email is required"),
    ({"email": "not-an-email", "password": "password123"}, "Email must be a valid email address"),
    ({"email": "a@b", "password": "password123"}, "Email must be a valid email address"),
    ({"email": "a b@example.com", "password": "password123"}, "Email must be a valid email address"),
    ({"email": "user@example.com"}, "Password is required"),
    ({"email": "user@example.com", "password": ""}, "Password is required"),
    ({"email": "user@example.com", "password": "short7"}, "Password must be at least 8 characters"),
    ({"email": "user@example.com", "password": "x" * 257}, "Password must be at most 256 characters"),
    ({"email": "u@" + "x" * 250 + ".com", "password": "password123"}, "Email must be a valid email address"),
])
def test_register_invalid_data(app, payload, message):
    raw = app.test_client()
    token = raw.get("/api/auth/csrf").get_json()["csrf_token"]
    response = raw.post("/api/auth/register", json=payload, headers={"X-CSRF-Token": token})
    assert response.status_code == 400
    assert response.get_json() == {"error": message}


def test_register_without_json_body(app):
    raw = app.test_client()
    token = raw.get("/api/auth/csrf").get_json()["csrf_token"]
    response = raw.post("/api/auth/register", data="not json", headers={"X-CSRF-Token": token})
    assert response.status_code == 400


def test_password_is_hashed(app):
    raw = app.test_client()
    assert register_user(raw, "hash@example.com", "s3cret-pass").status_code == 201

    with app.app_context():
        from database import get_db
        row = get_db().execute("SELECT password_hash FROM users WHERE email = ?", ("hash@example.com",)).fetchone()
    assert row["password_hash"] != "s3cret-pass"
    assert "s3cret-pass" not in row["password_hash"]


def test_user_responses_never_contain_hashes(app, client):
    for response in (
        client.raw.get("/api/auth/me"),
        client.raw.get("/api/trips"),
    ):
        body = response.get_data(as_text=True)
        assert "password_hash" not in body
        assert "pbkdf2" not in body


def test_login_success_and_session_rotation(app):
    raw = app.test_client()
    assert register_user(raw, "login@example.com").status_code == 201

    # Fresh client, no session yet: login works after fetching a CSRF token.
    login_client = app.test_client()
    response = login_user(login_client, "LOGIN@example.com")
    assert response.status_code == 200
    body = response.get_json()
    assert body["email"] == "login@example.com"
    assert body["csrf_token"]
    assert login_client.get("/api/auth/me").get_json()["email"] == "login@example.com"


def test_login_rotates_csrf_token(app):
    raw = app.test_client()
    assert register_user(raw, "rotate@example.com").status_code == 201

    logged_out = app.test_client()
    pre_login = logged_out.get("/api/auth/csrf").get_json()["csrf_token"]
    response = login_user(logged_out, "rotate@example.com")
    assert response.status_code == 200
    assert response.get_json()["csrf_token"] != pre_login


@pytest.mark.parametrize("email, password", [
    ("missing@example.com", "password123"),
    ("login2@example.com", "wrong-password"),
    ("", "password123"),
    ("login2@example.com", ""),
])
def test_login_failures_do_not_reveal_accounts(app, email, password):
    raw = app.test_client()
    assert register_user(raw, "login2@example.com").status_code == 201

    attacker = app.test_client()
    token = attacker.get("/api/auth/csrf").get_json()["csrf_token"]
    response = attacker.post(
        "/api/auth/login",
        json={"email": email, "password": password},
        headers={"X-CSRF-Token": token},
    )
    if not email or not password:
        assert response.status_code == 400
    else:
        assert response.status_code == 401
        assert response.get_json() == {"error": "Invalid email or password"}
    assert attacker.get("/api/auth/me").status_code == 401


def test_logout_invalidates_session(app, client):
    assert client.get("/api/auth/me").status_code == 200
    response = client.post("/api/auth/logout")
    assert response.status_code == 200
    assert response.get_json()["message"] == "Logged out"
    assert response.get_json()["csrf_token"]
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/trips").status_code == 401


def test_me_unauthenticated(app):
    assert app.test_client().get("/api/auth/me").status_code == 401
    assert app.test_client().get("/api/auth/me").get_json() == {"error": "Authentication required"}


def test_unauthenticated_access_rejected(app, trip):
    raw = app.test_client()
    assert raw.get("/api/trips").status_code == 401
    assert raw.get(f"/api/trips/{trip['id']}").status_code == 401
    assert raw.get(f"/api/trips/{trip['id']}/activities").status_code == 401


def test_mutating_without_csrf_rejected(app, client):
    raw = client.raw
    # Same authenticated session, but no CSRF header.
    assert raw.post("/api/trips", json={}).status_code == 400
    assert raw.post("/api/trips", json={}).get_json() == {"error": "CSRF token missing or invalid"}


def test_mutating_with_wrong_csrf_rejected(app, client):
    response = client.raw.post("/api/trips", json={}, headers={"X-CSRF-Token": "bogus"})
    assert response.status_code == 400
    assert response.get_json() == {"error": "CSRF token missing or invalid"}


def test_logout_without_csrf_rejected(app, client):
    assert client.raw.post("/api/auth/logout").status_code == 400
    # Session must still be valid after the rejected logout.
    assert client.get("/api/auth/me").status_code == 200


def test_session_cookie_security_flags(app):
    raw = app.test_client()
    register_user(raw, "cookie@example.com")
    cookie = raw.get_cookie("session")
    assert cookie is not None
    assert cookie.http_only is True
    assert (cookie.same_site or "").lower() == "lax"


def test_production_requires_secret_key(monkeypatch, tmp_path):
    from app import create_app

    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError, match="SECRET_KEY must be set"):
        create_app(str(tmp_path / "prod.db"))

    monkeypatch.setenv("SECRET_KEY", "prod-secret-value")
    create_app(str(tmp_path / "prod2.db"))


def test_register_while_logged_in_is_rejected(app, client):
    before = user_count(app)
    me_before = client.get("/api/auth/me").get_json()

    response = client.post("/api/auth/register", json={
        "email": "second@example.com", "password": "password123",
    })
    assert response.status_code == 403
    assert response.get_json() == {
        "error": "Already logged in. Log out before creating a new account."
    }

    # No second account was created and the original session is untouched.
    assert user_count(app) == before
    assert client.get("/api/auth/me").get_json() == me_before
    assert client.get("/api/trips").status_code == 200


def test_anonymous_logout_is_rejected(app):
    raw = app.test_client()
    token = raw.get("/api/auth/csrf").get_json()["csrf_token"]
    response = raw.post("/api/auth/logout", headers={"X-CSRF-Token": token})
    assert response.status_code == 401
    assert response.get_json() == {"error": "Authentication required"}


def test_secure_cookie_in_production(monkeypatch, tmp_path):
    from app import create_app

    monkeypatch.setenv("SESSION_COOKIE_SECURE", "1")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    prod = create_app(str(tmp_path / "prod.db"), secret_key="prod-secret")
    raw = prod.test_client()
    register_user(raw, "prod@example.com")
    cookie = raw.get_cookie("session")
    assert cookie.secure is True

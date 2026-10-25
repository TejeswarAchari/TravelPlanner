import functools
import hmac
import secrets

from flask import jsonify, request, session

from database import get_db

CSRF_HEADER_NAMES = ("X-CSRF-Token", "X-CSRFToken")
CSRF_SESSION_KEY = "_csrf_token"
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def ensure_csrf_token():
    token = session.get(CSRF_SESSION_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        session[CSRF_SESSION_KEY] = token
    return token


def _submitted_csrf_token():
    for header in CSRF_HEADER_NAMES:
        value = request.headers.get(header)
        if value:
            return value
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        value = data.get("csrf_token")
        if isinstance(value, str) and value:
            return value
    return None


def validate_csrf():
    expected = session.get(CSRF_SESSION_KEY)
    submitted = _submitted_csrf_token()
    if not expected or not submitted:
        return False
    return hmac.compare_digest(str(expected), str(submitted))


def csrf_error():
    return jsonify(error="CSRF token missing or invalid"), 400


def establish_session(user_id):
    # Clear first so a rotated session cannot inherit stale state,
    # then store the new identity with a fresh CSRF token.
    session.clear()
    session["user_id"] = user_id
    session.permanent = True
    return ensure_csrf_token()


def destroy_session():
    session.clear()
    session.permanent = True
    return ensure_csrf_token()


def get_current_user():
    user_id = session.get("user_id")
    if user_id is None:
        return None
    row = get_db().execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row is not None else None


def login_required(view):
    @functools.wraps(view)
    def wrapper(*args, **kwargs):
        if get_current_user() is None:
            return jsonify(error="Authentication required"), 401
        return view(*args, **kwargs)

    return wrapper

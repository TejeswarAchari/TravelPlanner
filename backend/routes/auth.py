import sqlite3

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from auth import (
    destroy_session,
    ensure_csrf_token,
    establish_session,
    get_current_user,
    login_required,
)
from database import get_db
from models import find_user_by_email
from validation import validate_login, validate_registration

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.get("/csrf")
def get_csrf():
    return jsonify(csrf_token=ensure_csrf_token())


@bp.get("/me")
def me():
    user = get_current_user()
    if user is None:
        return jsonify(error="Authentication required"), 401
    return jsonify(user)


@bp.post("/register")
def register():
    if get_current_user() is not None:
        return jsonify(error="Already logged in. Log out before creating a new account."), 403

    data, error = validate_registration(request.get_json(silent=True))
    if error:
        return jsonify(error=error), 400

    db = get_db()
    if find_user_by_email(data["email"]) is not None:
        return jsonify(error="Email is already registered"), 409

    try:
        # pbkdf2:sha256 via Werkzeug: scrypt is unavailable on some
        # platform Pythons (e.g. macOS system Python without OpenSSL scrypt).
        cursor = db.execute(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)",
            (
                data["email"],
                generate_password_hash(data["password"], method="pbkdf2:sha256"),
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify(error="Email is already registered"), 409

    user_id = cursor.lastrowid
    csrf_token = establish_session(user_id)
    return jsonify(id=user_id, email=data["email"], csrf_token=csrf_token), 201


@bp.post("/login")
def login():
    data, error = validate_login(request.get_json(silent=True))
    if error:
        return jsonify(error=error), 400

    row = find_user_by_email(data["email"])
    if row is None or not check_password_hash(row["password_hash"], data["password"]):
        # Generic message: do not reveal whether the email exists.
        return jsonify(error="Invalid email or password"), 401

    csrf_token = establish_session(row["id"])
    return jsonify(id=row["id"], email=row["email"], csrf_token=csrf_token)


@bp.post("/logout")
@login_required
def logout():
    # destroy_session clears the identity and rotates the CSRF token; hand
    # the fresh token to the client so it never reuses the pre-logout one.
    csrf_token = destroy_session()
    return jsonify(message="Logged out", csrf_token=csrf_token)

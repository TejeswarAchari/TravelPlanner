import os
import secrets
import sqlite3
from datetime import timedelta

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

from auth import MUTATING_METHODS, csrf_error, validate_csrf
from database import close_db, init_db
from routes.activities import bp as activities_bp
from routes.auth import bp as auth_bp
from routes.trips import bp as trips_bp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _resolve_secret_key(explicit=None):
    if explicit:
        return explicit
    configured = os.environ.get("SECRET_KEY")
    if configured:
        return configured
    if os.environ.get("FLASK_ENV") == "production":
        raise RuntimeError(
            "SECRET_KEY must be set in production. "
            "Generate one with: python -c 'import secrets; print(secrets.token_hex(32))'"
        )
    # No hard-coded fallback: generate an ephemeral key so a missing
    # SECRET_KEY can never silently mean a publicly known secret. Local dev
    # keeps working, but sessions do not survive restarts until SECRET_KEY
    # is set (required in production).
    app_logger_warning = (
        "WARNING: SECRET_KEY is not set; using a random ephemeral key. "
        "Set SECRET_KEY for persistent sessions and production use. "
        "Generate one with: python -c 'import secrets; print(secrets.token_hex(32))'"
    )
    print(app_logger_warning)
    return secrets.token_hex(32)


def create_app(database_path=None, secret_key=None):
    app = Flask(__name__)
    app.config["DATABASE"] = database_path or os.environ.get(
        "DATABASE_PATH", os.path.join(BASE_DIR, "travelplanner.db")
    )
    app.secret_key = _resolve_secret_key(secret_key)

    # Session cookie hardening. Secure cookies are enabled in production
    # (FLASK_ENV=production or SESSION_COOKIE_SECURE=1) and left off for
    # plain-HTTP localhost development.
    secure_cookies = os.environ.get("FLASK_ENV") == "production" or os.environ.get(
        "SESSION_COOKIE_SECURE", ""
    ).lower() in ("1", "true", "yes")
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = secure_cookies
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)
    app.config["SESSION_REFRESH_EACH_REQUEST"] = True

    init_db(app.config["DATABASE"])

    app.teardown_appcontext(close_db)
    app.register_blueprint(auth_bp)
    app.register_blueprint(trips_bp)
    app.register_blueprint(activities_bp)

    @app.before_request
    def check_csrf():
        # Cookie sessions need CSRF protection on every state-changing API
        # call, including register/login/logout; SameSite=Lax alone is not
        # treated as sufficient. The token comes from GET /api/auth/csrf.
        if request.path.startswith("/api/") and request.method in MUTATING_METHODS:
            if not validate_csrf():
                return csrf_error()

    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        return jsonify(error=error.name), error.code

    @app.errorhandler(sqlite3.Error)
    def handle_database_error(error):
        app.logger.exception("Database error")
        return jsonify(error="Database error"), 500

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        app.logger.exception("Unexpected error")
        return jsonify(error="Internal server error"), 500

    return app


if __name__ == "__main__":
    create_app().run(debug=os.environ.get("FLASK_DEBUG") == "1")

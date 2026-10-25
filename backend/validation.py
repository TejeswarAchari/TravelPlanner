import math
import re
from datetime import datetime

# Each validate_* function returns (cleaned_values, error_message).
# Exactly one of the two is None.


MAX_ID = 2**63 - 1  # largest integer SQLite can store
MAX_BUDGET = 10**12

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_EMAIL_LENGTH = 254
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 256


def parse_id(value):
    if not (value.isascii() and value.isdigit()):
        return None
    number = int(value)
    return number if 0 < number <= MAX_ID else None


def parse_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def clean_text(data, key):
    value = data.get(key)
    return value.strip() if isinstance(value, str) else ""


def read_date(data, key, label):
    if not data.get(key):
        return None, f"{label} is required"
    parsed = parse_date(data[key])
    if parsed is None:
        return None, f"{label} must be a valid date (YYYY-MM-DD)"
    return parsed, None


def validate_trip(data):
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object"

    name = clean_text(data, "name")
    destination = clean_text(data, "destination")
    if not name:
        return None, "Name is required"
    if not destination:
        return None, "Destination is required"

    start_date, error = read_date(data, "start_date", "Start date")
    if error:
        return None, error
    end_date, error = read_date(data, "end_date", "End date")
    if error:
        return None, error
    if end_date < start_date:
        return None, "End date cannot be before start date"

    budget = data.get("budget")
    if budget in (None, ""):
        budget = 0
    if isinstance(budget, bool) or not isinstance(budget, (int, float)) or not math.isfinite(budget):
        return None, "Budget must be a number"
    if budget < 0:
        return None, "Budget cannot be negative"
    if budget > MAX_BUDGET:
        return None, "Budget is too large"

    trip = {
        "name": name,
        "destination": destination,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "budget": budget,
        "description": clean_text(data, "description"),
    }
    return trip, None


def normalize_email(value):
    return value.strip().lower() if isinstance(value, str) else ""


def validate_registration(data):
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object"

    email = normalize_email(data.get("email"))
    if not email:
        return None, "Email is required"
    if len(email) > MAX_EMAIL_LENGTH or not EMAIL_RE.match(email):
        return None, "Email must be a valid email address"

    password = data.get("password")
    if not isinstance(password, str) or not password:
        return None, "Password is required"
    if len(password) < MIN_PASSWORD_LENGTH:
        return None, "Password must be at least 8 characters"
    if len(password) > MAX_PASSWORD_LENGTH:
        return None, "Password must be at most 256 characters"

    return {"email": email, "password": password}, None


def validate_login(data):
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object"
    email = normalize_email(data.get("email"))
    password = data.get("password")
    if not email or not isinstance(password, str) or not password:
        return None, "Email and password are required"
    if len(email) > MAX_EMAIL_LENGTH:
        return None, "Email and password are required"
    return {"email": email, "password": password}, None


def validate_activity(data, trip):
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object"

    title = clean_text(data, "title")
    if not title:
        return None, "Title is required"

    activity_date, error = read_date(data, "date", "Date")
    if error:
        return None, error
    if not parse_date(trip["start_date"]) <= activity_date <= parse_date(trip["end_date"]):
        return None, "Activity date must be within the trip dates"

    time = clean_text(data, "time")
    if time:
        try:
            time = datetime.strptime(time, "%H:%M").strftime("%H:%M")
        except ValueError:
            return None, "Time must be in HH:MM format"

    activity = {
        "title": title,
        "date": activity_date.isoformat(),
        "time": time,
        "location": clean_text(data, "location"),
        "notes": clean_text(data, "notes"),
    }
    return activity, None

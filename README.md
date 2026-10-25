# TravelPlanner

A simple travel planning application built with React and Flask.

A small travel planning app. Create trips, keep an itinerary of activities for each one, and search or filter your trips by status.

## Features

- User accounts: register, log in and log out
- Create, view, edit and delete trips (each user only sees their own trips)
- Add, edit and delete activities for a trip
- Itinerary grouped by date
- Search trips by name or destination
- Filter trips by status: upcoming, ongoing, completed (calculated from the trip dates)

## Tech stack

- Frontend: React, Vite, Tailwind CSS, React Router
- Backend: Python, Flask
- Database: SQLite (created automatically on first run)
- Tests: pytest (backend), Vitest + Testing Library (frontend)

## Project structure

```
TravelPlanner/
├── backend/
│   ├── app.py            # Flask app, error handlers
│   ├── database.py       # SQLite connection and schema
│   ├── models.py         # Trip status, row helpers, lookups
│   ├── validation.py     # Request validation
│   ├── routes/
│   │   ├── trips.py
│   │   └── activities.py
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/   # TripForm, ActivityForm, Itinerary, StatusBadge
│       ├── pages/        # Trips list, new/edit trip, trip details
│       ├── services/     # api.js (calls to the Flask API)
│       ├── App.jsx
│       └── main.jsx
├── README.md
└── LICENSE
```

## Requirements

- Python 3.10+
- Node.js 22.12 or newer, and npm

## Installation

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Frontend:

```bash
cd frontend
npm install
```

## Running the app

Start Flask (http://127.0.0.1:5000):

```bash
cd backend
python app.py
```

Start React (http://localhost:5173):

```bash
cd frontend
npm run dev
```

The Vite dev server proxies `/api` requests to Flask, so start both. Open http://localhost:5173.

The SQLite database is stored in `backend/travelplanner.db`. Set the `DATABASE_PATH` environment variable to use a different file. Set `FLASK_DEBUG=1` to run Flask with auto-reload.

## API

Authentication

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| POST | `/api/auth/register` | Create an account (`email`, `password` ≥ 8 chars). Returns the user plus a fresh `csrf_token`; also logs the session in. Rejected with `403` when already logged in |
| POST | `/api/auth/login` | Verify credentials and establish a session. Returns the user plus a fresh `csrf_token` |
| POST | `/api/auth/logout` | Invalidate the session. Returns a fresh `csrf_token` for the anonymous session. Requires an authenticated session (`401` otherwise) |
| GET | `/api/auth/me` | Return the logged-in user (`{id, email}`), or `401` |
| GET | `/api/auth/csrf` | Return a CSRF token for state-changing requests (`{csrf_token}`) |

Unauthenticated requests get `401`. Invalid input gets `400`, duplicate
registration `409`, and trips/activities belonging to another user (or not
existing) get `404` so ownership is never disclosed. Every `POST`/`PUT`/
`PATCH`/`DELETE` under `/api/` must send the CSRF token in the
`X-CSRF-Token` header (the frontend does this automatically).

Trip responses never expose the internal owner id (`user_id` stays
server-side for authorization queries). When a protected request fails with
`401` because the session expired, the frontend clears its auth state and
redirects to login, preserving the full destination (path, query and hash)
so the user can return after signing in.

Trips

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/trips` | List trips. Optional `?search=goa` and `?status=upcoming` (`upcoming`, `ongoing`, `completed`) |
| POST | `/api/trips` | Create a trip |
| GET | `/api/trips/<id>` | Get a trip |
| PUT | `/api/trips/<id>` | Update a trip (send all fields). Rejected with 400 if its activities would fall outside the new dates |
| DELETE | `/api/trips/<id>` | Delete a trip and its activities |

Activities

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/trips/<trip_id>/activities` | List a trip's activities, ordered by date and time |
| POST | `/api/trips/<trip_id>/activities` | Add an activity |
| PUT | `/api/activities/<id>` | Update an activity |
| DELETE | `/api/activities/<id>` | Delete an activity |

Errors are returned as JSON, for example `{"error": "End date cannot be before start date"}`, with status 400 (invalid input), 404 (not found) or 500 (server error).

Example trip:

```json
{
  "name": "Goa Trip",
  "destination": "Goa",
  "start_date": "2026-11-10",
  "end_date": "2026-11-14",
  "budget": 20000,
  "description": "Weekend trip with friends"
}
```

Example activity (its date must fall within the trip dates; `time` is optional, `HH:MM`):

```json
{
  "title": "Visit Baga Beach",
  "date": "2026-11-10",
  "time": "10:00",
  "location": "Baga Beach",
  "notes": "Spend the morning at the beach"
}
```

## Authentication and configuration

Auth is session-based. The Flask backend sets an `HttpOnly`, `SameSite=Lax`
session cookie (no tokens in `localStorage`); passwords are stored only as
Werkzeug PBKDF2 hashes and are never returned by the API. CSRF tokens are
required on all state-changing API calls; the React frontend fetches one
from `/api/auth/csrf`, sends it as `X-CSRF-Token`, and refreshes it
automatically when the session rotates (login, logout, register).

Required environment variables:

| Variable | Purpose |
| -------- | ------- |
| `SECRET_KEY` | Flask session secret. Mandatory when `FLASK_ENV=production`; in local dev a random ephemeral key is used if it is unset (sessions then do not survive restarts) |
| `SESSION_COOKIE_SECURE` | Set to `1` when serving over HTTPS so the cookie is marked `Secure`. Leave off for plain-HTTP localhost |
| `DATABASE_PATH` | Optional SQLite file (default `backend/travelplanner.db`) |
| `FLASK_DEBUG` | Set to `1` for auto-reload |

Generate a secret with:

```bash
python -c 'import secrets; print(secrets.token_hex(32))'
```

See [.env.example](.env.example) for a template. Never commit real secrets;
`.env` files are git-ignored.

Existing databases are migrated in place on startup: a `users` table is
created and `trips` gains an owner (`user_id`) column. Existing trips and
activities are preserved, and trips created before authentication stay
unowned (`user_id IS NULL`) so they are never exposed to any account.
New trips are always owned by the logged-in user; the server ignores any
client-supplied user id.

Production checklist: serve over HTTPS, set `SECRET_KEY` and
`SESSION_COOKIE_SECURE=1`, and keep the SQLite file outside the web root.
Never enable `FLASK_DEBUG=1` (or the Werkzeug debugger generally) in
production: the interactive debugger allows arbitrary code execution.

Explicitly not yet production-hardened: there is no login rate limiting or
account lockout, and no server-side session revocation list or absolute
session expiry (sessions refresh on each request while in use, and only
password-less logout invalidates the cookie). Add a rate limiter (e.g. on
the login/register endpoints) and session revocation/absolute expiry before
exposing the app to untrusted networks.

## Running tests

```bash
cd backend
pytest
```

Backend tests cover trips, activities, authentication (`test_auth.py`),
per-user authorization isolation (`test_authorization.py`) and legacy
database migration (`test_migration.py`).

```bash
cd frontend
npm test
```

Frontend tests cover the session/CSRF API client, auth state, login and
registration pages (validation, failed submissions, destination restore,
logout) and protected-route redirects.

## Building the frontend

```bash
cd frontend
npm run build
```

## License

MIT, see [LICENSE](LICENSE).

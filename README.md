# TravelPlanner

A simple travel planning application built with React and Flask.

A small travel planning app. Create trips, keep an itinerary of activities for each one, and search or filter your trips by status.

## Features

- Create, view, edit and delete trips
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

Activities in the same trip cannot share a date and specified time. Activities without a time are treated as unscheduled and may share a date with other activities.

## Running tests

```bash
cd backend
pytest
```

```bash
cd frontend
npm test
```

## Building the frontend

```bash
cd frontend
npm run build
```

## License

MIT, see [LICENSE](LICENSE).

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createActivity,
  deleteActivity,
  deleteTrip,
  getActivities,
  getTrip,
  updateActivity,
} from "../services/api.js";
import { formatBudget, formatDate } from "../format.js";
import StatusBadge from "../components/StatusBadge.jsx";
import ActivityForm from "../components/ActivityForm.jsx";
import Itinerary from "../components/Itinerary.jsx";

export default function TripDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState("");
  // null = form hidden, {} = adding a new activity, otherwise the activity being edited
  const [formActivity, setFormActivity] = useState(null);

  useEffect(() => {
    Promise.all([getTrip(id), getActivities(id)])
      .then(([tripData, activityData]) => {
        setTrip(tripData);
        setActivities(activityData);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  async function reloadActivities() {
    setActivities(await getActivities(id));
  }

  async function handleSaveActivity(activity) {
    if (formActivity.id) {
      await updateActivity(formActivity.id, activity);
    } else {
      await createActivity(id, activity);
    }
    await reloadActivities();
    setFormActivity(null);
  }

  async function handleDeleteActivity(activity) {
    if (!window.confirm(`Delete "${activity.title}"?`)) return;
    setError("");
    try {
      await deleteActivity(activity.id);
      await reloadActivities();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteTrip() {
    if (!window.confirm(`Delete "${trip.name}" and all its activities?`)) return;
    setError("");
    try {
      await deleteTrip(id);
      navigate("/");
    } catch {
      setError("Unable to delete the trip. Please try again.");
    }
  }

  if (!trip) {
    return error ? (
      <div>
        <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          Back to trips
        </Link>
      </div>
    ) : (
      <p className="text-sm text-gray-500">Loading...</p>
    );
  }

  return (
    <div>
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        ← All trips
      </Link>

      {error && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <p className="text-gray-600">{trip.destination}</p>
        </div>
        <div className="flex gap-3">
          <Link to={`/trips/${id}/edit`} className="rounded border border-gray-300 px-4 py-2 text-sm">
            Edit trip
          </Link>
          <button
            onClick={handleDeleteTrip}
            className="rounded border border-red-300 px-4 py-2 text-sm text-red-700"
          >
            Delete trip
          </button>
        </div>
      </div>

      <dl className="mt-4 grid gap-4 rounded border border-gray-200 bg-white p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-gray-500">Status</dt>
          <dd className="mt-1">
            <StatusBadge status={trip.status} />
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Dates</dt>
          <dd className="mt-1">
            {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Budget</dt>
          <dd className="mt-1">{formatBudget(trip.budget)}</dd>
        </div>
        {trip.description && (
          <div className="sm:col-span-4">
            <dt className="text-gray-500">Description</dt>
            <dd className="mt-1">{trip.description}</dd>
          </div>
        )}
      </dl>

      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Itinerary</h2>
        {!formActivity && (
          <button
            onClick={() => setFormActivity({})}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Add activity
          </button>
        )}
      </div>

      {formActivity && (
        <div className="mb-5">
          <ActivityForm
            key={formActivity.id || "new"}
            initialActivity={formActivity.id ? formActivity : undefined}
            minDate={trip.start_date}
            maxDate={trip.end_date}
            submitLabel={formActivity.id ? "Save activity" : "Add activity"}
            onSubmit={handleSaveActivity}
            onCancel={() => setFormActivity(null)}
          />
        </div>
      )}

      <Itinerary activities={activities} onEdit={setFormActivity} onDelete={handleDeleteActivity} />
    </div>
  );
}

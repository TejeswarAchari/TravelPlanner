import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTrips } from "../services/api.js";
import { formatBudget, formatDate } from "../format.js";
import StatusBadge from "../components/StatusBadge.jsx";

export default function TripsPage() {
  const [trips, setTrips] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filters = [
    { label: "All Trips", value: "" },
    { label: "Upcoming", value: "upcoming" },
    { label: "Ongoing", value: "ongoing" },
    { label: "Completed", value: "completed" },
  ];

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    getTrips({ search, status })
      .then((data) => {
        if (ignore) return;
        setTrips(data);
        setError("");
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [search, status]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Trips</h1>
        <Link to="/trips/new" className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
          Add Trip
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <input
          type="search"
          placeholder="Search by name or destination"
          aria-label="Search trips"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded border border-gray-300 bg-white px-3 py-2"
        />
        <div role="group" aria-label="Filter trips by status" className="flex flex-wrap gap-2">
          {filters.map((filter) => {
            const selected = status === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setStatus(filter.value)}
                className={`rounded border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {!loading && !error && trips.length === 0 && (
        <p className="text-gray-500">
          {search.trim()
            ? status
              ? `No ${status} trips match your search.`
              : "No trips match your search."
            : status
              ? `No ${status} trips found.`
              : "No trips found."}
        </p>
      )}

      {trips.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link
                to={`/trips/${trip.id}`}
                className="flex flex-col gap-2 p-4 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{trip.name}</p>
                  <p className="text-sm text-gray-600">{trip.destination}</p>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>
                    {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                  </span>
                  <span>{formatBudget(trip.budget)}</span>
                  <StatusBadge status={trip.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

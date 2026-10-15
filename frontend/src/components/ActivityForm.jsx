import { useState } from "react";

const emptyActivity = { title: "", date: "", time: "", location: "", notes: "" };

const inputClass = "mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2";
const conflictMessage =
  "An activity is already scheduled at this date and time. Choose a different time.";

// minDate / maxDate are the trip's start and end dates.
export default function ActivityForm({
  initialActivity = emptyActivity,
  activities = [],
  minDate,
  maxDate,
  submitLabel,
  onSubmit,
  onCancel,
}) {
  const [activity, setActivity] = useState(initialActivity);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const hasScheduleConflict =
    activity.date &&
    activity.time &&
    activities.some(
      (existing) =>
        existing.id !== initialActivity.id &&
        existing.date === activity.date &&
        existing.time === activity.time
    );

  function handleChange(event) {
    setActivity({ ...activity, [event.target.name]: event.target.value });
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSubmit(activity);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded border border-gray-200 bg-white p-4">
      {(hasScheduleConflict ? conflictMessage : error) && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {hasScheduleConflict ? conflictMessage : error}
        </p>
      )}

      <label className="block text-sm font-medium">
        Activity title
        <input name="title" value={activity.title} onChange={handleChange} required className={inputClass} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Date
          <input
            type="date"
            name="date"
            value={activity.date}
            min={minDate}
            max={maxDate}
            onChange={handleChange}
            required
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium">
          Time
          <input type="time" name="time" value={activity.time} onChange={handleChange} className={inputClass} />
        </label>
      </div>

      <label className="block text-sm font-medium">
        Location
        <input name="location" value={activity.location} onChange={handleChange} className={inputClass} />
      </label>

      <label className="block text-sm font-medium">
        Notes
        <textarea name="notes" value={activity.notes} onChange={handleChange} rows="2" className={inputClass} />
      </label>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || hasScheduleConflict}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-gray-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

import { useEffect, useState } from "react";
import { formatDate } from "../format.js";
import Itinerary from "./Itinerary.jsx";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateFromString(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCalendarDates(month) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((firstDay.getDay() + daysInMonth) / 7) * 7;
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - firstDay.getDay());

  return Array.from({ length: cellCount }, (_, index) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
  );
}

function dateLabel(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function ItineraryCalendar({ activities, startDate, focusRequest, onEdit, onDelete }) {
  const [selectedDate, setSelectedDate] = useState(() => activities[0]?.date ?? startDate);
  const [displayMonth, setDisplayMonth] = useState(() => {
    const selected = dateFromString(activities[0]?.date ?? startDate);
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });

  useEffect(() => {
    if (!focusRequest) return;
    const focusedDate = dateFromString(focusRequest.date);
    setSelectedDate(focusRequest.date);
    setDisplayMonth(new Date(focusedDate.getFullYear(), focusedDate.getMonth(), 1));
  }, [focusRequest]);

  const activitiesByDate = new Map();
  for (const activity of activities) {
    activitiesByDate.set(activity.date, (activitiesByDate.get(activity.date) ?? 0) + 1);
  }

  const selectedActivities = activities.filter((activity) => activity.date === selectedDate);
  const calendarDates = getCalendarDates(displayMonth);
  const monthLabel = displayMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  function changeMonth(offset) {
    setDisplayMonth((month) => new Date(month.getFullYear(), month.getMonth() + offset, 1));
  }

  function goToToday() {
    const today = new Date();
    const todayKey = dateKey(today);
    setSelectedDate(todayKey);
    setDisplayMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function selectDate(date) {
    const nextDate = dateKey(date);
    setSelectedDate(nextDate);
    if (date.getMonth() !== displayMonth.getMonth() || date.getFullYear() !== displayMonth.getFullYear()) {
      setDisplayMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  return (
    <div className="space-y-5">
      <section aria-label="Itinerary calendar" className="rounded border border-gray-200 bg-white p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold" aria-live="polite">
            {monthLabel}
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => changeMonth(-1)}
              className="rounded border border-gray-300 px-2.5 py-1.5 text-sm hover:bg-gray-50"
            >
              <span aria-hidden="true">←</span>
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => changeMonth(1)}
              className="rounded border border-gray-300 px-2.5 py-1.5 text-sm hover:bg-gray-50"
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <table className="w-full table-fixed border-collapse text-center text-sm">
          <thead>
            <tr>
              {weekdays.map((weekday) => (
                <th key={weekday} scope="col" className="py-2 text-xs font-medium text-gray-500 sm:text-sm">
                  {weekday}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: calendarDates.length / 7 }, (_, weekIndex) => (
              <tr key={`${monthLabel}-${weekIndex}`}>
                {calendarDates.slice(weekIndex * 7, weekIndex * 7 + 7).map((date) => {
                  const key = dateKey(date);
                  const activityCount = activitiesByDate.get(key) ?? 0;
                  const isSelected = key === selectedDate;
                  const isDisplayedMonth =
                    date.getMonth() === displayMonth.getMonth() && date.getFullYear() === displayMonth.getFullYear();

                  return (
                    <td key={key} className="p-0.5 sm:p-1">
                      <button
                        type="button"
                        aria-label={`${dateLabel(date)}${activityCount ? `, ${activityCount} ${activityCount === 1 ? "activity" : "activities"}` : ""}`}
                        aria-pressed={isSelected}
                        onClick={() => selectDate(date)}
                        className={`flex min-h-10 w-full flex-col items-center justify-center rounded text-sm ${
                          isSelected
                            ? "bg-blue-600 font-semibold text-white"
                            : isDisplayedMonth
                              ? "text-gray-800 hover:bg-blue-50"
                              : "text-gray-400 hover:bg-gray-50"
                        }`}
                      >
                        <span>{date.getDate()}</span>
                        {activityCount > 0 && (
                          <span
                            aria-hidden="true"
                            className={`mt-0.5 size-1.5 rounded-full ${isSelected ? "bg-white" : "bg-blue-600"}`}
                          />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-label={`Activities for ${formatDate(selectedDate)}`}>
        <h3 className="mb-2 text-base font-semibold text-gray-800">
          Activities · {formatDate(selectedDate)}
        </h3>
        <Itinerary
          activities={selectedActivities}
          onEdit={onEdit}
          onDelete={onDelete}
          emptyMessage={`No activities scheduled for ${formatDate(selectedDate)}.`}
        />
      </section>
    </div>
  );
}

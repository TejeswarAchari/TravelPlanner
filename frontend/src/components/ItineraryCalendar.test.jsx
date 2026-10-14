import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ItineraryCalendar from "./ItineraryCalendar.jsx";

const activities = [
  { id: 1, title: "Beach", date: "2026-11-10", time: "10:00", location: "Baga", notes: "" },
  { id: 2, title: "Dinner", date: "2026-11-10", time: "20:00", location: "", notes: "" },
  { id: 3, title: "Fort visit", date: "2026-11-11", time: "", location: "", notes: "" },
];

describe("ItineraryCalendar", () => {
  it("shows the correct month, weekday alignment, and scheduled-activity markers", () => {
    render(<ItineraryCalendar activities={activities} startDate="2026-11-01" />);

    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    const sundayHeader = screen.getByRole("columnheader", { name: "Sun" });
    const firstDate = screen.getByRole("button", { name: "November 1, 2026" });
    expect(firstDate.closest("td").cellIndex).toBe(sundayHeader.cellIndex);
    expect(screen.getByRole("button", { name: "November 10, 2026, 2 activities" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("shows all activities on their date and preserves activity ordering", async () => {
    render(<ItineraryCalendar activities={activities} startDate="2026-11-01" />);

    await userEvent.click(screen.getByRole("button", { name: "November 11, 2026, 1 activity" }));

    const selectedActivities = screen.getByRole("region", { name: "Activities for 11 Nov 2026" });
    expect(within(selectedActivities).getByText("Fort visit")).toBeInTheDocument();
    expect(within(selectedActivities).queryByText("Beach")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "November 11, 2026, 1 activity" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await userEvent.click(screen.getByRole("button", { name: "November 10, 2026, 2 activities" }));
    const sameDayActivities = screen.getByRole("region", { name: "Activities for 10 Nov 2026" });
    expect(within(sameDayActivities).getByText("Beach")).toBeInTheDocument();
    expect(within(sameDayActivities).getByText("Dinner")).toBeInTheDocument();
    const activityItems = within(sameDayActivities).getAllByRole("listitem");
    expect(activityItems[0]).toHaveTextContent("Beach");
    expect(activityItems[1]).toHaveTextContent("Dinner");
  });

  it("shows a date-specific empty state when the selected date has no activities", async () => {
    render(<ItineraryCalendar activities={activities} startDate="2026-11-01" />);

    await userEvent.click(screen.getByRole("button", { name: "November 12, 2026" }));
    expect(screen.getByText("No activities scheduled for 12 Nov 2026.")).toBeInTheDocument();
  });

  it("navigates across December and January and selects adjacent-month dates", async () => {
    render(<ItineraryCalendar activities={[]} startDate="2026-12-15" />);

    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "January 2027" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("heading", { name: "December 2026" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "January 1, 2027" }));
    expect(screen.getByRole("heading", { name: "January 2027" })).toBeInTheDocument();
    expect(screen.getByText("No activities scheduled for 1 Jan 2027.")).toBeInTheDocument();
  });

  it("returns to today's month and selects today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 25));

    try {
      render(<ItineraryCalendar activities={[]} startDate="2026-10-01" />);

      fireEvent.click(screen.getByRole("button", { name: "Today" }));
      expect(screen.getByRole("heading", { name: "December 2026" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "December 25, 2026" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("heading", { name: "Activities · 25 Dec 2026" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("handles date-only activity strings without shifting the scheduled day", () => {
    render(<ItineraryCalendar activities={activities} startDate="2026-11-01" />);

    expect(screen.getByRole("button", { name: "November 10, 2026, 2 activities" })).toBeInTheDocument();
    expect(screen.getByText("Beach")).toBeInTheDocument();
  });

  it("shows an empty date selection for trips with no activities", () => {
    render(<ItineraryCalendar activities={[]} startDate="2026-11-10" />);

    expect(screen.getByText("No activities scheduled for 10 Nov 2026.")).toBeInTheDocument();
  });

  it("keeps activities visible when they fall outside the trip's nominal date range", () => {
    const outOfRangeActivity = {
      id: 4,
      title: "Late checkout",
      date: "2026-12-03",
      time: "",
      location: "",
      notes: "",
    };
    render(<ItineraryCalendar activities={[outOfRangeActivity]} startDate="2026-11-10" />);

    expect(screen.getByRole("heading", { name: "December 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "December 3, 2026, 1 activity" })).toBeInTheDocument();
    expect(screen.getByText("Late checkout")).toBeInTheDocument();
  });

  it("passes edit and delete actions through to the existing itinerary renderer", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<ItineraryCalendar activities={activities} startDate="2026-11-01" onEdit={onEdit} onDelete={onDelete} />);

    await userEvent.click(screen.getAllByText("Edit")[0]);
    await userEvent.click(screen.getAllByText("Delete")[1]);

    expect(onEdit).toHaveBeenCalledWith(activities[0]);
    expect(onDelete).toHaveBeenCalledWith(activities[1]);
  });
});

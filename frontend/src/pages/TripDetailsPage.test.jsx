import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TripDetailsPage from "./TripDetailsPage.jsx";
import { createActivity, deleteActivity, getActivities, getTrip, updateActivity } from "../services/api.js";

vi.mock("../services/api.js", () => ({
  createActivity: vi.fn(),
  deleteActivity: vi.fn(),
  deleteTrip: vi.fn(),
  getActivities: vi.fn(),
  getTrip: vi.fn(),
  updateActivity: vi.fn(),
}));

const trip = {
  id: 1,
  name: "Goa Trip",
  destination: "Goa",
  start_date: "2026-11-10",
  end_date: "2026-11-14",
  budget: 20000,
  status: "upcoming",
};

const activities = [
  { id: 1, title: "Beach", date: "2026-11-10", time: "10:00", location: "Baga", notes: "" },
  { id: 2, title: "Dinner", date: "2026-11-10", time: "20:00", location: "", notes: "" },
  { id: 3, title: "Fort visit", date: "2026-11-11", time: "", location: "", notes: "" },
];

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/trips/1"]}>
      <Routes>
        <Route path="/trips/:id" element={<TripDetailsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TripDetailsPage itinerary views", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    getTrip.mockResolvedValue(trip);
    getActivities.mockResolvedValue(activities);
  });

  it("defaults to list view, switches to calendar, and returns to the original itinerary", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Itinerary" })).toBeInTheDocument();
    const listView = screen.getByRole("button", { name: "List view" });
    const calendarView = screen.getByRole("button", { name: "Calendar view" });
    expect(listView).toHaveAttribute("aria-pressed", "true");
    expect(calendarView).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: "10 Nov 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "November 2026" })).not.toBeInTheDocument();

    await userEvent.click(calendarView);
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    expect(calendarView).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Add activity" })).toBeInTheDocument();

    await userEvent.click(listView);
    expect(screen.queryByRole("heading", { name: "November 2026" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "10 Nov 2026",
      "11 Nov 2026",
    ]);
    expect(screen.getByText("Beach")).toBeInTheDocument();
    expect(screen.getByText("Fort visit")).toBeInTheDocument();
    await userEvent.click(screen.getAllByText("Edit")[0]);
    expect(screen.getByLabelText("Activity title")).toHaveValue("Beach");
  });

  it("allows editing and deleting an activity while the calendar date is selected", async () => {
    getActivities.mockResolvedValueOnce(activities).mockResolvedValueOnce(activities.slice(0, 2));
    deleteActivity.mockResolvedValue({});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Calendar view" }));
    await userEvent.click(screen.getByRole("button", { name: "November 11, 2026, 1 activity" }));
    await userEvent.click(screen.getAllByText("Edit")[0]);
    expect(screen.getByLabelText("Activity title")).toHaveValue("Fort visit");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getAllByText("Delete")[0]);
    await waitFor(() => expect(deleteActivity).toHaveBeenCalledWith(3));
    await waitFor(() => expect(screen.queryByText("Fort visit")).not.toBeInTheDocument());
    expect(screen.getByText("No activities scheduled for 11 Nov 2026.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "November 10, 2026, 2 activities" }));
    expect(screen.getByText("Dinner")).toBeInTheDocument();
  });

  it("focuses the saved date after creating an activity in Calendar view", async () => {
    const extendedTrip = { ...trip, start_date: "2026-10-01", end_date: "2027-01-10" };
    const createdActivity = {
      id: 4,
      title: "Museum visit",
      date: "2027-01-04",
      time: "09:00",
      location: "Goa Museum",
      notes: "",
    };
    getTrip.mockResolvedValue(extendedTrip);
    getActivities.mockResolvedValueOnce(activities).mockResolvedValueOnce([...activities, createdActivity]);
    createActivity.mockResolvedValue(createdActivity);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Calendar view" }));
    await userEvent.click(screen.getByRole("button", { name: "November 12, 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "Add activity" }));
    await userEvent.type(screen.getByLabelText("Activity title"), "Museum visit");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2027-01-04" } });
    await userEvent.click(
      within(screen.getByLabelText("Activity title").closest("form")).getByRole("button", { name: "Add activity" })
    );

    await waitFor(() =>
      expect(createActivity).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({ title: "Museum visit", date: "2027-01-04" })
      )
    );
    expect(await screen.findByRole("heading", { name: "January 2027" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "January 4, 2027, 1 activity" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("Museum visit")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("focuses the new date after editing an activity", async () => {
    const extendedTrip = { ...trip, start_date: "2026-10-01", end_date: "2027-01-10" };
    const movedActivity = { ...activities[2], date: "2027-01-04" };
    getTrip.mockResolvedValue(extendedTrip);
    getActivities.mockResolvedValueOnce(activities).mockResolvedValueOnce([activities[0], activities[1], movedActivity]);
    updateActivity.mockResolvedValue(movedActivity);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Calendar view" }));
    await userEvent.click(screen.getByRole("button", { name: "November 11, 2026, 1 activity" }));
    await userEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2027-01-04" } });
    await userEvent.click(screen.getByRole("button", { name: "November 12, 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "Save activity" }));

    await waitFor(() =>
      expect(updateActivity).toHaveBeenCalledWith(3, expect.objectContaining({ date: "2027-01-04" }))
    );
    expect(await screen.findByRole("heading", { name: "January 2027" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "January 4, 2027, 1 activity" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("Fort visit")).toBeInTheDocument();
  });

  it("keeps the calendar selection unchanged when an activity save fails", async () => {
    const extendedTrip = { ...trip, start_date: "2026-10-01", end_date: "2027-01-10" };
    getTrip.mockResolvedValue(extendedTrip);
    getActivities.mockResolvedValueOnce(activities);
    createActivity.mockRejectedValueOnce(new Error("Save denied"));
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Calendar view" }));
    await userEvent.click(screen.getByRole("button", { name: "November 12, 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "Add activity" }));
    await userEvent.type(screen.getByLabelText("Activity title"), "Unscheduled activity");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2027-01-04" } });
    await userEvent.click(
      within(screen.getByLabelText("Activity title").closest("form")).getByRole("button", { name: "Add activity" })
    );

    expect(await screen.findByText("Save denied")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "November 12, 2026" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "January 2027" })).not.toBeInTheDocument();
  });
});

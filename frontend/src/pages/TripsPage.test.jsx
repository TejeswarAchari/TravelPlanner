import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TripsPage from "./TripsPage.jsx";
import { getTrips } from "../services/api.js";

vi.mock("../services/api.js");

const trips = [
  {
    id: 1,
    name: "Goa Trip",
    destination: "Goa",
    start_date: "2026-11-10",
    end_date: "2026-11-14",
    budget: 20000,
    status: "upcoming",
  },
  {
    id: 2,
    name: "Tokyo Trip",
    destination: "Japan",
    start_date: "2026-10-10",
    end_date: "2026-10-14",
    budget: 50000,
    status: "ongoing",
  },
  {
    id: 3,
    name: "Rome Trip",
    destination: "Italy",
    start_date: "2026-09-10",
    end_date: "2026-09-14",
    budget: 30000,
    status: "completed",
  },
];

function renderPage() {
  render(
    <MemoryRouter>
      <TripsPage />
    </MemoryRouter>
  );
}

function mockFilteredTrips() {
  getTrips.mockImplementation(({ search = "", status = "" } = {}) => {
    const normalizedSearch = search.toLowerCase();
    return Promise.resolve(
      trips.filter((trip) => {
        const matchesStatus = !status || trip.status === status;
        const matchesSearch =
          !normalizedSearch ||
          trip.name.toLowerCase().includes(normalizedSearch) ||
          trip.destination.toLowerCase().includes(normalizedSearch);
        return matchesStatus && matchesSearch;
      })
    );
  });
}

describe("TripsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists trips with their details", async () => {
    getTrips.mockResolvedValue([trips[0]]);
    renderPage();

    expect(await screen.findByText("Goa Trip")).toBeInTheDocument();
    expect(screen.getByText("₹20,000")).toBeInTheDocument();
    expect(screen.getByText("upcoming")).toBeInTheDocument();
  });

  it("renders the status filters with All Trips selected by default", async () => {
    getTrips.mockResolvedValue(trips);
    renderPage();

    const group = screen.getByRole("group", { name: "Filter trips by status" });
    const allTripsButton = screen.getByRole("button", { name: "All Trips" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upcoming" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ongoing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Completed" })).toBeInTheDocument();
    expect(allTripsButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Upcoming" })).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByText("Goa Trip")).toBeInTheDocument();
  });

  it.each([
    ["Upcoming", "upcoming", "Goa Trip", "Tokyo Trip"],
    ["Ongoing", "ongoing", "Tokyo Trip", "Goa Trip"],
    ["Completed", "completed", "Rome Trip", "Goa Trip"],
  ])("shows only %s trips when selected", async (label, status, expectedTrip, excludedTrip) => {
    mockFilteredTrips();
    renderPage();
    await screen.findByText("Goa Trip");

    await userEvent.click(screen.getByRole("button", { name: label }));

    expect(await screen.findByText(expectedTrip)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(excludedTrip)).not.toBeInTheDocument());
    expect(getTrips).toHaveBeenLastCalledWith({ search: "", status });
    expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
  });

  it("restores all trips when All Trips is selected", async () => {
    mockFilteredTrips();
    renderPage();
    await screen.findByText("Goa Trip");
    await userEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    await waitFor(() => expect(screen.queryByText("Tokyo Trip")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "All Trips" }));

    expect(await screen.findByText("Tokyo Trip")).toBeInTheDocument();
    expect(screen.getByText("Rome Trip")).toBeInTheDocument();
    expect(getTrips).toHaveBeenLastCalledWith({ search: "", status: "" });
  });

  it("applies search together with the selected status filter", async () => {
    mockFilteredTrips();
    renderPage();
    await screen.findByText("Goa Trip");
    await userEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    await userEvent.type(screen.getByLabelText("Search trips"), "goa");

    expect(await screen.findByText("Goa Trip")).toBeInTheDocument();
    await waitFor(() => expect(getTrips).toHaveBeenLastCalledWith({ search: "goa", status: "upcoming" }));
    expect(screen.queryByText("Tokyo Trip")).not.toBeInTheDocument();
    expect(screen.queryByText("Rome Trip")).not.toBeInTheDocument();
  });

  it("shows a message when no trips are found", async () => {
    getTrips.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No trips found.")).toBeInTheDocument();
  });

  it("shows a status- and search-specific empty state", async () => {
    mockFilteredTrips();
    renderPage();
    await screen.findByText("Goa Trip");
    await userEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    await userEvent.type(screen.getByLabelText("Search trips"), "missing");

    expect(await screen.findByText("No upcoming trips match your search.")).toBeInTheDocument();
  });

  it("shows the error when loading fails", async () => {
    getTrips.mockRejectedValue(new Error("Database error"));
    renderPage();
    expect(await screen.findByText("Database error")).toBeInTheDocument();
  });
});

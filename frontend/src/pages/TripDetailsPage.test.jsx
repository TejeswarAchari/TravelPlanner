import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TripDetailsPage from "./TripDetailsPage.jsx";
import { getActivities, getTrip } from "../services/api.js";

vi.mock("../services/api.js");

const trip = {
  id: 1,
  name: "Goa Trip",
  destination: "Goa",
  start_date: "2026-11-10",
  end_date: "2026-11-14",
  budget: 20000,
  status: "upcoming",
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/trips/1"]}>
      <Routes>
        <Route path="/trips/:id" element={<TripDetailsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TripDetailsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getTrip.mockResolvedValue(trip);
    getActivities.mockResolvedValue([]);
  });

  it("shows the trip budget using the existing currency format", async () => {
    renderPage();

    expect(await screen.findByText("Goa Trip")).toBeInTheDocument();
    expect(screen.getByText("Budget")).toBeInTheDocument();
    expect(screen.getByText("₹20,000")).toBeInTheDocument();
  });

  it("shows a zero budget", async () => {
    getTrip.mockResolvedValue({ ...trip, budget: 0 });
    renderPage();

    expect(await screen.findByText("₹0")).toBeInTheDocument();
  });
});

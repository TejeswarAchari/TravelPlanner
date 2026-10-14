import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TripDetailsPage from "./TripDetailsPage.jsx";
import { deleteTrip, getActivities, getTrip } from "../services/api.js";

vi.mock("../services/api.js");

const goaTrip = {
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
        <Route path="/" element={<p>Trips home</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TripDetailsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("keeps the trip visible and allows retrying after deletion fails", async () => {
    let resolveRetry;
    deleteTrip
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRetry = resolve;
      }));
    getTrip.mockResolvedValue(goaTrip);
    getActivities.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole("heading", { name: "Goa Trip" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete trip" }));

    expect(await screen.findByText("Unable to delete the trip. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Goa Trip" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete trip" }));

    expect(deleteTrip).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Unable to delete the trip. Please try again.")).not.toBeInTheDocument();

    resolveRetry();
    expect(await screen.findByText("Trips home")).toBeInTheDocument();
    expect(deleteTrip).toHaveBeenLastCalledWith("1");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ActivityForm from "./ActivityForm.jsx";

const conflictMessage =
  "An activity is already scheduled at this date and time. Choose a different time.";

const existingActivities = [
  { id: 1, title: "Beach", date: "2026-11-10", time: "10:00" },
  { id: 2, title: "Dinner", date: "2026-11-10", time: "20:00" },
];

function renderForm({ initialActivity, onSubmit = vi.fn(), activities = existingActivities } = {}) {
  render(
    <ActivityForm
      initialActivity={initialActivity}
      activities={activities}
      minDate="2026-11-10"
      maxDate="2026-11-14"
      submitLabel="Save activity"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />
  );
  return onSubmit;
}

describe("ActivityForm schedule conflicts", () => {
  it("shows a conflict immediately and blocks submission for a matching date and time", async () => {
    const onSubmit = renderForm();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-10" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "20:00" } });

    expect(screen.getByText(conflictMessage)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save activity" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Save activity" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the conflict as soon as the date or time changes to a free schedule", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-10" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "20:00" } });

    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "21:00" } });

    expect(screen.queryByText(conflictMessage)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save activity" })).toBeEnabled();
  });

  it("does not treat the edited activity as conflicting with itself", () => {
    renderForm({ initialActivity: existingActivities[0] });

    expect(screen.queryByText(conflictMessage)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save activity" })).toBeEnabled();
  });

  it("clears a stale server error when the user changes the schedule", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error(conflictMessage));
    renderForm({ onSubmit });

    fireEvent.change(screen.getByLabelText("Activity title"), { target: { value: "Museum" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-10" } });
    await userEvent.click(screen.getByRole("button", { name: "Save activity" }));
    expect(await screen.findByText(conflictMessage)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-11" } });

    expect(screen.queryByText(conflictMessage)).not.toBeInTheDocument();
  });
});

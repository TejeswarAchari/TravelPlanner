import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }) => children,
  SessionExpiryWatcher: () => null,
}));

function renderAt(path = "/") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <p>secret trips</p>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("waits for auth resolution instead of flashing content", () => {
    useAuth.mockReturnValue({ user: null, authReady: false });
    renderAt();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("redirects unauthenticated users to login", async () => {
    useAuth.mockReturnValue({ user: null, authReady: true });
    renderAt();
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("renders protected content after authentication", () => {
    useAuth.mockReturnValue({ user: { id: 1, email: "a@x.com" }, authReady: true });
    renderAt();
    expect(screen.getByText("secret trips")).toBeInTheDocument();
  });
});

describe("app navigation", () => {
  it("logs out and clears the UI", async () => {
    const logout = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ user: { id: 1, email: "a@x.com" }, authReady: true, logout });
    const { default: App } = await import("../App.jsx");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );
    expect(await screen.findByText("a@x.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("drops stale UI state when the session died before logout", async () => {
    const logout = vi.fn().mockRejectedValue(Object.assign(new Error("Authentication required"), { status: 401 }));
    const clearSession = vi.fn();
    useAuth.mockReturnValue({
      user: { id: 1, email: "a@x.com" },
      authReady: true,
      logout,
      clearSession,
    });
    const { default: App } = await import("../App.jsx");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );
    expect(await screen.findByText("a@x.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
  });
});

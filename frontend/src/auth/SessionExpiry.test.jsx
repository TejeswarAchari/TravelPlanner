import { useEffect, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, SessionExpiryWatcher, useAuth } from "./AuthContext.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import LoginPage from "../pages/LoginPage.jsx";
import { getTrips, setCsrfToken } from "../services/api.js";

function TripsProbe() {
  const location = useLocation();
  const [status, setStatus] = useState("loading");
  async function load() {
    setStatus("loading");
    try {
      await getTrips();
      setStatus("loaded");
    } catch {
      setStatus("failed");
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <div>
      <p>
        trips{location.search}:{status}
      </p>
      <button onClick={load}>Reload trips</button>
    </div>
  );
}

function NavEmail() {
  const { user, authReady } = useAuth();
  return <p>{authReady ? (user ? `signed-in:${user.email}` : "signed-out") : "resolving"}</p>;
}

function renderApp(initialEntries) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <SessionExpiryWatcher />
        <NavEmail />
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <TripsProbe />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

function jsonResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  setCsrfToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session expiry", () => {
  it("clears auth state, redirects to login, and restores the destination", async () => {
    let tripsCalls = 0;
    fetch.mockImplementation((url) => {
      if (url === "/api/auth/me") return Promise.resolve(jsonResponse({ id: 1, email: "a@x.com" }));
      if (url === "/api/auth/csrf") return Promise.resolve(jsonResponse({ csrf_token: "tok" }));
      if (typeof url === "string" && url.startsWith("/api/trips")) {
        tripsCalls += 1;
        // The session expires mid-use: the reload fails with 401.
        if (tripsCalls === 2) {
          return Promise.resolve(jsonResponse({ error: "Authentication required" }, 401));
        }
        return Promise.resolve(jsonResponse([]));
      }
      if (url === "/api/auth/login") {
        return Promise.resolve(jsonResponse({ id: 1, email: "a@x.com", csrf_token: "tok2" }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderApp(["/?status=ongoing"]);
    // Initial session resolves and the trips page loads.
    expect(await screen.findByText("trips?status=ongoing:loaded")).toBeInTheDocument();
    expect(await screen.findByText("signed-in:a@x.com")).toBeInTheDocument();

    // A later protected request fails with 401: auth state is cleared (the
    // login form renders instead of bouncing home, which proves user is
    // null) and the full destination is preserved for the return trip.
    await userEvent.click(screen.getByRole("button", { name: "Reload trips" }));
    expect(await screen.findByText("Log in", { selector: "h1" })).toBeInTheDocument();
    expect(await screen.findByText("signed-out")).toBeInTheDocument();

    // Logging in returns to the original destination, query included.
    await userEvent.type(screen.getByLabelText("Email"), "a@x.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("trips?status=ongoing:loaded")).toBeInTheDocument();
    expect(await screen.findByText("signed-in:a@x.com")).toBeInTheDocument();
  });

  it("does not redirect-loop when the bootstrap session is unauthenticated", async () => {
    let meCalls = 0;
    fetch.mockImplementation((url) => {
      if (url === "/api/auth/me") {
        meCalls += 1;
        return Promise.resolve(jsonResponse({ error: "Authentication required" }, 401));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderApp(["/"]);
    expect(await screen.findByText("Log in", { selector: "h1" })).toBeInTheDocument();
    await waitFor(() => expect(meCalls).toBe(1));
    // Settle: no repeated bootstrap calls, no loop.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(meCalls).toBe(1);
  });
});

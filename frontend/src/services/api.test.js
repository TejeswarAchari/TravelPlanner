import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTrip,
  getTrips,
  login,
  logout,
  me,
  onSessionExpired,
  setCsrfToken,
} from "./api.js";

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

describe("api session handling", () => {
  it("sends cookies on GET requests without a CSRF fetch", async () => {
    fetch.mockResolvedValueOnce(jsonResponse([{ id: 1 }]));

    const trips = await getTrips();

    expect(trips).toEqual([{ id: 1 }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/trips?", {
      method: "GET",
      headers: {},
      credentials: "include",
      body: undefined,
    });
  });

  it("attaches the CSRF token to state-changing requests", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "tok123" }))
      .mockResolvedValueOnce(jsonResponse({ id: 7 }));

    await createTrip({ name: "Goa" });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/auth/csrf", { credentials: "include" });
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "tok123" },
      credentials: "include",
      body: JSON.stringify({ name: "Goa" }),
    });
  });

  it("refreshes a rotated CSRF token once and retries", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "old" }))
      .mockResolvedValueOnce(jsonResponse({ error: "CSRF token missing or invalid" }, 400))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "fresh" }))
      .mockResolvedValueOnce(jsonResponse({ id: 8 }));

    const created = await createTrip({ name: "Goa" });

    expect(created).toEqual({ id: 8 });
    expect(fetch).toHaveBeenCalledTimes(4);
    const lastCall = fetch.mock.calls[3];
    expect(lastCall[1].headers["X-CSRF-Token"]).toBe("fresh");
  });

  it("surfaces API errors with their status code", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "tok" }))
      .mockResolvedValueOnce(jsonResponse({ error: "Invalid email or password" }, 401));

    const failure = login("a@x.com", "wrongpass").catch((err) => err);
    await expect(failure).resolves.toMatchObject({ status: 401, message: "Invalid email or password" });
  });

  it("auth helpers hit the session endpoints", async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "tok" }))
      .mockResolvedValueOnce(jsonResponse({ id: 1, email: "a@x.com", csrf_token: "tok2" }));
    const user = await login("a@x.com", "password123");
    expect(user.email).toBe("a@x.com");
    expect(fetch.mock.calls[1][0]).toBe("/api/auth/login");

    fetch.mockResolvedValueOnce(jsonResponse({ id: 1, email: "a@x.com" }));
    expect((await me()).email).toBe("a@x.com");

    // logout reuses the cached token, no extra CSRF fetch needed
    fetch.mockResolvedValueOnce(jsonResponse({ message: "Logged out", csrf_token: "tok3" }));
    await logout();
    const logoutCall = fetch.mock.calls[fetch.mock.calls.length - 1];
    expect(logoutCall[0]).toBe("/api/auth/logout");
    expect(logoutCall[1].headers["X-CSRF-Token"]).toBe("tok2");
  });

  it("signals expired sessions only for protected endpoints", async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);

    fetch.mockResolvedValueOnce(jsonResponse({ error: "Authentication required" }, 401));
    await expect(getTrips()).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);

    // A rejected login is a form error, not an expired session.
    fetch
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "tok" }))
      .mockResolvedValueOnce(jsonResponse({ error: "Invalid email or password" }, 401));
    await expect(login("a@x.com", "wrong")).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);

    // The bootstrap /api/auth/me call must not trigger redirects either.
    fetch.mockResolvedValueOnce(jsonResponse({ error: "Authentication required" }, 401));
    await expect(me()).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    fetch.mockResolvedValueOnce(jsonResponse({ error: "Authentication required" }, 401));
    await expect(getTrips()).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

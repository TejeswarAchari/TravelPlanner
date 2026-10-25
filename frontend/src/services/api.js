// Session-based API client.
//
// Authentication uses an HttpOnly session cookie, so every request sends
// credentials. State-changing requests additionally carry the CSRF token
// issued by GET /api/auth/csrf (rotated on register/login/logout). The
// token is cached here and refreshed automatically: auth responses carry
// the fresh token, and a rejected (rotated) token triggers one refetch
// plus a single retry. No tokens or passwords are stored in localStorage.

let csrfToken = null;
let csrfFetch = null;
let sessionExpiredListener = null;

// Centralized expired-session signal. Auth state subscribes via
// onSessionExpired; only 401s from protected (non-auth) endpoints fire it,
// so invalid logins and the /api/auth/me bootstrap never trigger redirects.
export function onSessionExpired(listener) {
  sessionExpiredListener = listener;
  return () => {
    if (sessionExpiredListener === listener) sessionExpiredListener = null;
  };
}

function notifySessionExpired() {
  if (sessionExpiredListener) sessionExpiredListener();
}

export function setCsrfToken(token) {
  csrfToken = token || null;
  csrfFetch = null;
}

async function fetchCsrfToken() {
  if (!csrfFetch) {
    csrfFetch = fetch("/api/auth/csrf", { credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        csrfToken = data?.csrf_token || null;
        return csrfToken;
      })
      .finally(() => {
        csrfFetch = null;
      });
  }
  return csrfFetch;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function request(method, url, body, retried = false) {
  const headers = {};
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (MUTATING.has(method)) {
    if (!csrfToken) await fetchCsrfToken();
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }
  const response = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: payload,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // A 401 from a protected endpoint means the session died mid-use.
    // Auth endpoints are excluded: a rejected login is a form error and
    // /api/auth/me drives bootstrap state, neither is a redirect signal.
    // The server rejects before any write, so the single CSRF retry above
    // cannot double-submit; by the same token this branch never fires for
    // a request the server already applied.
    if (response.status === 401 && !url.startsWith("/api/auth/")) {
      notifySessionExpired();
    }
    // The token may have rotated (e.g. session changed in another tab):
    // refresh once and retry before surfacing the error.
    if (
      !retried &&
      MUTATING.has(method) &&
      data?.error === "CSRF token missing or invalid"
    ) {
      setCsrfToken(null);
      await fetchCsrfToken();
      return request(method, url, body, true);
    }
    const error = new Error(data?.error || "Something went wrong");
    error.status = response.status;
    throw error;
  }
  if (data && typeof data.csrf_token === "string") {
    setCsrfToken(data.csrf_token);
  }
  return data;
}

export function getTrips({ search = "", status = "" } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  return request("GET", `/api/trips?${params}`);
}

export function getTrip(id) {
  return request("GET", `/api/trips/${id}`);
}

export function createTrip(trip) {
  return request("POST", "/api/trips", trip);
}

export function updateTrip(id, trip) {
  return request("PUT", `/api/trips/${id}`, trip);
}

export function deleteTrip(id) {
  return request("DELETE", `/api/trips/${id}`);
}

export function getActivities(tripId) {
  return request("GET", `/api/trips/${tripId}/activities`);
}

export function createActivity(tripId, activity) {
  return request("POST", `/api/trips/${tripId}/activities`, activity);
}

export function updateActivity(id, activity) {
  return request("PUT", `/api/activities/${id}`, activity);
}

export function deleteActivity(id) {
  return request("DELETE", `/api/activities/${id}`);
}

export function register(email, password) {
  return request("POST", "/api/auth/register", { email, password });
}

export function login(email, password) {
  return request("POST", "/api/auth/login", { email, password });
}

export function logout() {
  return request("POST", "/api/auth/logout", {});
}

export function me() {
  return request("GET", "/api/auth/me");
}

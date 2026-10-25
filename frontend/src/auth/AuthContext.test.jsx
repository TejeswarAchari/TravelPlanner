import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import * as api from "../services/api.js";

vi.mock("../services/api.js", () => ({
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

function Probe() {
  const { user, authReady } = useAuth();
  return <p>{authReady ? (user ? `user:${user.email}` : "anonymous") : "resolving"}</p>;
}

function renderProvider() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts in a loading state, then resolves the session", async () => {
    api.me.mockImplementation(() => new Promise(() => {}));
    renderProvider();
    expect(screen.getByText("resolving")).toBeInTheDocument();
  });

  it("loads the current user on initialization", async () => {
    api.me.mockResolvedValue({ id: 1, email: "a@x.com" });
    renderProvider();
    expect(await screen.findByText("user:a@x.com")).toBeInTheDocument();
  });

  it("represents unauthenticated sessions distinctly", async () => {
    api.me.mockRejectedValue(Object.assign(new Error("Authentication required"), { status: 401 }));
    renderProvider();
    expect(await screen.findByText("anonymous")).toBeInTheDocument();
  });

  it("synchronizes user state after login, register and logout", async () => {
    api.me.mockResolvedValue({ id: 1, email: "a@x.com" });
    api.login.mockResolvedValue({ id: 2, email: "b@x.com" });
    api.register.mockResolvedValue({ id: 3, email: "c@x.com" });
    api.logout.mockResolvedValue({ message: "Logged out" });

    let auth;
    function Capture() {
      auth = useAuth();
      return null;
    }
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>
    );
    await waitFor(() => expect(auth.authReady).toBe(true));

    await auth.login("b@x.com", "password123");
    await waitFor(() => expect(auth.user?.email).toBe("b@x.com"));

    await auth.register("c@x.com", "password123");
    await waitFor(() => expect(auth.user?.email).toBe("c@x.com"));

    await auth.logout();
    await waitFor(() => expect(auth.user).toBeNull());
  });

  it("ignores a stale bootstrap response after a newer session write", async () => {
    let resolveMe;
    api.me.mockReturnValue(new Promise((resolve) => { resolveMe = resolve; }));
    api.login.mockResolvedValue({ id: 2, email: "b@x.com" });

    let auth;
    function Capture() {
      auth = useAuth();
      return null;
    }
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>
    );

    await auth.login("b@x.com", "password123");
    await waitFor(() => expect(auth.user?.email).toBe("b@x.com"));

    // The stale bootstrap resolves late with the old identity: ignored.
    resolveMe({ id: 1, email: "a@x.com" });
    await waitFor(() => expect(auth.authReady).toBe(true));
    expect(auth.user?.email).toBe("b@x.com");
  });

  it("keeps the user when logout fails", async () => {
    api.me.mockResolvedValue({ id: 1, email: "a@x.com" });
    api.logout.mockRejectedValue(new Error("Network error"));

    let auth;
    function Capture() {
      auth = useAuth();
      return null;
    }
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>
    );
    await waitFor(() => expect(auth.user?.email).toBe("a@x.com"));

    await expect(auth.logout()).rejects.toThrow("Network error");
    expect(auth.user?.email).toBe("a@x.com");
  });
});

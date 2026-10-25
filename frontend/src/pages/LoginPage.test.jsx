import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./LoginPage.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));

function renderAt(path = "/login", state = null) {
  const entries = state ? [{ pathname: path, state }] : [path];
  render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>home page</p>} />
        <Route path="/trips/5" element={<p>trip five</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuth.mockReturnValue({ user: null, authReady: true, login: vi.fn() });
  });

  it("renders email and password fields with labels and autocomplete", () => {
    renderAt();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/register");
  });

  it("validates missing input without calling the API", async () => {
    const login = vi.fn();
    useAuth.mockReturnValue({ user: null, authReady: true, login });
    renderAt();

    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Email and password are required")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("logs in and restores the intended destination", async () => {
    const login = vi.fn().mockResolvedValue({ id: 1, email: "a@x.com" });
    useAuth.mockReturnValue({ user: null, authReady: true, login });
    renderAt("/login", { from: { pathname: "/trips/5" } });

    await userEvent.type(screen.getByLabelText("Email"), "a@x.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("trip five")).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith("a@x.com", "password123");
  });

  it("shows server errors and prevents duplicate submissions", async () => {
    let resolveLogin;
    const login = vi.fn(() => new Promise((resolve) => { resolveLogin = resolve; }));
    useAuth.mockReturnValue({ user: null, authReady: true, login });
    renderAt();

    await userEvent.type(screen.getByLabelText("Email"), "a@x.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    const button = screen.getByRole("button", { name: "Log in" });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(login).toHaveBeenCalledTimes(1);
    resolveLogin({ id: 1, email: "a@x.com" });
    expect(await screen.findByText("home page")).toBeInTheDocument();
  });

  it("shows failed submissions", async () => {
    const login = vi.fn().mockRejectedValue(new Error("Invalid email or password"));
    useAuth.mockReturnValue({ user: null, authReady: true, login });
    renderAt();

    await userEvent.type(screen.getByLabelText("Email"), "a@x.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
  });

  it("redirects already-authenticated users", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, email: "a@x.com" },
      authReady: true,
      login: vi.fn(),
    });
    renderAt();
    expect(await screen.findByText("home page")).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    renderAt();
    const field = screen.getByLabelText("Password");
    expect(field).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(field).toHaveAttribute("type", "password");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RegisterPage from "./RegisterPage.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: vi.fn(),
}));

function renderAt(path = "/register") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuth.mockReturnValue({ user: null, authReady: true, register: vi.fn() });
  });

  it("renders the form with a link to login", () => {
    renderAt();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("rejects short passwords client-side", async () => {
    const register = vi.fn();
    useAuth.mockReturnValue({ user: null, authReady: true, register });
    renderAt();

    await userEvent.type(screen.getByLabelText("Email"), "new@x.com");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("registers and lands on the home page", async () => {
    const register = vi.fn().mockResolvedValue({ id: 1, email: "new@x.com" });
    useAuth.mockReturnValue({ user: null, authReady: true, register });
    renderAt();

    await userEvent.type(screen.getByLabelText("Email"), "new@x.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(register).toHaveBeenCalledWith("new@x.com", "password123");
    expect(await screen.findByText("home page")).toBeInTheDocument();
  });

  it("shows duplicate-registration errors", async () => {
    const register = vi.fn().mockRejectedValue(new Error("Email is already registered"));
    useAuth.mockReturnValue({ user: null, authReady: true, register });
    renderAt();

    await userEvent.type(screen.getByLabelText("Email"), "taken@x.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Email is already registered")).toBeInTheDocument();
  });

  it("redirects already-authenticated users", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, email: "a@x.com" },
      authReady: true,
      register: vi.fn(),
    });
    renderAt();
    expect(await screen.findByText("home page")).toBeInTheDocument();
  });
});

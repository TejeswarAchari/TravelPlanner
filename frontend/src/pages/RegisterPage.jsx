import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

const inputClass = "mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2";

export default function RegisterPage() {
  const { user, authReady, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Return to the full saved destination (pathname, query and hash).
  const from = location.state?.from;
  const destination =
    from && typeof from.pathname === "string"
      ? { pathname: from.pathname, search: from.search || "", hash: from.hash || "" }
      : "/";

  // Already signed in: bounce to the saved destination, not plain "/".
  if (authReady && user) return <Navigate to={destination} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Email and password are required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await register(trimmedEmail, password);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-semibold">Create account</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-medium">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${inputClass} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 px-3 text-sm text-blue-600 hover:underline"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>
        <p className="text-xs text-gray-500">At least 8 characters.</p>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        Already have an account?{" "}
        <Link to="/login" className="text-blue-600 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

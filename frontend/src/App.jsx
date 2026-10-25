import { useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, SessionExpiryWatcher, useAuth } from "./auth/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import TripsPage from "./pages/TripsPage.jsx";
import NewTripPage from "./pages/NewTripPage.jsx";
import EditTripPage from "./pages/EditTripPage.jsx";
import TripDetailsPage from "./pages/TripDetailsPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";

function Navigation() {
  const { user, authReady, logout, clearSession } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    setLogoutError("");
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      if (err.status === 401) {
        // The session already died server-side: drop the stale UI state
        // and land on login instead of showing a logged-in shell.
        clearSession();
        navigate("/login");
        return;
      }
      // Stay put: the server session may still be alive.
      setLogoutError(err.message);
    }
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-semibold">
          TravelPlanner
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {!authReady ? (
            <span className="text-gray-400" aria-hidden="true">
              Loading…
            </span>
          ) : user ? (
            <>
              <Link to="/trips/new" className="text-blue-600 hover:underline">
                New trip
              </Link>
              <span className="text-gray-600" title="Signed in">
                {user.email}
              </span>
              <button onClick={handleLogout} className="text-blue-600 hover:underline">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-blue-600 hover:underline">
                Log in
              </Link>
              <Link to="/register" className="text-blue-600 hover:underline">
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
      {logoutError && (
        <p className="mx-auto max-w-4xl px-4 pb-2 text-sm text-red-700">{logoutError}</p>
      )}
    </header>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SessionExpiryWatcher />
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <Navigation />

        <main className="mx-auto max-w-4xl px-4 py-6">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <TripsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trips/new"
              element={
                <ProtectedRoute>
                  <NewTripPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trips/:id"
              element={
                <ProtectedRoute>
                  <TripDetailsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trips/:id/edit"
              element={
                <ProtectedRoute>
                  <EditTripPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<p>Page not found.</p>} />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
}

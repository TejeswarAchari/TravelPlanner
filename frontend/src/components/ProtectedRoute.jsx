import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { user, authReady } = useAuth();
  const location = useLocation();

  // Avoid flashing protected content before the session is resolved.
  if (!authReady) return <p className="text-sm text-gray-500">Loading...</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

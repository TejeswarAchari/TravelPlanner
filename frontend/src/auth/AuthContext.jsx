import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as api from "../services/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // Generation counter: only the latest session operation may write state,
  // so a stale /api/auth/me response can never restore an invalid session.
  const generation = useRef(0);

  useEffect(() => {
    const id = ++generation.current;
    let ignore = false;
    api
      .me()
      .then((data) => {
        if (!ignore && generation.current === id) setUser({ id: data.id, email: data.email });
      })
      .catch(() => {
        if (!ignore && generation.current === id) setUser(null);
      })
      .finally(() => {
        if (!ignore && generation.current === id) setAuthReady(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const clearSession = useCallback(() => {
    generation.current += 1;
    setUser(null);
    setAuthReady(true);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    generation.current += 1;
    setUser({ id: data.id, email: data.email });
    setAuthReady(true);
    return data;
  }, []);

  const register = useCallback(async (email, password) => {
    const data = await api.register(email, password);
    generation.current += 1;
    setUser({ id: data.id, email: data.email });
    setAuthReady(true);
    return data;
  }, []);

  const logout = useCallback(async () => {
    // Only clear client state after the server confirms the logout;
    // a failed request must not pretend the session is gone.
    await api.logout();
    generation.current += 1;
    setUser(null);
    setAuthReady(true);
  }, []);

  return (
    <AuthContext.Provider value={{ user, authReady, login, register, logout, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}

// Mount once inside the Router (e.g. in App) to turn expired-session
// signals into a single login redirect that preserves the full destination
// (pathname, query and hash). Never redirects from /login or /register, so
// failed logins stay on the form and no redirect loop is possible.
export function SessionExpiryWatcher() {
  const { clearSession } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(
    () =>
      api.onSessionExpired(() => {
        clearSession();
        const target = locationRef.current;
        if (target.pathname === "/login" || target.pathname === "/register") return;
        navigate("/login", {
          replace: true,
          state: {
            from: { pathname: target.pathname, search: target.search, hash: target.hash },
          },
        });
      }),
    [navigate, clearSession]
  );
  return null;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

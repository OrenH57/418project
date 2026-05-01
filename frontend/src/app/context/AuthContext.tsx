// File purpose:
// Global auth/session state for the frontend.
// Restores sessions from localStorage and exposes login, signup, logout, and refresh helpers.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api, AUTH_EXPIRED_EVENT, type User } from "../lib/api";
import { VIEW_KEY } from "../lib/viewMode";

const TOKEN_KEY = "campus-connect-token";
const USER_KEY = "campus-connect-user";
const REQUEST_IDEMPOTENCY_KEY = "campus-connect-request-idempotency-key";

function clearAppSessionStorage() {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith("campus-connect-")) {
      sessionStorage.removeItem(key);
    }
  }
}

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ user: User; verification?: AuthVerification }>;
  signup: (input: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: "requester" | "courier";
    ualbanyIdImage?: string;
  }) => Promise<{ user: User; verification?: AuthVerification }>;
  verifyEmail: (code: string) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateLocalUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
type AuthVerification = { required: boolean; delivered: boolean; previewCode: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as User;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const authGenerationRef = useRef(0);
  const tokenRef = useRef<string | null>(token);

  function clearStoredSession({ clearView = false } = {}) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    if (clearView) {
      localStorage.removeItem(VIEW_KEY);
    }
    clearAppSessionStorage();
  }

  function clearSession({ clearView = false } = {}) {
    authGenerationRef.current += 1;
    clearStoredSession({ clearView });
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    setLoading(false);
    return authGenerationRef.current;
  }

  function storeAuthenticatedSession(nextToken: string, nextUser: User, expectedGeneration: number) {
    if (authGenerationRef.current !== expectedGeneration) {
      return false;
    }
    clearStoredSession();
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    tokenRef.current = nextToken;
    setToken(nextToken);
    setUser(nextUser);
    setLoading(false);
    return true;
  }

  function beginAuthAttempt() {
    authGenerationRef.current += 1;
    return {
      generation: authGenerationRef.current,
      previousToken: tokenRef.current,
    };
  }

  function logoutPreviousSession(previousToken: string | null, nextToken: string) {
    if (!previousToken || previousToken === nextToken) return;

    void api.logout(previousToken).catch(() => {
      // The new local auth session should remain active even if the old session is already gone.
    });
  }

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    const generation = authGenerationRef.current;
    let active = true;

    async function loadSession() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.session(token);
        if (!active || authGenerationRef.current !== generation || tokenRef.current !== token) return;
        setUser(response.user);
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      } catch {
        if (!active || authGenerationRef.current !== generation || tokenRef.current !== token) return;
        clearSession({ clearView: true });
      } finally {
        if (active && authGenerationRef.current === generation) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    function handleAuthExpired(event: Event) {
      const expiredToken =
        event instanceof CustomEvent && typeof event.detail?.token === "string"
          ? event.detail.token
          : "";
      if (expiredToken && expiredToken !== tokenRef.current) {
        return;
      }
      clearSession({ clearView: true });
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      async login(email, password) {
        const { generation, previousToken } = beginAuthAttempt();
        const response = await api.login({ email, password });
        if (!storeAuthenticatedSession(response.token, response.user, generation)) {
          throw new Error("Authentication changed. Please try again.");
        }
        logoutPreviousSession(previousToken, response.token);
        return { user: response.user, verification: response.verification };
      },
      async signup(input) {
        const { generation, previousToken } = beginAuthAttempt();
        const response = await api.signup(input);
        if (!storeAuthenticatedSession(response.token, response.user, generation)) {
          throw new Error("Authentication changed. Please try again.");
        }
        logoutPreviousSession(previousToken, response.token);
        return { user: response.user, verification: response.verification };
      },
      async verifyEmail(code) {
        if (!tokenRef.current) {
          throw new Error("Sign in again before verifying your email.");
        }
        const response = await api.verifyEmail(tokenRef.current, code);
        setUser(response.user);
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));
        return response.user;
      },
      logout() {
        const currentToken = token;
        clearSession({ clearView: true });
        if (currentToken) {
          void api.logout(currentToken).catch(() => {
            // Local logout should still succeed even if the backend is unavailable.
          });
        }
      },
      async refreshUser() {
        if (!token) return;
        const currentToken = token;
        const generation = authGenerationRef.current;
        const response = await api.session(currentToken);
        if (authGenerationRef.current !== generation || tokenRef.current !== currentToken) return;
        setUser(response.user);
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      },
      updateLocalUser(nextUser) {
        if (!tokenRef.current) return;
        localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
        setUser(nextUser);
      },
    }),
    [loading, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { apiRequest, setAuthToken, getAuthToken, queryClient } from "@/lib/queryClient";

type AuthUser = {
  id: number;
  username: string;
  role: "admin" | "member";
  departmentId: number | null;
  mustChangePassword: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Start in a loading state only when a stored token needs validating; without
  // one there is nothing to restore, so show the login screen immediately.
  const [isLoading, setIsLoading] = useState<boolean>(() => !!getAuthToken());

  // On mount, if a token was restored from localStorage, validate it against the
  // server and rehydrate the user. Invalid/expired token (e.g. server restarted
  // and cleared its in-memory session Map) → clear it and fall back to login.
  useEffect(() => {
    if (!getAuthToken()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/me");
        const data = await res.json();
        if (!cancelled) setUser(data);
      } catch {
        if (!cancelled) {
          setAuthToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiRequest("POST", "/api/login", { username, password });
    const data = await res.json();
    setAuthToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/logout");
    } catch {
      // ignore network errors on logout
    }
    setAuthToken(null);
    setUser(null);
    queryClient.clear();
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    const res = await apiRequest("POST", "/api/change-password", { newPassword });
    const data = await res.json();
    setUser(data);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, login, logout, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { apiRequest, setAuthToken, queryClient } from "@/lib/queryClient";

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
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

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
      value={{ user, isAuthenticated: !!user, login, logout, changePassword }}
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

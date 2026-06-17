"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { isAuthenticated, getToken, login as authLogin, logout as authLogout } from "@/lib/auth";
import { useRouter } from "next/navigation";

interface AuthContextValue {
  isAuthenticated: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  token: null,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setToken(getToken());
    setAuthed(isAuthenticated());
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const newToken = await authLogin(email, password);
      setToken(newToken);
      setAuthed(true);
      router.push("/dashboard");
    },
    [router]
  );

  const logout = useCallback(() => {
    authLogout();
    setToken(null);
    setAuthed(false);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ isAuthenticated: authed, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

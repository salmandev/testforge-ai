const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const TOKEN_KEY = "testforge_token";
const TOKEN_EXPIRY_KEY = "testforge_token_expiry";

export async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Login failed" }));
    throw new Error((error as Record<string, string>).message ?? "Login failed");
  }

  const data = (await response.json()) as { token: string; expiresIn: number };
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(
    TOKEN_EXPIRY_KEY,
    String(Date.now() + data.expiresIn * 1000)
  );
  return data.token;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token || !expiry) return false;
  return Date.now() < Number(expiry);
}

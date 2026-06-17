import type {
  TestRun,
  TestSuite,
  TestStepResult,
  Report,
  DashboardStats,
  D365Entity,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("testforge_token");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("testforge_token");
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error((error as Record<string, string>).message ?? "API error");
  }

  return response.json() as Promise<T>;
}

// ─── Dashboard ──────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>("/api/runs/stats");
}

// ─── Runs ───────────────────────────────────────────────────

export async function getRuns(): Promise<TestRun[]> {
  return apiFetch<TestRun[]>("/api/runs");
}

export async function getRun(id: string): Promise<TestRun & { steps: TestStepResult[] }> {
  return apiFetch<TestRun & { steps: TestStepResult[] }>(`/api/runs/${id}`);
}

// ─── Suites ─────────────────────────────────────────────────

export async function getSuites(): Promise<TestSuite[]> {
  return apiFetch<TestSuite[]>("/api/suites");
}

export async function createSuite(data: {
  name: string;
  description?: string;
  module?: string;
}): Promise<TestSuite> {
  return apiFetch<TestSuite>("/api/suites", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteSuite(id: string): Promise<void> {
  await apiFetch(`/api/suites/${id}`, { method: "DELETE" });
}

// ─── D365 ───────────────────────────────────────────────────

export async function getD365Entities(orgUrl: string): Promise<D365Entity[]> {
  return apiFetch<D365Entity[]>("/api/ai/d365-entities", {
    method: "POST",
    body: JSON.stringify({ orgUrl }),
  });
}

export async function generateD365Tests(params: {
  orgUrl: string;
  entities?: string[];
  naturalLanguage?: string;
}): Promise<{ tests: unknown[]; confidence: number }> {
  return apiFetch("/api/ai/d365-generate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ─── Reports ────────────────────────────────────────────────

export async function getReports(): Promise<Report[]> {
  return apiFetch<Report[]>("/api/reports");
}

export async function generateReport(runId: string): Promise<Report> {
  return apiFetch<Report>(`/api/reports/${runId}/generate`, {
    method: "POST",
  });
}

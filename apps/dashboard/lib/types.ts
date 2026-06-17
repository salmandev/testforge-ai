/** Shared frontend types for the dashboard */

export interface TestRun {
  id: string;
  suiteId: string;
  suiteName: string;
  status: "passed" | "failed" | "running" | "pending" | "cancelled";
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  testCount: number;
  tags: string[];
  module?: string;
  lastRunAt?: string;
  lastRunStatus?: string;
  createdAt: string;
}

export interface TestStepResult {
  stepId: string;
  description: string;
  action: string;
  status: "passed" | "failed" | "skipped" | "running";
  duration?: number;
  screenshot?: string;
  error?: string;
  aiAnalysis?: string;
}

export interface D365Connection {
  id: string;
  orgUrl: string;
  tenantId: string;
  clientId: string;
  status: "connected" | "disconnected" | "error";
  lastSyncedAt?: string;
}

export interface D365Entity {
  logicalName: string;
  displayName: string;
  fieldCount: number;
  fields?: D365Field[];
}

export interface D365Field {
  logicalName: string;
  displayName: string;
  fieldType: string;
  isRequired: boolean;
}

export interface Report {
  id: string;
  runId: string;
  title: string;
  generatedAt: string;
  format: "html" | "pdf" | "json";
  passRate: number;
  totalTests: number;
}

export interface DashboardStats {
  totalRuns: number;
  passRate: number;
  avgDuration: number;
  activeSuites: number;
}

export interface UserSettings {
  anthropicKey?: string;
  ollamaUrl?: string;
  azureTenantId?: string;
  azureClientId?: string;
  azureClientSecret?: string;
  slackWebhook?: string;
  emailRecipients?: string[];
  teamsWebhook?: string;
}

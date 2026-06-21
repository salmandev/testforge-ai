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

export interface Project {
  id: string;
  name: string;
  description?: string;
  suiteCount: number;
  runCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ComplianceFramework {
  id: string;
  name: string;
  name_ar?: string;
  description: string;
  region: string;
  totalControls: number;
}

export interface ComplianceResult {
  framework: string;
  compliancePercentage: number;
  totalControls: number;
  coveredControls: number;
  gaps: string[];
  aiSummary: string;
  coverage: {
    controlId: string;
    controlName: string;
    covered: boolean;
    status: string;
    notes: string;
  }[];
  runAt: string;
}

export interface AIInsights {
  executiveSummary: string;
  topRisks: string[];
  priorityFixes: { test: string; fix: string; priority: string }[];
  healthStatus: string;
  flakinessWarnings: { test: string; pattern: string }[];
  coverageGaps: string[];
  generatedAt: string;
}

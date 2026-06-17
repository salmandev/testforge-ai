/**
 * Test result data for reporting
 */
export interface TestResultData {
  /** Test identifier */
  testId: string;
  /** Test name */
  testName: string;
  /** Test type (web/mobile/api/visual) */
  testType: string;
  /** Execution status */
  status: "passed" | "failed" | "skipped" | "flaky";
  /** Duration in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Screenshot path on failure */
  screenshotPath?: string;
  /** Step-level details */
  steps: TestStepData[];
  /** Device/browser info */
  deviceInfo?: Record<string, unknown>;
  /** Tags associated with the test */
  tags: string[];
}

/**
 * Step-level execution data
 */
export interface TestStepData {
  /** Step identifier */
  stepId: string;
  /** Step description */
  description: string;
  /** Action performed */
  action: string;
  /** Step status */
  status: "passed" | "failed" | "skipped";
  /** Duration in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Screenshot path */
  screenshotPath?: string;
}

/**
 * Complete test run data for reporting
 */
export interface TestRunData {
  /** Run identifier */
  runId: string;
  /** Suite identifier */
  suiteId: string;
  /** Project name */
  projectName: string;
  /** Run status */
  status: "passed" | "failed" | "running" | "cancelled";
  /** When the run started */
  startedAt: Date;
  /** When the run completed */
  completedAt?: Date;
  /** Total duration in milliseconds */
  duration: number;
  /** All test results */
  results: TestResultData[];
  /** What triggered the run */
  triggeredBy: "manual" | "schedule" | "ci" | "agent";
  /** Environment used */
  environment?: string;
  /** Git commit SHA */
  gitSha?: string;
  /** CI build URL */
  ciUrl?: string;
  /** AI-generated summary */
  aiSummary?: string;
}

/**
 * Notification channel configuration
 */
export interface NotificationConfig {
  /** Slack webhook URL */
  slackWebhookUrl?: string;
  /** Microsoft Teams webhook URL */
  teamsWebhookUrl?: string;
  /** Email SMTP configuration */
  emailConfig?: {
    smtpHost: string;
    smtpPort: number;
    from: string;
    to: string[];
    useTls: boolean;
    username?: string;
    password?: string;
  };
}

/**
 * Report output format types
 */
export type ReportFormat = "allure" | "ai-summary" | "pdf" | "json" | "html";

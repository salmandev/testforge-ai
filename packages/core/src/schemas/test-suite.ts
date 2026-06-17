import { z } from "zod";
import { TestCaseSchema } from "./test-case.js";

/**
 * Test execution environment configuration
 */
export const EnvironmentSchema = z.object({
  /** Environment name (dev/staging/prod) */
  name: z.string(),
  /** Base URL for the application under test */
  baseUrl: z.string().url(),
  /** Environment-specific headers */
  headers: z.record(z.string()).optional(),
  /** Environment-specific credentials */
  credentials: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional(),
  /** Environment variables to inject */
  variables: z.record(z.string()).default({}),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

/**
 * A collection of test cases grouped for execution
 */
export const TestSuiteSchema = z.object({
  /** Unique suite identifier */
  id: z.string(),
  /** Human-readable suite name */
  name: z.string(),
  /** Parent project identifier */
  projectId: z.string(),
  /** Test cases in this suite */
  tests: z.array(TestCaseSchema).default([]),
  /** Maximum parallel workers for execution */
  parallelism: z.number().min(1).max(10).default(1),
  /** Target environment configuration */
  environment: EnvironmentSchema.optional(),
  /** Cron schedule for automated runs */
  schedule: z.string().optional(),
  /** Tags to filter which tests to include */
  tags: z.array(z.string()).default([]),
  /** Whether to stop execution on first failure */
  stopOnFailure: z.boolean().default(false),
  /** Retry count for failed tests */
  retries: z.number().min(0).max(3).default(0),
  /** Suite-level timeout in milliseconds */
  timeout: z.number().default(300000),
  /** Timestamp when suite was created */
  createdAt: z.coerce.date().default(() => new Date()),
  /** Timestamp when suite was last modified */
  updatedAt: z.coerce.date().optional(),
});

export type TestSuite = z.infer<typeof TestSuiteSchema>;

/**
 * Result of a single test step execution
 */
export const StepResultSchema = z.object({
  /** Step identifier */
  stepId: z.string(),
  /** Whether the step passed */
  status: z.enum(["passed", "failed", "skipped"]),
  /** Duration in milliseconds */
  duration: z.number(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Screenshot buffer path or base64 */
  screenshot: z.string().optional(),
  /** Console logs captured during step */
  consoleLogs: z.array(z.string()).default([]),
  /** Network requests made during step */
  networkRequests: z
    .array(
      z.object({
        url: z.string(),
        method: z.string(),
        status: z.number().optional(),
        duration: z.number().optional(),
      })
    )
    .default([]),
});

export type StepResult = z.infer<typeof StepResultSchema>;

/**
 * Result of a single test case execution
 */
export const TestResultSchema = z.object({
  /** Test case identifier */
  testId: z.string(),
  /** Execution status */
  status: z.enum(["passed", "failed", "skipped", "flaky"]),
  /** Total duration in milliseconds */
  duration: z.number(),
  /** Step-level results */
  stepResults: z.array(StepResultSchema).default([]),
  /** Error message if failed */
  error: z.string().optional(),
  /** Screenshot path on failure */
  screenshot: z.string().optional(),
  /** Video recording path */
  video: z.string().optional(),
  /** Trace file path for Playwright */
  trace: z.string().optional(),
  /** Device/browser info */
  deviceInfo: z.record(z.unknown()).optional(),
});

export type TestResult = z.infer<typeof TestResultSchema>;

/**
 * A complete test run containing multiple test results
 */
export const TestRunSchema = z.object({
  /** Unique run identifier */
  id: z.string(),
  /** Suite being executed */
  suiteId: z.string(),
  /** Overall run status */
  status: z.enum(["pending", "running", "passed", "failed", "cancelled"]),
  /** When execution started */
  startedAt: z.coerce.date().optional(),
  /** When execution completed */
  completedAt: z.coerce.date().optional(),
  /** Individual test results */
  results: z.array(TestResultSchema).default([]),
  /** AI-generated summary of the run */
  aiSummary: z.string().optional(),
  /** What triggered this run (manual/schedule/ci/agent) */
  triggeredBy: z.enum(["manual", "schedule", "ci", "agent"]).default("manual"),
  /** Environment used for this run */
  environment: z.string().optional(),
  /** Total duration in milliseconds */
  duration: z.number().default(0),
  /** Git commit SHA if triggered by CI */
  gitSha: z.string().optional(),
  /** CI build URL */
  ciUrl: z.string().optional(),
});

export type TestRun = z.infer<typeof TestRunSchema>;

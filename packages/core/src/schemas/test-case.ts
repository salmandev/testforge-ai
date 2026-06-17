import { z } from "zod";
import { LocatorSchema } from "./locator.js";

/**
 * Test case types indicating what kind of application is being tested
 */
export const TestTypeSchema = z.enum(["web", "mobile", "api", "visual"]);

export type TestType = z.infer<typeof TestTypeSchema>;

/**
 * Test case execution status
 */
export const TestStatusSchema = z.enum([
  "pending",
  "running",
  "passed",
  "failed",
  "skipped",
  "flaky",
  "healed",
]);

export type TestStatus = z.infer<typeof TestStatusSchema>;

/**
 * A single test step within a test case
 */
export const TestStepSchema = z.object({
  /** Unique step identifier */
  id: z.string(),
  /** Human-readable step description */
  description: z.string(),
  /** Action to perform (click, type, navigate, assert, etc.) */
  action: z.string(),
  /** Locator for the target element, if applicable */
  locator: LocatorSchema.optional(),
  /** Data to input or assert, if applicable */
  data: z.unknown().optional(),
  /** Expected result for assertion steps */
  expected: z.string().optional(),
  /** Screenshot capture configuration for this step */
  screenshot: z.boolean().default(false),
  /** Step timeout in milliseconds */
  timeout: z.number().default(30000),
});

export type TestStep = z.infer<typeof TestStepSchema>;

/**
 * A complete test case definition
 */
export const TestCaseSchema = z.object({
  /** Unique test case identifier */
  id: z.string(),
  /** Human-readable test case name */
  name: z.string(),
  /** Type of test (web/mobile/api/visual) */
  type: TestTypeSchema,
  /** Current execution status */
  status: TestStatusSchema.default("pending"),
  /** Locators used in this test case */
  locators: z.array(LocatorSchema).default([]),
  /** Steps that make up the test */
  steps: z.array(TestStepSchema).default([]),
  /** Tags for filtering and grouping tests */
  tags: z.array(z.string()).default([]),
  /** AI-calculated health score (0-100, higher is healthier) */
  aiHealthScore: z.number().min(0).max(100).default(100),
  /** Calculated flakiness score (0-100, higher is more flaky) */
  flakinessScore: z.number().min(0).max(100).default(0),
  /** Timestamp of last successful run */
  lastRunAt: z.coerce.date().optional(),
  /** Timestamp when test was created */
  createdAt: z.coerce.date().default(() => new Date()),
  /** Timestamp when test was last modified */
  updatedAt: z.coerce.date().optional(),
  /** File path to the actual test code */
  filePath: z.string().optional(),
  /** Natural language description of what this test does */
  description: z.string().optional(),
});

export type TestCase = z.infer<typeof TestCaseSchema>;

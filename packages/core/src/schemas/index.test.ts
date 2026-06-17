import { describe, it, expect } from "vitest";
import {
  LocatorSchema,
  TestCaseSchema,
  TestSuiteSchema,
  TestRunSchema,
  ProjectSchema,
  EnvironmentSchema,
  TestResultSchema,
  StepResultSchema,
} from "./index.js";

describe("LocatorSchema", () => {
  it("should validate a valid locator", () => {
    const locator = LocatorSchema.parse({
      strategy: "css",
      value: "#submit-button",
      confidence: 95,
    });

    expect(locator.strategy).toBe("css");
    expect(locator.value).toBe("#submit-button");
    expect(locator.confidence).toBe(95);
  });

  it("should default confidence to 100", () => {
    const locator = LocatorSchema.parse({
      strategy: "xpath",
      value: "//button[@type='submit']",
    });

    expect(locator.confidence).toBe(100);
  });

  it("should accept healed locator fields", () => {
    const locator = LocatorSchema.parse({
      strategy: "aria",
      value: "button[aria-label='Submit']",
      confidence: 80,
      healedFrom: "#old-submit",
      healedAt: new Date("2025-01-01"),
    });

    expect(locator.healedFrom).toBe("#old-submit");
    expect(locator.healedAt).toBeInstanceOf(Date);
  });

  it("should reject invalid strategy", () => {
    expect(() =>
      LocatorSchema.parse({
        strategy: "invalid",
        value: "test",
      })
    ).toThrow();
  });

  it("should reject confidence out of range", () => {
    expect(() =>
      LocatorSchema.parse({
        strategy: "css",
        value: "test",
        confidence: 150,
      })
    ).toThrow();
  });
});

describe("TestCaseSchema", () => {
  it("should validate a valid test case", () => {
    const testCase = TestCaseSchema.parse({
      id: "test-001",
      name: "Login Test",
      type: "web",
      steps: [
        {
          id: "step-1",
          description: "Navigate to login",
          action: "navigate",
          data: { url: "https://example.com/login" },
        },
      ],
      tags: ["smoke", "auth"],
    });

    expect(testCase.id).toBe("test-001");
    expect(testCase.type).toBe("web");
    expect(testCase.status).toBe("pending");
    expect(testCase.aiHealthScore).toBe(100);
    expect(testCase.flakinessScore).toBe(0);
    expect(testCase.tags).toEqual(["smoke", "auth"]);
  });

  it("should default empty arrays and scores", () => {
    const testCase = TestCaseSchema.parse({
      id: "test-002",
      name: "Simple Test",
      type: "api",
    });

    expect(testCase.locators).toEqual([]);
    expect(testCase.steps).toEqual([]);
    expect(testCase.tags).toEqual([]);
    expect(testCase.aiHealthScore).toBe(100);
    expect(testCase.flakinessScore).toBe(0);
  });

  it("should accept all test types", () => {
    for (const type of ["web", "mobile", "api", "visual"] as const) {
      const testCase = TestCaseSchema.parse({
        id: `test-${type}`,
        name: `${type} test`,
        type,
      });
      expect(testCase.type).toBe(type);
    }
  });

  it("should set createdAt to current date", () => {
    const before = new Date();
    const testCase = TestCaseSchema.parse({
      id: "test-003",
      name: "Date Test",
      type: "web",
    });
    const after = new Date();

    expect(testCase.createdAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
    expect(testCase.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe("TestSuiteSchema", () => {
  it("should validate a valid suite", () => {
    const suite = TestSuiteSchema.parse({
      id: "suite-001",
      name: "Regression Suite",
      projectId: "proj-1",
      parallelism: 4,
      retries: 2,
    });

    expect(suite.id).toBe("suite-001");
    expect(suite.parallelism).toBe(4);
    expect(suite.retries).toBe(2);
    expect(suite.stopOnFailure).toBe(false);
    expect(suite.tests).toEqual([]);
  });

  it("should validate environment configuration", () => {
    const env = EnvironmentSchema.parse({
      name: "staging",
      baseUrl: "https://staging.example.com",
      headers: { Authorization: "Bearer token" },
      credentials: { username: "admin", password: "secret" },
      variables: { API_KEY: "test-key" },
    });

    expect(env.name).toBe("staging");
    expect(env.baseUrl).toBe("https://staging.example.com");
    expect(env.variables).toHaveProperty("API_KEY", "test-key");
  });

  it("should reject invalid base URL", () => {
    expect(() =>
      EnvironmentSchema.parse({
        name: "dev",
        baseUrl: "not-a-url",
      })
    ).toThrow();
  });
});

describe("TestRunSchema", () => {
  it("should validate a valid run", () => {
    const run = TestRunSchema.parse({
      id: "run-001",
      suiteId: "suite-1",
      status: "passed",
      startedAt: new Date("2025-01-01"),
      completedAt: new Date("2025-01-01T00:05:00"),
      triggeredBy: "manual",
    });

    expect(run.status).toBe("passed");
    expect(run.triggeredBy).toBe("manual");
    expect(run.results).toEqual([]);
    expect(run.duration).toBe(0);
  });

  it("should validate test results", () => {
    const result = TestResultSchema.parse({
      testId: "test-001",
      status: "failed",
      duration: 5230,
      error: "TimeoutError: locator.click: Timeout 30000ms",
      screenshot: "/screenshots/failure.png",
    });

    expect(result.testId).toBe("test-001");
    expect(result.status).toBe("failed");
    expect(result.duration).toBe(5230);
    expect(result.error).toContain("TimeoutError");
  });

  it("should validate step results", () => {
    const stepResult = StepResultSchema.parse({
      stepId: "step-1",
      status: "passed",
      duration: 1200,
    });

    expect(stepResult.stepId).toBe("step-1");
    expect(stepResult.consoleLogs).toEqual([]);
    expect(stepResult.networkRequests).toEqual([]);
  });
});

describe("ProjectSchema", () => {
  it("should validate a valid project", () => {
    const project = ProjectSchema.parse({
      id: "proj-001",
      name: "My App",
      baseUrl: "https://myapp.example.com",
      screenshotMode: "on-failure",
      videoRecording: true,
    });

    expect(project.id).toBe("proj-001");
    expect(project.screenshotMode).toBe("on-failure");
    expect(project.videoRecording).toBe(true);
    expect(project.traceRecording).toBe(false);
    expect(project.defaultTimeout).toBe(30000);
  });

  it("should accept integration configuration", () => {
    const project = ProjectSchema.parse({
      id: "proj-002",
      name: "Integrated App",
      baseUrl: "https://app.example.com",
      integrations: {
        slackWebhookUrl: "https://hooks.slack.com/services/xxx",
        emailConfig: {
          smtpHost: "smtp.example.com",
          smtpPort: 587,
          from: "tests@example.com",
          to: ["team@example.com"],
        },
      },
    });

    expect(project.integrations.slackWebhookUrl).toContain("hooks.slack.com");
    expect(project.integrations.emailConfig?.smtpPort).toBe(587);
  });

  it("should accept AI provider configuration", () => {
    const project = ProjectSchema.parse({
      id: "proj-003",
      name: "AI App",
      baseUrl: "https://ai.example.com",
      aiProvider: {
        type: "anthropic",
        model: "claude-sonnet-4-20250514",
      },
    });

    expect(project.aiProvider?.type).toBe("anthropic");
    expect(project.aiProvider?.model).toBe("claude-sonnet-4-20250514");
  });
});

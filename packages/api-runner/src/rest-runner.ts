import axios, { type AxiosInstance, type AxiosResponse, type AxiosError } from "axios";
import type { TestCase, TestStep, TestResult, StepResult } from "@testforge/core";
import type { EventBus } from "@testforge/core";
import type { FailureAnalyzer } from "@testforge/ai-engine";
import debug from "debug";

const log = debug("testforge:api-runner:rest");

/**
 * HTTP method types
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/**
 * REST test step data
 */
export interface RestStepData {
  /** HTTP method */
  method: HttpMethod;
  /** Request URL */
  url: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body */
  body?: unknown;
  /** Expected response status code */
  expectedStatus?: number;
  /** Expected response body pattern */
  expectedBody?: unknown;
  /** Authentication token */
  authToken?: string;
}

/**
 * Configuration for the REST runner
 */
export interface RestRunnerConfig {
  /** Base URL for all requests */
  baseUrl: string;
  /** Default timeout in ms */
  defaultTimeout: number;
  /** Default headers for all requests */
  defaultHeaders?: Record<string, string>;
  /** Authentication token */
  authToken?: string;
  /** Whether to follow redirects */
  followRedirects: boolean;
  /** Whether to validate SSL certificates */
  validateSSL: boolean;
}

/**
 * Default REST runner configuration
 */
export const DEFAULT_REST_CONFIG: RestRunnerConfig = {
  baseUrl: "",
  defaultTimeout: 30000,
  followRedirects: true,
  validateSSL: true,
};

/**
 * RestRunner executes HTTP API test cases using Axios
 *
 * Supports all HTTP methods, custom headers, body validation,
 * and integrates with FailureAnalyzer for diagnostics.
 *
 * @example
 * ```ts
 * const runner = new RestRunner(eventBus, { baseUrl: "https://api.example.com" });
 * const result = await runner.runTest(testCase);
 * ```
 */
export class RestRunner {
  private readonly _eventBus: EventBus;
  private readonly _config: RestRunnerConfig;
  private _client: AxiosInstance;

  constructor(eventBus: EventBus, config?: Partial<RestRunnerConfig>) {
    this._eventBus = eventBus;
    this._config = { ...DEFAULT_REST_CONFIG, ...config };
    this._client = this._createClient();
  }

  /**
   * Run a REST test case
   */
  async runTest(
    testCase: TestCase,
    options?: { failureAnalyzer?: FailureAnalyzer }
  ): Promise<TestResult> {
    log("Running REST test: %s", testCase.name);

    this._eventBus.emit("test:started", {
      testId: testCase.id,
      testName: testCase.name,
      testType: "api",
      suiteId: "unknown",
      runId: "unknown",
      timestamp: new Date(),
    });

    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    let testStatus: "passed" | "failed" | "skipped" = "passed";
    let testError: Error | undefined;

    for (const step of testCase.steps) {
      const stepResult = await this._executeStep(step);
      stepResults.push(stepResult);

      if (stepResult.status === "failed") {
        testStatus = "failed";
        testError = new Error(stepResult.error);

        if (options?.failureAnalyzer) {
          const analysis = await options.failureAnalyzer.analyze({
            error: testError,
            screenshot: Buffer.from(""),
            networkLog: [{
              url: step.data ? (step.data as RestStepData).url : "unknown",
              method: step.data ? (step.data as RestStepData).method : "GET",
              status: 500,
            }],
            domSnapshot: "",
            testCode: this._stepToCode(step),
          });

          log("REST failure analysis: %s", analysis.diagnosis);
        }

        break;
      }
    }

    const duration = Date.now() - startTime;

    const result: TestResult = {
      testId: testCase.id,
      status: testStatus,
      duration,
      stepResults,
      error: testError?.message,
    };

    if (testStatus === "passed") {
      this._eventBus.emit("test:passed", {
        testId: testCase.id,
        testName: testCase.name,
        duration,
        result,
        timestamp: new Date(),
      });
    } else {
      this._eventBus.emit("test:failed", {
        testId: testCase.id,
        testName: testCase.name,
        duration,
        error: testError?.message ?? "Unknown error",
        result,
        timestamp: new Date(),
      });
    }

    return result;
  }

  /**
   * Execute a single REST step
   */
  private async _executeStep(step: TestStep): Promise<StepResult> {
    const stepStartTime = Date.now();
    const data = step.data as RestStepData | undefined;

    if (!data?.method || !data.url) {
      return {
        stepId: step.id,
        status: "failed",
        duration: Date.now() - stepStartTime,
        error: "Missing method or URL in step data",
        consoleLogs: [],
        networkRequests: [],
      };
    }

    try {
      const url = data.url.startsWith("http")
        ? data.url
        : `${this._config.baseUrl}${data.url}`;

      const response = await this._client.request({
        method: data.method,
        url,
        data: data.body,
        headers: {
          ...this._config.defaultHeaders,
          ...data.headers,
          ...(data.authToken ? { Authorization: `Bearer ${data.authToken}` } : {}),
        },
        timeout: step.timeout ?? this._config.defaultTimeout,
      });

      // Validate response
      if (data.expectedStatus && response.status !== data.expectedStatus) {
        throw new Error(
          `Expected status ${data.expectedStatus}, got ${response.status}`
        );
      }

      if (data.expectedBody) {
        const bodyMatch = this._deepMatch(response.data, data.expectedBody);
        if (!bodyMatch) {
          throw new Error("Response body does not match expected pattern");
        }
      }

      return {
        stepId: step.id,
        status: "passed",
        duration: Date.now() - stepStartTime,
        consoleLogs: [],
        networkRequests: [{
          url,
          method: data.method,
          status: response.status,
          duration: Date.now() - stepStartTime,
        }],
      };
    } catch (error) {
      const duration = Date.now() - stepStartTime;
      const message = axios.isAxiosError(error)
        ? this._formatAxiosError(error)
        : error instanceof Error
          ? error.message
          : String(error);

      return {
        stepId: step.id,
        status: "failed",
        duration,
        error: message,
        consoleLogs: [],
        networkRequests: [],
      };
    }
  }

  /**
   * Create the Axios client with configured defaults
   */
  private _createClient(): AxiosInstance {
    const httpsAgent = this._config.validateSSL
      ? undefined
      : new (require("node:https") as typeof import("node:https")).Agent({ rejectUnauthorized: false });

    return axios.create({
      baseURL: this._config.baseUrl,
      timeout: this._config.defaultTimeout,
      maxRedirects: this._config.followRedirects ? 5 : 0,
      httpsAgent,
    });
  }

  /**
   * Format Axios error message
   */
  private _formatAxiosError(error: AxiosError): string {
    if (error.response) {
      return `HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`;
    }
    if (error.request) {
      return `No response received: ${error.message}`;
    }
    return error.message;
  }

  /**
   * Deep match response against expected pattern
   */
  private _deepMatch(actual: unknown, expected: unknown): boolean {
    if (typeof expected === "object" && expected !== null && typeof actual === "object" && actual !== null) {
      for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
        if (!(key in (actual as Record<string, unknown>))) return false;
        if (typeof value === "object") {
          if (!this._deepMatch((actual as Record<string, unknown>)[key], value)) return false;
        } else if ((actual as Record<string, unknown>)[key] !== value) {
          return false;
        }
      }
      return true;
    }
    return actual === expected;
  }

  /**
   * Convert step to code representation
   */
  private _stepToCode(step: TestStep): string {
    const data = step.data as RestStepData | undefined;
    if (!data) return `// Unknown step data`;
    return `const response = await axios.${data.method.toLowerCase()}('${data.url}'${data.body ? `, ${JSON.stringify(data.body)}` : ""});`;
  }
}

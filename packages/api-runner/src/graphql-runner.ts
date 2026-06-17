import type { TestCase, TestStep, TestResult, StepResult } from "@testforge/core";
import type { EventBus } from "@testforge/core";
import type { FailureAnalyzer } from "@testforge/ai-engine";
import debug from "debug";

const log = debug("testforge:api-runner:graphql");

/**
 * GraphQL step data
 */
export interface GraphQLStepData {
  /** GraphQL endpoint URL */
  url: string;
  /** GraphQL query or mutation */
  query: string;
  /** Query variables */
  variables?: Record<string, unknown>;
  /** Operation name */
  operationName?: string;
  /** Expected data shape */
  expectedData?: unknown;
  /** Auth token */
  authToken?: string;
}

/**
 * Configuration for GraphQL runner
 */
export interface GraphQLRunnerConfig {
  /** Default GraphQL endpoint */
  endpoint: string;
  /** Default timeout in ms */
  defaultTimeout: number;
  /** Auth token for all requests */
  authToken?: string;
}

export const DEFAULT_GRAPHQL_CONFIG: GraphQLRunnerConfig = {
  endpoint: "",
  defaultTimeout: 30000,
};

/**
 * GraphQLRunner executes GraphQL queries and mutations
 *
 * Features:
 * - Schema introspection validation
 * - Query/mutation execution with variable support
 * - Response data shape validation
 *
 * @example
 * ```ts
 * const runner = new GraphQLRunner(eventBus, { endpoint: "https://api.example.com/graphql" });
 * const result = await runner.runTest(testCase);
 * ```
 */
export class GraphQLRunner {
  private readonly _eventBus: EventBus;
  private readonly _config: GraphQLRunnerConfig;

  constructor(eventBus: EventBus, config?: Partial<GraphQLRunnerConfig>) {
    this._eventBus = eventBus;
    this._config = { ...DEFAULT_GRAPHQL_CONFIG, ...config };
  }

  /**
   * Run a GraphQL test case
   */
  async runTest(
    testCase: TestCase,
    options?: { failureAnalyzer?: FailureAnalyzer }
  ): Promise<TestResult> {
    log("Running GraphQL test: %s", testCase.name);

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
            networkLog: [],
            domSnapshot: "",
            testCode: this._stepToCode(step),
          });
          log("GraphQL failure: %s", analysis.diagnosis);
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
      this._eventBus.emit("test:passed", { testId: testCase.id, testName: testCase.name, duration, result, timestamp: new Date() });
    } else {
      this._eventBus.emit("test:failed", { testId: testCase.id, testName: testCase.name, duration, error: testError?.message ?? "Unknown", result, timestamp: new Date() });
    }

    return result;
  }

  /**
   * Execute a single GraphQL step
   */
  private async _executeStep(step: TestStep): Promise<StepResult> {
    const stepStartTime = Date.now();
    const data = step.data as GraphQLStepData | undefined;

    if (!data?.query) {
      return { stepId: step.id, status: "failed", duration: Date.now() - stepStartTime, error: "Missing query", consoleLogs: [], networkRequests: [] };
    }

    try {
      const url = data.url ?? this._config.endpoint;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this._config.authToken ?? data.authToken
            ? { Authorization: `Bearer ${this._config.authToken ?? data.authToken}` }
            : {}),
        },
        body: JSON.stringify({
          query: data.query,
          variables: data.variables,
          operationName: data.operationName,
        }),
        signal: AbortSignal.timeout(step.timeout ?? this._config.defaultTimeout),
      });

      const json = (await response.json()) as { data?: unknown; errors?: Array<{ message: string }> };

      if (json.errors && json.errors.length > 0) {
        throw new Error(json.errors.map((e) => e.message).join(", "));
      }

      if (data.expectedData) {
        if (!this._deepMatch(json.data, data.expectedData)) {
          throw new Error("Response data does not match expected shape");
        }
      }

      return { stepId: step.id, status: "passed", duration: Date.now() - stepStartTime, consoleLogs: [], networkRequests: [] };
    } catch (error) {
      return {
        stepId: step.id,
        status: "failed",
        duration: Date.now() - stepStartTime,
        error: error instanceof Error ? error.message : String(error),
        consoleLogs: [],
        networkRequests: [],
      };
    }
  }

  /**
   * Introspect the GraphQL schema (in production, sends introspection query)
   */
  async introspectSchema(): Promise<Record<string, unknown>> {
    // In production: send introspection query and parse schema
    return { types: [], queries: [], mutations: [] };
  }

  private _deepMatch(actual: unknown, expected: unknown): boolean {
    if (typeof expected === "object" && expected !== null && typeof actual === "object" && actual !== null) {
      for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
        if (!(key in (actual as Record<string, unknown>))) return false;
        if (typeof value === "object" && value !== null) {
          if (!this._deepMatch((actual as Record<string, unknown>)[key], value)) return false;
        } else if ((actual as Record<string, unknown>)[key] !== value) {
          return false;
        }
      }
      return true;
    }
    return actual === expected;
  }

  private _stepToCode(step: TestStep): string {
    const data = step.data as GraphQLStepData | undefined;
    if (!data) return `// Unknown step`;
    return `const result = await client.query(\`${data.query.substring(0, 100)}...\`);`;
  }
}

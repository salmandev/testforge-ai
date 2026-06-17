import type { TestCase, TestStep, TestResult, StepResult, Locator } from "@testforge/core";
import type { EventBus } from "@testforge/core";
import type { SelfHealer, FailureAnalyzer } from "@testforge/ai-engine";
import debug from "debug";

const log = debug("testforge:web-runner");

/**
 * Simple concurrency limiter (replaces p-limit to avoid extra dependency)
 */
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (queue.length > 0 && active < concurrency) {
      active++;
      queue.shift()!();
    }
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            active--;
            next();
          });
      };
      if (active < concurrency) {
        active++;
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

/**
 * Browser type supported by Playwright
 */
export type BrowserType = "chromium" | "firefox" | "webkit";

/**
 * Configuration for the Playwright runner
 */
export interface PlaywrightRunnerConfig {
  /** Browser to use */
  browser: BrowserType;
  /** Whether to run in headed mode */
  headed: boolean;
  /** Whether to record video */
  videoRecording: boolean;
  /** Video output directory */
  videoDir?: string;
  /** Whether to capture trace */
  traceRecording: boolean;
  /** Screenshot mode */
  screenshotMode: "off" | "on-failure" | "always";
  /** Default timeout for actions in ms */
  defaultTimeout: number;
  /** Base URL for the application */
  baseUrl?: string;
  /** Viewport size */
  viewport?: { width: number; height: number };
  /** Whether to emulate mobile device */
  mobile: boolean;
  /** Number of retries for failed tests */
  retries: number;
  /** Max parallel test workers (default: 1 = sequential) */
  parallel: number;
}

/**
 * Default runner configuration
 */
export const DEFAULT_RUNNER_CONFIG: PlaywrightRunnerConfig = {
  browser: "chromium",
  headed: false,
  videoRecording: false,
  traceRecording: false,
  screenshotMode: "on-failure",
  defaultTimeout: 30000,
  mobile: false,
  retries: 0,
  parallel: 1,
};

/**
 * Network entry captured during test execution
 */
export interface NetworkEntry {
  url: string;
  method: string;
  status?: number;
  duration?: number;
  requestBody?: string;
  responseBody?: string;
}

/**
 * Result of running a single test case
 */
export interface TestExecutionResult {
  result: TestResult;
  networkLog: NetworkEntry[];
  domSnapshot: string;
  error?: Error;
}

// Dynamic Playwright types (lazy-loaded, untyped to avoid Playwright coupling)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlaywrightBrowser = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlaywrightLocator = any;

/**
 * PlaywrightRunner wraps Playwright to execute web test cases
 * with AI-powered self-healing and failure analysis.
 *
 * Features:
 * - Hooks into SelfHealer before each locator action
 * - Triggers FailureAnalyzer after each failure
 * - Captures screenshots before/after each step (configurable)
 * - Intercepts all XHR/fetch for FailureAnalyzer context
 * - Supports parallel execution via worker pools
 *
 * @example
 * ```ts
 * const runner = new PlaywrightRunner(eventBus, {
 *   browser: "chromium",
 *   baseUrl: "https://example.com",
 * });
 *
 * const result = await runner.runTest(testCase, {
 *   selfHealer,
 *   failureAnalyzer,
 * });
 * ```
 */
export class PlaywrightRunner {
  private readonly _config: PlaywrightRunnerConfig;
  private readonly _eventBus: EventBus;
  private _browser: PlaywrightBrowser | null = null;

  constructor(eventBus: EventBus, config?: Partial<PlaywrightRunnerConfig>) {
    this._eventBus = eventBus;
    this._config = { ...DEFAULT_RUNNER_CONFIG, ...config };
  }

  /**
   * Initialize the browser instance
   */
  async initialize(): Promise<void> {
    if (this._browser) return;

    log("Launching %s browser (headed: %s)", this._config.browser, this._config.headed);

    const { chromium, firefox, webkit } = await import("@playwright/test");
    const launchOptions = {
      headless: !this._config.headed,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };

    switch (this._config.browser) {
      case "chromium":
        this._browser = await chromium.launch(launchOptions);
        break;
      case "firefox":
        this._browser = await firefox.launch(launchOptions);
        break;
      case "webkit":
        this._browser = await webkit.launch(launchOptions);
        break;
    }

    log("Browser launched: %s", this._config.browser);
  }

  /**
   * Close the browser instance
   */
  async teardown(): Promise<void> {
    if (this._browser) {
      await this._browser.close() as Promise<void>;
      this._browser = null;
      log("Browser closed");
    }
  }

  /**
   * Run a single test case
   */
  async runTest(
    testCase: TestCase,
    options?: { selfHealer?: SelfHealer; failureAnalyzer?: FailureAnalyzer }
  ): Promise<TestExecutionResult> {
    if (!this._browser) {
      throw new Error("Browser not initialized. Call initialize() first.");
    }

    const networkLog: NetworkEntry[] = [];
    let domSnapshot = "";

    log("Running test: %s (%s)", testCase.name, testCase.id);

    this._eventBus.emit("test:started", {
      testId: testCase.id,
      testName: testCase.name,
      testType: testCase.type,
      suiteId: "unknown",
      runId: "unknown",
      timestamp: new Date(),
    });

    const browser = this._browser as Record<string, unknown>;
    const context = await (browser.newContext as (opts?: Record<string, unknown>) => Promise<Record<string, unknown>>)?.({
      viewport: this._config.viewport ?? { width: 1280, height: 720 },
      recordVideo: this._config.videoRecording ? { dir: this._config.videoDir ?? "./videos" } : undefined,
    });

    const page = await (context?.newPage as (() => Promise<Record<string, unknown>>))?.();

    if (!page) throw new Error("Failed to create page");

    // Network interceptor
    if (typeof page.on === "function") {
      page.on("request", (req: { url: () => string; method: () => string }) => {
        networkLog.push({ url: req.url(), method: req.method() });
      });
    }

    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    let testStatus: "passed" | "failed" | "skipped" = "passed";
    let testError: Error | undefined;

    try {
      if (this._config.baseUrl && testCase.steps.length > 0) {
        await (page.goto as (url: string, opts?: Record<string, unknown>) => Promise<void>)?.(this._config.baseUrl, {
          timeout: this._config.defaultTimeout,
        });
      }

      for (const step of testCase.steps) {
        const stepResult = await this._executeStep(page, step, options?.selfHealer);
        stepResults.push(stepResult);

        if (stepResult.status === "failed") {
          testStatus = "failed";
          testError = new Error(stepResult.error);
          domSnapshot = (await (page.content as (() => Promise<string>))?.()) ?? "";

          if (options?.failureAnalyzer) {
            const screenshot = await (page.screenshot as (() => Promise<Buffer>))?.();
            if (screenshot) {
              const analysis = await options.failureAnalyzer.analyze({
                error: testError,
                screenshot,
                networkLog,
                domSnapshot,
                testCode: this._stepToCode(step),
              });
              log("Failure analysis: %s (confidence: %d%%)", analysis.diagnosis, analysis.confidence);
            }
          }
          break;
        }
      }
    } catch (error) {
      testStatus = "failed";
      testError = error instanceof Error ? error : new Error(String(error));
      domSnapshot = (await (page.content as (() => Promise<string>))?.()) ?? "";
      log("Test error: %O", testError);
    }

    const duration = Date.now() - startTime;

    let screenshotPath: string | undefined;
    if (this._config.screenshotMode === "always") {
      screenshotPath = `./screenshots/${testCase.id}-final.png`;
      await (page.screenshot as (opts?: Record<string, string>) => Promise<void>)?.({ path: screenshotPath }).catch(() => undefined);
    } else if (this._config.screenshotMode === "on-failure" && testStatus === "failed") {
      screenshotPath = `./screenshots/${testCase.id}-failure.png`;
      await (page.screenshot as (opts?: Record<string, string>) => Promise<void>)?.({ path: screenshotPath }).catch(() => undefined);
    }

    if (this._config.traceRecording && context?.tracing) {
      await (context.tracing as Record<string, (opts?: Record<string, string>) => Promise<void>>).stop?.({
        path: `./traces/${testCase.id}.zip`,
      }).catch(() => undefined);
    }

    await (context.close as (() => Promise<void>))?.();

    const result: TestResult = {
      testId: testCase.id,
      status: testStatus,
      duration,
      stepResults,
      error: testError?.message,
      screenshot: screenshotPath,
      deviceInfo: { browser: this._config.browser, viewport: this._config.viewport, mobile: this._config.mobile },
    };

    if (testStatus === "passed") {
      this._eventBus.emit("test:passed", { testId: testCase.id, testName: testCase.name, duration, result, timestamp: new Date() });
    } else {
      this._eventBus.emit("test:failed", { testId: testCase.id, testName: testCase.name, duration, error: testError?.message ?? "Unknown", screenshot: screenshotPath, result, timestamp: new Date() });
    }

    return { result, networkLog, domSnapshot, error: testError };
  }

  /**
   * Run multiple test cases in parallel with configurable concurrency
   *
   * @param testCases - Array of test cases to execute
   * @param options - Runner options including parallel count
   * @returns Array of execution results
   */
  async runTests(
    testCases: TestCase[],
    options?: {
      selfHealer?: SelfHealer;
      failureAnalyzer?: FailureAnalyzer;
      parallel?: number;
    }
  ): Promise<TestExecutionResult[]> {
    const concurrency = options?.parallel ?? this._config.parallel;
    const limit = createLimiter(Math.max(1, concurrency));

    log("Running %d tests with concurrency: %d", testCases.length, concurrency);

    const results = await Promise.all(
      testCases.map((tc) => limit(() => this.runTest(tc, options)))
    );

    const passed = results.filter((r) => r.result.status === "passed").length;
    const failed = results.filter((r) => r.result.status === "failed").length;
    log("Parallel run complete: %d passed, %d failed", passed, failed);

    return results;
  }

  /**
   * Execute a single test step
   */
  private async _executeStep(
    page: Record<string, unknown>,
    step: TestStep,
    selfHealer?: SelfHealer
  ): Promise<StepResult> {
    const stepStartTime = Date.now();

    try {
      if (this._config.screenshotMode === "always") {
        await (page.screenshot as (opts?: Record<string, string>) => Promise<void>)?.({
          path: `./screenshots/step-${step.id}-before.png`,
        }).catch(() => undefined);
      }

      await this._performAction(page, step, selfHealer);

      if (this._config.screenshotMode === "always") {
        await (page.screenshot as (opts?: Record<string, string>) => Promise<void>)?.({
          path: `./screenshots/step-${step.id}-after.png`,
        }).catch(() => undefined);
      }

      return {
        stepId: step.id,
        status: "passed",
        duration: Date.now() - stepStartTime,
        consoleLogs: [],
        networkRequests: [],
      };
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
   * Perform the step action on the page
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _performAction(
    page: any,
    step: TestStep,
    selfHealer?: SelfHealer
  ): Promise<void> {
    const timeout = step.timeout ?? this._config.defaultTimeout;

    switch (step.action.toLowerCase()) {
      case "navigate": {
        const url = typeof step.data === "object" && step.data !== null
          ? (step.data as Record<string, unknown>).url as string | undefined
          : undefined;
        if (url) {
          await page.goto(url, { timeout });
        }
        break;
      }
      case "click": {
        if (step.locator) {
          const locator = await this._getLocator(page, step.locator, selfHealer);
          await locator.click({ timeout });
        }
        break;
      }
      case "type":
      case "fill": {
        if (step.locator && typeof step.data === "string") {
          const locator = await this._getLocator(page, step.locator, selfHealer);
          await locator.fill(step.data, { timeout });
        }
        break;
      }
      case "select": {
        if (step.locator && typeof step.data === "string") {
          const locator = await this._getLocator(page, step.locator, selfHealer);
          await locator.selectOption(step.data, { timeout });
        }
        break;
      }
      case "check": {
        if (step.locator) {
          const locator = await this._getLocator(page, step.locator, selfHealer);
          await locator.check({ timeout });
        }
        break;
      }
      case "assert":
      case "expect": {
        if (step.locator && step.expected) {
          const locator = await this._getLocator(page, step.locator, selfHealer);
          const text = await locator.textContent() as string | null;
          if (text !== step.expected) {
            throw new Error(`Expected text "${step.expected}", got "${text ?? ""}"`);
          }
        } else if (step.expected) {
          if (step.expected.startsWith("http") || step.expected.startsWith("/")) {
            await page.waitForURL(step.expected, { timeout });
          } else {
            await page.waitForLoadState("load", { timeout });
          }
        }
        break;
      }
      case "wait": {
        const waitTime = typeof step.data === "number" ? step.data : 1000;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        break;
      }
      case "press": {
        if (step.locator && typeof step.data === "string") {
          const locator = await this._getLocator(page, step.locator, selfHealer);
          await locator.press(step.data, { timeout });
        }
        break;
      }
      case "hover": {
        if (step.locator) {
          const locator = await this._getLocator(page, step.locator, selfHealer);
          await locator.hover({ timeout });
        }
        break;
      }
      default:
        log("Unknown action: %s", step.action);
        break;
    }
  }

  /**
   * Get a locator, attempting self-healing if configured
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _getLocator(
    page: any,
    locator: Locator,
    selfHealer?: SelfHealer
  ): Promise<PlaywrightLocator> {
    const pwLocator = this._toPlaywrightLocator(page, locator);

    if (!selfHealer) return pwLocator;

    try {
      await pwLocator.waitFor({ timeout: 3000 });
      return pwLocator;
    } catch {
      log("Locator failed, attempting self-heal: %s (%s)", locator.value, locator.strategy);

      const snapshot = await page.content() ?? "";
      const screenshot = await page.screenshot();

      if (!screenshot) return pwLocator;

      const healed = await selfHealer.heal({
        locator,
        pageSnapshot: snapshot,
        screenshot,
        error: `Element not found: ${locator.value}`,
      });

      log("Healed locator: %s -> %s (confidence: %d%%)", locator.value, healed.healedLocator.value, healed.confidence);
      return this._toPlaywrightLocator(page, healed.healedLocator);
    }
  }

  /**
   * Convert a TestForge Locator to a Playwright Locator
   */
  private _toPlaywrightLocator(page: Record<string, unknown>, locator: Locator): PlaywrightLocator {
    switch (locator.strategy) {
      case "css":
        return (page.locator as (sel: string) => PlaywrightLocator)?.(locator.value);
      case "xpath":
        return (page.locator as (sel: string) => PlaywrightLocator)?.(`xpath=${locator.value}`);
      case "aria":
        return (page.getByRole as (role: string) => PlaywrightLocator)?.(locator.value);
      case "text":
        return (page.getByText as (text: string) => PlaywrightLocator)?.(locator.value);
      case "visual":
        return (page.locator as (sel: string) => PlaywrightLocator)?.("body");
      default: {
        const _exhaustiveCheck: never = locator.strategy;
        throw new Error(`Unknown locator strategy: ${_exhaustiveCheck}`);
      }
    }
  }

  /**
   * Convert a step to code representation
   */
  private _stepToCode(step: TestStep): string {
    const dataStr = typeof step.data === "string" ? `"${step.data}"` : JSON.stringify(step.data);
    return `await page.${step.action.toLowerCase()}(${step.locator?.value ? `"${step.locator.value}"` : ""}${step.data ? `, ${dataStr}` : ""});`;
  }
}

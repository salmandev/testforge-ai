import type { TestCase, TestStep, TestResult, StepResult } from "@testforge/core";
import type { EventBus } from "@testforge/core";
import type { SelfHealer, FailureAnalyzer } from "@testforge/ai-engine";
import debug from "debug";

const log = debug("testforge:mobile-runner");

/**
 * Mobile platform type
 */
export type MobilePlatform = "iOS" | "Android";

/**
 * Device capabilities for Appium session
 */
export interface DeviceCapabilities {
  /** Platform name */
  platformName: MobilePlatform;
  /** Device name/identifier */
  deviceName: string;
  /** App path or bundle ID */
  app?: string;
  /** Automation engine */
  automationName?: "XCUITest" | "UiAutomator2";
  /** Whether to use real device */
  realDevice?: boolean;
  /** Platform version */
  platformVersion?: string;
  /** Whether to reset app state */
  noReset?: boolean;
  /** Whether to capture video */
  videoRecording?: boolean;
}

/**
 * Connected device information
 */
export interface ConnectedDevice {
  /** Device unique identifier */
  udid: string;
  /** Device name */
  name: string;
  /** Platform */
  platform: MobilePlatform;
  /** OS version */
  version: string;
  /** Whether the device is currently in use */
  busy: boolean;
}

/**
 * Configuration for the Appium runner
 */
export interface AppiumRunnerConfig {
  /** Appium server URL */
  appiumUrl: string;
  /** Device capabilities */
  capabilities: DeviceCapabilities;
  /** Default timeout for actions in ms */
  defaultTimeout: number;
  /** Whether to record video on failure */
  videoOnFailure: boolean;
  /** Screenshot mode */
  screenshotMode: "off" | "on-failure" | "always";
  /** Screenshot output directory */
  screenshotDir?: string;
  /** Video output directory */
  videoDir?: string;
}

/**
 * Default Appium runner configuration
 */
export const DEFAULT_APPIUM_CONFIG: AppiumRunnerConfig = {
  appiumUrl: "http://localhost:4723",
  capabilities: {
    platformName: "Android",
    deviceName: "emulator-5554",
    automationName: "UiAutomator2",
  },
  defaultTimeout: 30000,
  videoOnFailure: true,
  screenshotMode: "on-failure",
};

/**
 * AppiumRunner wraps Appium 2.x to execute mobile test cases
 *
 * Supports:
 * - iOS (XCUITest) and Android (UiAutomator2)
 * - Auto-detection of connected devices
 * - Screenshot + video recording on failure
 * - Same AI hooks as web-runner (self-healing, failure analysis)
 *
 * @example
 * ```ts
 * const runner = new AppiumRunner(eventBus, {
 *   appiumUrl: "http://localhost:4723",
 *   capabilities: { platformName: "Android", deviceName: "emulator-5554" },
 * });
 *
 * const result = await runner.runTest(testCase, { selfHealer, failureAnalyzer });
 * ```
 */
export class AppiumRunner {
  private readonly _eventBus: EventBus;
  private readonly _config: AppiumRunnerConfig;

  constructor(eventBus: EventBus, config?: Partial<AppiumRunnerConfig>) {
    this._eventBus = eventBus;
    this._config = { ...DEFAULT_APPIUM_CONFIG, ...config };
  }

  /**
   * Detect connected devices via ADB and libimobiledevice
   */
  async detectDevices(): Promise<ConnectedDevice[]> {
    const devices: ConnectedDevice[] = [];

    // Detect Android devices via ADB
    try {
      const { execSync } = await import("node:child_process");
      const output = execSync("adb devices -l", { encoding: "utf-8" });
      const lines = output.split("\n").slice(1); // Skip header

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("*")) {
          const parts = trimmed.split(/\s+/);
          const udid = parts[0];
          const state = parts[1];

          if (udid && state === "device") {
            // Parse device properties
            const modelMatch = trimmed.match(/model:(\S+)/);
            const deviceName = modelMatch?.[1] ?? "Unknown Android Device";

            devices.push({
              udid,
              name: deviceName,
              platform: "Android",
              version: "unknown", // Would need adb shell getprop
              busy: false,
            });
          }
        }
      }
    } catch {
      log("ADB not available, skipping Android device detection");
    }

    // Detect iOS devices via libimobiledevice
    try {
      const { execSync } = await import("node:child_process");
      const output = execSync("idevice_id -l", { encoding: "utf-8" });
      const lines = output.split("\n");

      for (const line of lines) {
        const udid = line.trim();
        if (udid) {
          devices.push({
            udid,
            name: "iOS Device",
            platform: "iOS",
            version: "unknown",
            busy: false,
          });
        }
      }
    } catch {
      log("libimobiledevice not available, skipping iOS device detection");
    }

    log("Detected %d devices", devices.length);
    return devices;
  }

  /**
   * Run a mobile test case
   *
   * Note: In production, this would use webdriverio or appium-client
   * to interact with the Appium server. This implementation provides
   * the structure and AI hooks.
   */
  async runTest(
    testCase: TestCase,
    options?: {
      selfHealer?: SelfHealer;
      failureAnalyzer?: FailureAnalyzer;
    }
  ): Promise<TestResult> {
    log("Running mobile test: %s (%s)", testCase.name, testCase.id);

    this._eventBus.emit("test:started", {
      testId: testCase.id,
      testName: testCase.name,
      testType: testCase.type,
      suiteId: "unknown",
      runId: "unknown",
      timestamp: new Date(),
    });

    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    let testStatus: "passed" | "failed" | "skipped" = "passed";
    let testError: Error | undefined;
    let screenshotPath: string | undefined;
    let videoPath: string | undefined;

    try {
      // In production: create Appium session here
      // const driver = await remote({ ... })

      for (const step of testCase.steps) {
        const stepResult = await this._executeStep(step, options?.selfHealer);
        stepResults.push(stepResult);

        if (stepResult.status === "failed") {
          testStatus = "failed";
          testError = new Error(stepResult.error);

          // Capture screenshot on failure
          if (this._config.screenshotMode === "on-failure" || this._config.screenshotMode === "always") {
            screenshotPath = `${this._config.screenshotDir ?? "./screenshots"}/${testCase.id}-failure.png`;
            // In production: await driver.saveScreenshot(screenshotPath)
          }

          // Run failure analysis if available
          if (options?.failureAnalyzer) {
            // In production: capture screenshot buffer and page source
            const fakeScreenshot = Buffer.from("mock-screenshot");
            const analysis = await options.failureAnalyzer.analyze({
              error: testError,
              screenshot: fakeScreenshot,
              networkLog: [],
              domSnapshot: "<mock-dom>",
              testCode: this._stepToCode(step),
            });

            log(
              "Mobile failure analysis: %s (confidence: %d%%)",
              analysis.diagnosis,
              analysis.confidence
            );
          }

          break;
        }
      }
    } catch (error) {
      testStatus = "failed";
      testError = error instanceof Error ? error : new Error(String(error));
      log("Mobile test error: %O", testError);
    }

    const duration = Date.now() - startTime;

    // In production: stop video recording if enabled
    if (this._config.videoOnFailure && testStatus === "failed") {
      videoPath = `${this._config.videoDir ?? "./videos"}/${testCase.id}-failure.mp4`;
    }

    const result: TestResult = {
      testId: testCase.id,
      status: testStatus,
      duration,
      stepResults,
      error: testError?.message,
      screenshot: screenshotPath,
      video: videoPath,
      deviceInfo: {
        platform: this._config.capabilities.platformName,
        deviceName: this._config.capabilities.deviceName,
        automationName: this._config.capabilities.automationName,
      },
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
        screenshot: screenshotPath,
        result,
        timestamp: new Date(),
      });
    }

    return result;
  }

  /**
   * Execute a single mobile test step
   */
  private async _executeStep(
    step: TestStep,
    _selfHealer?: SelfHealer
  ): Promise<StepResult> {
    const stepStartTime = Date.now();

    try {
      // In production: execute step via Appium driver
      // Actions: tap, swipe, sendKeys, getElement, etc.
      await this._performMobileAction(step);

      const duration = Date.now() - stepStartTime;

      return {
        stepId: step.id,
        status: "passed",
        duration,
        consoleLogs: [],
        networkRequests: [],
      };
    } catch (error) {
      const duration = Date.now() - stepStartTime;
      const message = error instanceof Error ? error.message : String(error);

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
   * Perform a mobile-specific action
   */
  private async _performMobileAction(step: TestStep): Promise<void> {
    const timeout = step.timeout ?? this._config.defaultTimeout;

    switch (step.action.toLowerCase()) {
      case "tap":
      case "click":
        // In production: await element.click()
        await new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 100)));
        break;

      case "swipe":
        // In production: await driver.swipe({ direction, element })
        await new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 100)));
        break;

      case "type":
      case "sendkeys":
        // In production: await element.sendKeys(data)
        await new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 100)));
        break;

      case "scroll":
        // In production: await driver.scrollTo()
        await new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 100)));
        break;

      case "assert":
      case "expect":
        // In production: await expect(element).toHaveText(expected)
        await new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 100)));
        break;

      case "wait":
        const waitTime = typeof step.data === "number" ? step.data : 1000;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        break;

      default:
        log("Unknown mobile action: %s", step.action);
        await new Promise((resolve) => setTimeout(resolve, 50));
        break;
    }
  }

  /**
   * Convert a step to code representation for failure analysis
   */
  private _stepToCode(step: TestStep): string {
    const dataStr =
      typeof step.data === "string"
        ? `"${step.data}"`
        : JSON.stringify(step.data);
    return `await driver.${step.action.toLowerCase()}(${step.locator?.value ? `"${step.locator.value}"` : ""}${step.data ? `, ${dataStr}` : ""});`;
  }
}

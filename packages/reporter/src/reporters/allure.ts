import type { TestRunData, TestResultData } from "../types.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import debug from "debug";

const log = debug("testforge:reporter:allure");

/**
 * Allure test result XML entry
 */
export interface AllureTestResult {
  name: string;
  status: "passed" | "failed" | "broken" | "skipped";
  start: number;
  stop: number;
  duration: number;
  description: string;
  labels: { name: string; value: string }[];
  steps: AllureStep[];
  attachments: AllureAttachment[];
}

/**
 * Allure step entry
 */
interface AllureStep {
  name: string;
  status: "passed" | "failed" | "broken" | "skipped";
  start: number;
  stop: number;
  duration: number;
  attachments: AllureAttachment[];
}

/**
 * Allure attachment reference
 */
interface AllureAttachment {
  name: string;
  type: string;
  source: string;
}

/**
 * AllureReporter generates standard Allure XML + HTML output
 *
 * Produces:
 * - allure-results/*.json — individual test result files
 * - allure-results/*.txt — attachment references
 * - Compatible with allure-commandline for HTML generation
 */
export class AllureReporter {
  private readonly _outputDir: string;

  /**
   * Create an Allure reporter
   *
   * @param outputDir - Directory to write Allure result files (default: ./allure-results)
   */
  constructor(outputDir?: string) {
    this._outputDir = outputDir ?? join(process.cwd(), "allure-results");
  }

  /**
   * Generate Allure result files from a test run
   *
   * @param runData - Complete test run data
   * @returns Paths to generated result files
   */
  async generate(runData: TestRunData): Promise<string[]> {
    log("Generating Allure results for run: %s", runData.runId);

    await mkdir(this._outputDir, { recursive: true });

    const generatedFiles: string[] = [];

    // Generate environment.json
    const envFile = join(this._outputDir, "environment.properties");
    const envContent = [
      `URL=${runData.environment ?? "unknown"}`,
      `Trigger=${runData.triggeredBy}`,
      ...(runData.gitSha ? [`GitSHA=${runData.gitSha}`] : []),
      ...(runData.ciUrl ? [`CI_URL=${runData.ciUrl}`] : []),
    ].join("\n");

    await writeFile(envFile, envContent);
    generatedFiles.push(envFile);

    // Generate categories.json for test categorization
    const categoriesFile = join(this._outputDir, "categories.json");
    await writeFile(
      categoriesFile,
      JSON.stringify(
        [
          {
            name: "Product Defects",
            matchedStatuses: ["failed"],
            messageRegex: [".*"],
          },
          {
            name: "Test Defects",
            matchedStatuses: ["broken"],
          },
          {
            name: "Intermittent Issues",
            matchedStatuses: ["flaky"],
          },
        ],
        null,
        2
      )
    );
    generatedFiles.push(categoriesFile);

    // Generate individual test result JSON files
    for (const result of runData.results) {
      const allureResult = this._toAllureResult(result, runData);
      const fileName = `${allureResult.uuid ?? crypto.randomUUID()}-result.json`;
      const filePath = join(this._outputDir, fileName);

      await writeFile(filePath, JSON.stringify(allureResult, null, 2));
      generatedFiles.push(filePath);

      // Write screenshot attachments if available
      if (result.screenshotPath) {
        const attachmentName = `${result.testId}-screenshot.png`;
        const attachmentFile = join(this._outputDir, attachmentName);
        try {
          const { copyFile } = await import("node:fs/promises");
          await copyFile(result.screenshotPath, attachmentFile);
          await writeFile(
            join(this._outputDir, `${attachmentName}-attachment.txt`),
            result.screenshotPath
          );
          generatedFiles.push(attachmentFile);
        } catch {
          log("Failed to copy screenshot: %s", result.screenshotPath);
        }
      }
    }

    // Generate executor.json
    const executorFile = join(this._outputDir, "executor.json");
    await writeFile(
      executorFile,
      JSON.stringify(
        {
          name: "TestForge AI",
          type: "testforge",
          buildName: `Run ${runData.runId}`,
          buildUrl: runData.ciUrl ?? "",
        },
        null,
        2
      )
    );
    generatedFiles.push(executorFile);

    log("Generated %d Allure result files", generatedFiles.length);
    return generatedFiles;
  }

  /**
   * Convert TestResultData to Allure JSON structure
   */
  private _toAllureResult(
    result: TestResultData,
    runData: TestRunData
  ): Record<string, unknown> {
    const now = Date.now();
    const status =
      result.status === "passed"
        ? "passed"
        : result.status === "skipped"
          ? "skipped"
          : result.status === "flaky"
            ? "flaky"
            : "failed";

    return {
      uuid: `${runData.runId}-${result.testId}`,
      historyId: result.testId,
      name: result.testName,
      status,
      statusDetails: result.error
        ? { message: result.error, trace: result.error }
        : undefined,
      stage: "finished",
      description: `Test type: ${result.testType}\nTags: ${result.tags.join(", ") || "none"}`,
      start: now - result.duration,
      stop: now,
      duration: result.duration,
      labels: [
        { name: "suite", value: runData.suiteId },
        { name: "testType", value: result.testType },
        ...result.tags.map((tag) => ({ name: "tag", value: tag })),
        ...(result.deviceInfo
          ? [{ name: "device", value: JSON.stringify(result.deviceInfo) }]
          : []),
      ],
      links: runData.ciUrl
        ? [{ name: "CI Build", url: runData.ciUrl, type: "link" }]
        : [],
      steps: result.steps.map((step, index) => ({
        name: step.description,
        status:
          step.status === "passed"
            ? "passed"
            : step.status === "skipped"
              ? "skipped"
              : "failed",
        stage: "finished",
        start: now - result.duration + index,
        stop: now - result.duration + index + step.duration,
        duration: step.duration,
        attachments: step.screenshotPath
          ? [
              {
                name: "Screenshot",
                type: "image/png",
                source: `${result.testId}-step-${index}-screenshot.txt`,
              },
            ]
          : [],
      })),
      attachments: result.screenshotPath
        ? [
            {
              name: "Failure Screenshot",
              type: "image/png",
              source: `${result.testId}-screenshot.txt`,
            },
          ]
        : [],
    };
  }
}

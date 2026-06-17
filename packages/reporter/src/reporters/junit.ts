import type { TestRunData, TestResultData } from "../types.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import debug from "debug";

const log = debug("testforge:reporter:junit");

/**
 * JUnit XML test suite element
 */
interface JUnitTestSuite {
  name: string;
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  time: number;
  timestamp: string;
  hostname: string;
  testCases: JUnitTestCase[];
}

/**
 * JUnit XML test case element
 */
interface JUnitTestCase {
  name: string;
  classname: string;
  time: number;
  failure?: { message: string; type: string; content: string };
  skipped?: boolean;
  error?: { message: string; type: string; content: string };
}

/**
 * JUnitReporter generates standard JUnit XML output
 *
 * Compatible with:
 * - Jenkins / CI servers
 * - GitHub Actions test results
 * - Azure DevOps
 * - Any tool that parses JUnit XML
 *
 * @example
 * ```ts
 * const reporter = new JUnitReporter("./test-results");
 * const files = await reporter.generate(runData);
 * ```
 */
export class JUnitReporter {
  private readonly _outputDir: string;

  constructor(outputDir?: string) {
    this._outputDir = outputDir ?? join(process.cwd(), "test-results");
  }

  /**
   * Generate JUnit XML report files
   *
   * @param runData - Complete test run data
   * @returns Paths to generated XML files
   */
  async generate(runData: TestRunData): Promise<string[]> {
    log("Generating JUnit XML for run: %s", runData.runId);

    await mkdir(this._outputDir, { recursive: true });

    const suites = this._toJUnitSuites(runData);
    const generatedFiles: string[] = [];

    // Generate individual suite XML files
    for (const suite of suites) {
      const xml = this._renderSuiteXml(suite);
      const fileName = `TEST-${this._sanitize(suite.name)}.xml`;
      const filePath = join(this._outputDir, fileName);
      await writeFile(filePath, xml, "utf-8");
      generatedFiles.push(filePath);
      log("Written JUnit XML: %s", fileName);
    }

    // Generate combined XML with all suites
    if (suites.length > 1) {
      const combinedXml = this._renderCombinedXml(suites);
      const combinedPath = join(this._outputDir, `TEST-combined-${runData.runId}.xml`);
      await writeFile(combinedPath, combinedXml, "utf-8");
      generatedFiles.push(combinedPath);
    }

    log("Generated %d JUnit XML file(s)", generatedFiles.length);
    return generatedFiles;
  }

  /**
   * Convert TestRunData into JUnit test suite structures
   */
  private _toJUnitSuites(runData: TestRunData): JUnitTestSuite[] {
    // Group results by testType
    const grouped = new Map<string, TestResultData[]>();
    for (const result of runData.results) {
      const key = result.testType || "default";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(result);
    }

    const suites: JUnitTestSuite[] = [];

    for (const [testType, results] of grouped) {
      const failures = results.filter((r) => r.status === "failed").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

      const testCases: JUnitTestCase[] = results.map((r) => {
        const tc: JUnitTestCase = {
          name: r.testName,
          classname: `${runData.projectName}.${testType}`,
          time: r.duration / 1000,
        };

        if (r.status === "failed" && r.error) {
          tc.failure = {
            message: r.error.split("\n")[0] ?? r.error,
            type: "AssertionError",
            content: r.error,
          };
        }

        if (r.status === "skipped") {
          tc.skipped = true;
        }

        return tc;
      });

      suites.push({
        name: `${runData.projectName} - ${testType}`,
        tests: results.length,
        failures,
        errors: 0,
        skipped,
        time: totalDuration / 1000,
        timestamp: runData.startedAt.toISOString(),
        hostname: "localhost",
        testCases,
      });
    }

    return suites;
  }

  /**
   * Render a single test suite to XML string
   */
  private _renderSuiteXml(suite: JUnitTestSuite): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
${this._renderSuiteElement(suite)}`;
  }

  /**
   * Render all suites combined into a single XML file
   */
  private _renderCombinedXml(suites: JUnitTestSuite[]): string {
    const totalTests = suites.reduce((s, suite) => s + suite.tests, 0);
    const totalFailures = suites.reduce((s, suite) => s + suite.failures, 0);
    const totalErrors = suites.reduce((s, suite) => s + suite.errors, 0);
    const totalSkipped = suites.reduce((s, suite) => s + suite.skipped, 0);
    const totalTime = suites.reduce((s, suite) => s + suite.time, 0);

    const suiteElements = suites.map((s) => this._renderSuiteElement(s)).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="TestForge" tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}" skipped="${totalSkipped}" time="${totalTime.toFixed(3)}">
${suiteElements}
</testsuites>`;
  }

  /**
   * Render a single <testsuite> element
   */
  private _renderSuiteElement(suite: JUnitTestSuite): string {
    const cases = suite.testCases.map((tc) => this._renderTestCase(tc)).join("\n");

    return `  <testsuite name="${this._escapeXml(suite.name)}" tests="${suite.tests}" failures="${suite.failures}" errors="${suite.errors}" skipped="${suite.skipped}" time="${suite.time.toFixed(3)}" timestamp="${suite.timestamp}" hostname="${suite.hostname}">
    <properties>
      <property name="generator" value="TestForge AI"/>
    </properties>
${cases}
  </testsuite>`;
  }

  /**
   * Render a single <testcase> element
   */
  private _renderTestCase(tc: JUnitTestCase): string {
    const attrs = `name="${this._escapeXml(tc.name)}" classname="${this._escapeXml(tc.classname)}" time="${tc.time.toFixed(3)}"`;

    if (tc.failure) {
      return `    <testcase ${attrs}>
      <failure message="${this._escapeXml(tc.failure.message)}" type="${tc.failure.type}">${this._escapeXml(tc.failure.content)}</failure>
    </testcase>`;
    }

    if (tc.error) {
      return `    <testcase ${attrs}>
      <error message="${this._escapeXml(tc.error.message)}" type="${tc.error.type}">${this._escapeXml(tc.error.content)}</error>
    </testcase>`;
    }

    if (tc.skipped) {
      return `    <testcase ${attrs}>
      <skipped/>
    </testcase>`;
    }

    return `    <testcase ${attrs}/>`;
  }

  /**
   * Escape XML special characters
   */
  private _escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Sanitize string for use as filename
   */
  private _sanitize(str: string): string {
    return str.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 100);
  }
}

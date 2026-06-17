import { z } from "zod";
import type { AIProvider } from "../providers/types.js";
import debug from "debug";

const log = debug("testforge:ai:failure-analyzer");

/**
 * Network log entry captured during test execution
 */
export interface NetworkEntry {
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Response status code */
  status?: number;
  /** Request duration in ms */
  duration?: number;
  /** Error message if request failed */
  error?: string;
}

/**
 * Input for failure analysis
 */
export interface FailureAnalyzerInput {
  /** The error that caused the test failure */
  error: Error;
  /** Screenshot at the time of failure */
  screenshot: Buffer;
  /** Network requests made during the test */
  networkLog: NetworkEntry[];
  /** DOM snapshot at failure time */
  domSnapshot: string;
  /** The test code that failed */
  testCode: string;
}

/**
 * Failure category for classification
 */
export type FailureCategory =
  | "element-not-found"
  | "timing"
  | "network"
  | "assertion"
  | "auth"
  | "data"
  | "unknown";

/**
 * Output from failure analysis
 */
export interface FailureAnalyzerOutput {
  /** Plain English diagnosis of what went wrong */
  diagnosis: string;
  /** Root cause of the failure */
  rootCause: string;
  /** Suggested fix with code example */
  suggestedFix: string;
  /** Confidence in the analysis (0-100) */
  confidence: number;
  /** Categorized failure type */
  category: FailureCategory;
}

/**
 * Zod schema for failure analysis output validation
 */
const FailureAnalysisOutputSchema = z.object({
  diagnosis: z.string(),
  rootCause: z.string(),
  suggestedFix: z.string(),
  confidence: z.number().min(0).max(100),
  category: z.enum([
    "element-not-found",
    "timing",
    "network",
    "assertion",
    "auth",
    "data",
    "unknown",
  ]),
});

/**
 * FailureAnalyzer uses AI to diagnose test failures
 *
 * Multimodal analysis combining:
 * - Error message parsing
 * - Screenshot vision analysis
 * - Network log inspection
 * - DOM snapshot comparison
 * - Test code review
 *
 * @example
 * ```ts
 * const analyzer = new FailureAnalyzer(aiProvider);
 * const analysis = await analyzer.analyze({
 *   error: new Error("TimeoutError: locator.click: Timeout 30000ms"),
 *   screenshot: screenshotBuffer,
 *   networkLog: [{ url: "/api/login", method: "POST", status: 500 }],
 *   domSnapshot: htmlString,
 *   testCode: "await page.click('#submit');",
 * });
 * ```
 */
export class FailureAnalyzer {
  private readonly _provider: AIProvider;

  constructor(provider: AIProvider) {
    this._provider = provider;
  }

  /**
   * Analyze a test failure and provide diagnosis
   *
   * @param input - Complete failure context
   * @returns Diagnosis with root cause and suggested fix
   */
  async analyze(input: FailureAnalyzerInput): Promise<FailureAnalyzerOutput> {
    log("Analyzing failure: %s", input.error.message);

    // Step 1: Vision analysis of the screenshot
    const visionAnalysis = await this._analyzeScreenshot(
      input.screenshot,
      input.error
    );

    // Step 2: Comprehensive analysis combining all data
    const fullAnalysis = await this._fullAnalysis(
      input,
      visionAnalysis
    );

    log(
      "Analysis complete: category=%s, confidence=%d%%",
      fullAnalysis.category,
      fullAnalysis.confidence
    );

    return fullAnalysis;
  }

  /**
   * Analyze the failure screenshot for visual clues
   */
  private async _analyzeScreenshot(
    screenshot: Buffer,
    error: Error
  ): Promise<string> {
    const prompt = `Analyze this application screenshot for clues about a test failure.

ERROR MESSAGE:
${error.message}

Look for:
1. Error messages or alerts displayed on the page
2. Missing or unexpected UI elements
3. Loading spinners (timing issues)
4. Authentication/login screens
5. Empty states or missing data
6. Broken images or styles
7. Browser console errors if visible

Describe what you see that might explain the failure.`;

    return this._provider.vision(screenshot, prompt);
  }

  /**
   * Comprehensive analysis combining all available data
   */
  private async _fullAnalysis(
    input: FailureAnalyzerInput,
    visionAnalysis: string
  ): Promise<FailureAnalyzerOutput> {
    // Summarize network issues
    const networkIssues = input.networkLog
      .filter(
        (entry) =>
          (entry.status !== undefined && entry.status >= 400) ||
          entry.error !== undefined
      )
      .map(
        (entry) =>
          `${entry.method} ${entry.url} -> ${entry.status ?? "ERROR"}${entry.error ? ` (${entry.error})` : ""}`
      );

    const prompt = `You are an expert test automation debugger. Analyze this test failure and provide a detailed diagnosis.

ERROR MESSAGE:
${input.error.message}

TEST CODE:
\`\`\`typescript
${input.testCode}
\`\`\`

SCREENSHOT ANALYSIS:
${visionAnalysis}

NETWORK ISSUES (${networkIssues.length} found):
${networkIssues.length > 0 ? networkIssues.join("\n") : "No network issues detected"}

DOM SNAPSHOT (first 2000 chars):
${input.domSnapshot.substring(0, 2000)}

Provide your analysis in the following JSON format:
{
  "diagnosis": "Plain English explanation of what went wrong",
  "rootCause": "The underlying cause of the failure",
  "suggestedFix": "Specific code change or fix with example",
  "confidence": 0-100,
  "category": "element-not-found|timing|network|assertion|auth|data|unknown"
}`;

    const systemPrompt = `You are a senior test automation engineer specializing in Playwright and web testing. 
Analyze failures thoroughly and provide actionable fixes.
Be specific and practical in your suggestions.
Respond with ONLY valid JSON, no markdown blocks or additional text.`;

    return this._provider.generateStructured(
      prompt,
      FailureAnalysisOutputSchema,
      systemPrompt
    );
  }
}

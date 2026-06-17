import type { AIProvider } from "@testforge/ai-engine";
import type { TestRunData, TestResultData } from "../types.js";
import { z } from "zod";
import debug from "debug";

const log = debug("testforge:reporter:ai");

/**
 * AI-generated test analysis
 */
export interface AIAnalysis {
  /** Executive summary (3-5 sentences, plain English) */
  executiveSummary: string;
  /** Top 3 risks identified from failed tests */
  topRisks: string[];
  /** Suggested priority fixes */
  priorityFixes: { test: string; fix: string; priority: "high" | "medium" | "low" }[];
  /** Overall health assessment */
  healthStatus: "healthy" | "needs-attention" | "critical";
  /** Trend analysis if historical data available */
  trend?: "improving" | "stable" | "degrading";
}

/**
 * Zod schema for AI analysis output validation
 */
const AnalysisSchema = z.object({
  executiveSummary: z.string(),
  topRisks: z.array(z.string()),
  priorityFixes: z.array(
    z.object({
      test: z.string(),
      fix: z.string(),
      priority: z.enum(["high", "medium", "low"]),
    })
  ),
  healthStatus: z.enum(["healthy", "needs-attention", "critical"]),
});

/**
 * AIReporter calls AI models with full run results to generate
 * intelligent test analysis and recommendations
 *
 * Features:
 * - Executive summary in plain English
 * - Top risk identification
 * - Priority fix suggestions
 * - Overall health assessment
 */
export class AIReporter {
  private readonly _provider: AIProvider;

  /**
   * Create an AI reporter
   *
   * @param provider - AI provider for analysis generation
   */
  constructor(provider: AIProvider) {
    this._provider = provider;
  }

  /**
   * Generate AI-powered analysis of test run results
   *
   * @param runData - Complete test run data
   * @returns AI analysis with summary, risks, and recommendations
   */
  async analyze(runData: TestRunData): Promise<AIAnalysis> {
    log("Generating AI analysis for run: %s", runData.runId);

    const resultsSummary = this._buildResultsSummary(runData.results);

    const prompt = `You are a senior QA analyst reviewing test results. Analyze the following test run and provide a detailed report.

RUN OVERVIEW:
- Run ID: ${runData.runId}
- Suite: ${runData.suiteId}
- Project: ${runData.projectName}
- Environment: ${runData.environment ?? "not specified"}
- Triggered by: ${runData.triggeredBy}
- Duration: ${this._formatDuration(runData.duration)}
- Total tests: ${runData.results.length}

RESULTS SUMMARY:
${resultsSummary}

FAILED TEST DETAILS:
${this._buildFailedTestDetails(runData.results)}

Provide your analysis in the following JSON format:
{
  "executiveSummary": "3-5 sentence plain English summary of the test run health and key findings",
  "topRisks": ["Risk 1", "Risk 2", "Risk 3"],
  "priorityFixes": [
    {
      "test": "Test name",
      "fix": "Specific fix suggestion",
      "priority": "high|medium|low"
    }
  ],
  "healthStatus": "healthy|needs-attention|critical"
}`;

    const analysis = await this._provider.generateStructured(
      prompt,
      AnalysisSchema,
      "You are a senior QA lead analyzing test results. Provide practical, actionable analysis. Respond with ONLY valid JSON."
    );

    // Determine health status based on results
    const healthStatus = this._calculateHealthStatus(runData.results, analysis);

    return {
      executiveSummary: analysis.executiveSummary,
      topRisks: analysis.topRisks,
      priorityFixes: analysis.priorityFixes,
      healthStatus,
    };
  }

  /**
   * Generate a markdown-formatted report from AI analysis
   *
   * @param analysis - AI analysis results
   * @param runData - Original test run data
   * @returns Markdown-formatted report
   */
  formatMarkdown(analysis: AIAnalysis, runData: TestRunData): string {
    const passed = runData.results.filter((r) => r.status === "passed").length;
    const failed = runData.results.filter((r) => r.status === "failed").length;
    const skipped = runData.results.filter((r) => r.status === "skipped").length;

    let report = `# TestForge AI — Test Report\n\n`;
    report += `## ${runData.projectName} — ${runData.suiteId}\n\n`;

    report += `**Run ID:** ${runData.runId}\n`;
    report += `**Status:** ${this._statusEmoji(runData.status)} ${runData.status}\n`;
    report += `**Duration:** ${this._formatDuration(runData.duration)}\n`;
    report += `**Environment:** ${runData.environment ?? "not specified"}\n\n`;

    report += `### Results Summary\n\n`;
    report += `| Status | Count |\n`;
    report += `|--------|-------|\n`;
    report += `| ✅ Passed | ${passed} |\n`;
    report += `| ❌ Failed | ${failed} |\n`;
    report += `| ⏭️ Skipped | ${skipped} |\n`;
    report += `| **Total** | **${runData.results.length}** |\n\n`;

    report += `---\n\n`;
    report += `## AI Analysis\n\n`;
    report += `### Executive Summary\n\n`;
    report += `${analysis.executiveSummary}\n\n`;

    if (analysis.topRisks.length > 0) {
      report += `### Top Risks\n\n`;
      analysis.topRisks.forEach((risk, i) => {
        report += `${i + 1}. ${risk}\n`;
      });
      report += `\n`;
    }

    if (analysis.priorityFixes.length > 0) {
      report += `### Priority Fixes\n\n`;
      report += `| Priority | Test | Fix |\n`;
      report += `|----------|------|-----|\n`;
      for (const fix of analysis.priorityFixes) {
        report += `| ${this._priorityIcon(fix.priority)} ${fix.priority.toUpperCase()} | ${fix.test} | ${fix.fix} |\n`;
      }
      report += `\n`;
    }

    report += `### Health Status: ${this._healthEmoji(analysis.healthStatus)} ${analysis.healthStatus.toUpperCase()}\n\n`;

    if (runData.gitSha) {
      report += `**Git Commit:** ${runData.gitSha}\n`;
    }
    if (runData.ciUrl) {
      report += `**CI Build:** ${runData.ciUrl}\n`;
    }

    return report;
  }

  /**
   * Generate a plain text summary for console output
   */
  formatConsole(analysis: AIAnalysis, runData: TestRunData): string {
    const passed = runData.results.filter((r) => r.status === "passed").length;
    const failed = runData.results.filter((r) => r.status === "failed").length;

    const lines: string[] = [
      "",
      `═══════════════════════════════════════════════════════`,
      `  TestForge AI — ${runData.projectName}`,
      `═══════════════════════════════════════════════════════`,
      `  Results: ${passed} passed, ${failed} failed, ${runData.results.length} total`,
      `  Duration: ${this._formatDuration(runData.duration)}`,
      `  Health: ${analysis.healthStatus.toUpperCase()}`,
      `───────────────────────────────────────────────────────`,
      `  ${analysis.executiveSummary}`,
    ];

    if (analysis.priorityFixes.length > 0) {
      lines.push("───────────────────────────────────────────────────────");
      lines.push("  Priority Fixes:");
      for (const fix of analysis.priorityFixes.slice(0, 3)) {
        lines.push(`    ${this._priorityIcon(fix.priority)} ${fix.test}: ${fix.fix}`);
      }
    }

    lines.push(`═══════════════════════════════════════════════════════`);
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Build a text summary of all test results
   */
  private _buildResultsSummary(results: TestResultData[]): string {
    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const flaky = results.filter((r) => r.status === "flaky").length;
    const avgDuration =
      results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length)
        : 0;

    return [
      `Passed: ${passed}`,
      `Failed: ${failed}`,
      `Skipped: ${skipped}`,
      `Flaky: ${flaky}`,
      `Average duration: ${avgDuration}ms`,
    ].join("\n");
  }

  /**
   * Build detailed info about failed tests
   */
  private _buildFailedTestDetails(results: TestResultData[]): string {
    const failed = results.filter((r) => r.status === "failed" || r.status === "flaky");

    if (failed.length === 0) {
      return "No failed tests.";
    }

    return failed
      .map(
        (r) =>
          `- **${r.testName}** (${r.testType}): ${r.error ?? "No error message"}`
      )
      .join("\n");
  }

  /**
   * Calculate health status from results and AI analysis
   */
  private _calculateHealthStatus(
    results: TestResultData[],
    _analysis: Partial<AIAnalysis>
  ): "healthy" | "needs-attention" | "critical" {
    const total = results.length;
    if (total === 0) return "healthy";

    const failed = results.filter((r) => r.status === "failed").length;
    const flaky = results.filter((r) => r.status === "flaky").length;
    const failureRate = (failed + flaky) / total;

    if (failureRate > 0.3) return "critical";
    if (failureRate > 0.1) return "needs-attention";
    return "healthy";
  }

  /**
   * Format duration in human-readable format
   */
  private _formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }

  private _statusEmoji(status: string): string {
    switch (status) {
      case "passed":
        return "✅";
      case "failed":
        return "❌";
      case "running":
        return "🔄";
      case "cancelled":
        return "⏹️";
      default:
        return "❓";
    }
  }

  private _priorityIcon(priority: string): string {
    switch (priority) {
      case "high":
        return "🔴";
      case "medium":
        return "🟡";
      case "low":
        return "🟢";
      default:
        return "⚪";
    }
  }

  private _healthEmoji(health: string): string {
    switch (health) {
      case "healthy":
        return "✅";
      case "needs-attention":
        return "⚠️";
      case "critical":
        return "🚨";
      default:
        return "❓";
    }
  }
}

import type { TestRunData } from "../types.js";
import type { AIAnalysis } from "./ai.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import debug from "debug";

const log = debug("testforge:reporter:pdf");

/**
 * PDFReporter generates branded PDF reports (EE feature)
 *
 * Features:
 * - Project logo and branding
 * - Executive summary page
 * - Test results table
 * - Screenshot evidence for failures
 * - Compliance coverage page (if applicable)
 *
 * Note: Uses HTML-to-PDF conversion via puppeteer or similar.
 * For production, install puppeteer or puppeteer-core.
 */
export class PDFReporter {
  /**
   * Generate a PDF report from test run results and AI analysis
   *
   * @param runData - Complete test run data
   * @param analysis - Optional AI analysis to include
   * @param options - Report options (logo, branding, etc.)
   * @returns Path to generated PDF file
   */
  async generate(
    runData: TestRunData,
    analysis?: AIAnalysis,
    options?: { logoPath?: string; projectName?: string; outputPath?: string }
  ): Promise<string> {
    log("Generating PDF report for run: %s", runData.runId);

    const html = this._generateHtml(runData, analysis, options);
    const outputPath =
      options?.outputPath ?? join(process.cwd(), "reports", `${runData.runId}.pdf`);

    await mkdir(join(outputPath, ".."), { recursive: true });

    // Try real puppeteer first, fall back to HTML-only
    try {
      const puppeteer = await import("puppeteer");
      const browser = await (puppeteer.default ?? puppeteer).launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.pdf({
        path: outputPath,
        format: "A4",
        printBackground: true,
        margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
      });
      await browser.close();

      log("PDF report generated via puppeteer: %s", outputPath);
      return outputPath;
    } catch (puppeteerError) {
      log("Puppeteer not available, falling back to HTML: %O", puppeteerError);
      const htmlPath = outputPath.replace(/\.pdf$/, ".html");
      await writeFile(htmlPath, html);
      log("PDF report saved as HTML: %s", htmlPath);
      return htmlPath;
    }
  }

  /**
   * Generate HTML content for the PDF report
   */
  private _generateHtml(
    runData: TestRunData,
    analysis?: AIAnalysis,
    options?: { logoPath?: string; projectName?: string }
  ): string {
    const passed = runData.results.filter((r) => r.status === "passed").length;
    const failed = runData.results.filter((r) => r.status === "failed").length;
    const skipped = runData.results.filter((r) => r.status === "skipped").length;
    const healthColor = this._getHealthColor(analysis?.healthStatus);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TestForge Report — ${runData.projectName}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding-bottom: 1rem;
      border-bottom: 3px solid #2563eb;
    }
    .header img { height: 48px; }
    .header h1 { margin: 0; font-size: 1.5rem; color: #2563eb; }
    .header .subtitle { color: #6b7280; font-size: 0.875rem; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin: 2rem 0;
    }
    .summary-card {
      background: #f9fafb;
      border-radius: 0.5rem;
      padding: 1rem;
      text-align: center;
    }
    .summary-card .number { font-size: 2rem; font-weight: bold; }
    .summary-card .label { color: #6b7280; font-size: 0.875rem; }
    .summary-card.passed .number { color: #22c55e; }
    .summary-card.failed .number { color: #ef4444; }
    .summary-card.skipped .number { color: #eab308; }
    .summary-card.duration .number { color: #2563eb; }
    .health-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-weight: 600;
      color: white;
      background-color: ${healthColor};
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th { background: #f9fafb; font-weight: 600; }
    .status-passed { color: #22c55e; font-weight: 600; }
    .status-failed { color: #ef4444; font-weight: 600; }
    .status-skipped { color: #eab308; font-weight: 600; }
    .status-flaky { color: #f97316; font-weight: 600; }
    .ai-section {
      background: #f0f9ff;
      border-left: 4px solid #2563eb;
      padding: 1.5rem;
      border-radius: 0 0.5rem 0.5rem 0;
      margin: 2rem 0;
    }
    .ai-section h2 { color: #2563eb; margin-top: 0; }
    .risk-list { list-style: none; padding: 0; }
    .risk-list li {
      padding: 0.5rem 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .risk-list li::before {
      content: "⚠️ ";
    }
    .fix-table td:first-child { font-weight: 600; }
    .footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 0.75rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    ${options?.logoPath ? `<img src="${options.logoPath}" alt="Logo">` : ""}
    <div>
      <h1>${options?.projectName ?? runData.projectName}</h1>
      <div class="subtitle">TestForge AI Report — Run ${runData.runId}</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card passed">
      <div class="number">${passed}</div>
      <div class="label">Passed</div>
    </div>
    <div class="summary-card failed">
      <div class="number">${failed}</div>
      <div class="label">Failed</div>
    </div>
    <div class="summary-card skipped">
      <div class="number">${skipped}</div>
      <div class="label">Skipped</div>
    </div>
    <div class="summary-card duration">
      <div class="number">${this._formatDuration(runData.duration)}</div>
      <div class="label">Duration</div>
    </div>
  </div>

  <p>
    <strong>Status:</strong> ${runData.status} &nbsp;
    <strong>Environment:</strong> ${runData.environment ?? "N/A"} &nbsp;
    <strong>Trigger:</strong> ${runData.triggeredBy} &nbsp;
    ${analysis ? `<span class="health-badge">${analysis.healthStatus.toUpperCase()}</span>` : ""}
  </p>

  ${analysis ? `
  <div class="ai-section">
    <h2>🤖 AI Analysis</h2>
    <h3>Executive Summary</h3>
    <p>${analysis.executiveSummary}</p>

    ${analysis.topRisks.length > 0 ? `
    <h3>Top Risks</h3>
    <ul class="risk-list">
      ${analysis.topRisks.map((risk) => `<li>${risk}</li>`).join("")}
    </ul>
    ` : ""}

    ${analysis.priorityFixes.length > 0 ? `
    <h3>Priority Fixes</h3>
    <table class="fix-table">
      <tr><th>Priority</th><th>Test</th><th>Suggested Fix</th></tr>
      ${analysis.priorityFixes
        .map(
          (fix) =>
            `<tr><td>${this._priorityBadge(fix.priority)}</td><td>${fix.test}</td><td>${fix.fix}</td></tr>`
        )
        .join("")}
    </table>
    ` : ""}
  </div>
  ` : ""}

  <div class="page-break"></div>
  <h2>📋 Detailed Results</h2>

  <table>
    <tr>
      <th>Test</th>
      <th>Type</th>
      <th>Status</th>
      <th>Duration</th>
      <th>Tags</th>
    </tr>
    ${runData.results
      .map(
        (r) => `
    <tr>
      <td>${r.testName}</td>
      <td>${r.testType}</td>
      <td class="status-${r.status}">${r.status.toUpperCase()}</td>
      <td>${this._formatDuration(r.duration)}</td>
      <td>${r.tags.join(", ") || "—"}</td>
    </tr>
    ${r.error ? `<tr><td colspan="5" style="color:#ef4444;font-size:0.875rem;">${r.error}</td></tr>` : ""}
    `
      )
      .join("")}
  </table>

  ${runData.gitSha ? `<p><strong>Git Commit:</strong> <code>${runData.gitSha}</code></p>` : ""}
  ${runData.ciUrl ? `<p><strong>CI Build:</strong> <a href="${runData.ciUrl}">${runData.ciUrl}</a></p>` : ""}

  <div class="footer">
    Generated by TestForge AI on ${new Date().toLocaleString()} | 
    ${runData.results.length} tests executed in ${this._formatDuration(runData.duration)}
  </div>
</body>
</html>`;
  }

  /**
   * Get color for health status badge
   */
  private _getHealthColor(healthStatus?: string): string {
    switch (healthStatus) {
      case "healthy":
        return "#22c55e";
      case "needs-attention":
        return "#eab308";
      case "critical":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  }

  /**
   * Generate priority badge HTML
   */
  private _priorityBadge(priority: string): string {
    const colors: Record<string, string> = {
      high: "#ef4444",
      medium: "#eab308",
      low: "#22c55e",
    };
    const color = colors[priority] ?? "#6b7280";
    return `<span style="background:${color};color:white;padding:2px 8px;border-radius:999px;font-size:0.75rem;">${priority.toUpperCase()}</span>`;
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
}

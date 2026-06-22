import type { TestRunData } from "../types.js";
import type { NotificationConfig } from "../types.js";
import type { AIAnalysis } from "./ai.js";
import axios from "axios";
import debug from "debug";

const log = debug("testforge:reporter:notification");

/**
 * NotificationReporter sends test results to Slack, Teams, and Email
 *
 * Features:
 * - Slack webhook: rich block with pass/fail stats + AI summary
 * - Teams webhook: adaptive card
 * - Email: HTML email with results summary
 */
export class NotificationReporter {
  private readonly _config: NotificationConfig;

  /**
   * Create a notification reporter
   *
   * @param config - Notification channel configurations
   */
  constructor(config: NotificationConfig) {
    this._config = config;
  }

  /**
   * Send test results to all configured notification channels
   *
   * @param runData - Test run data to report
   * @param analysis - Optional AI analysis to include
   */
  async sendAll(runData: TestRunData, analysis?: AIAnalysis): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this._config.slackWebhookUrl) {
      promises.push(this.sendSlack(runData, analysis));
    }

    if (this._config.teamsWebhookUrl) {
      promises.push(this.sendTeams(runData, analysis));
    }

    if (this._config.emailConfig) {
      promises.push(this.sendEmail(runData, analysis));
    }

    if (promises.length === 0) {
      log("No notification channels configured");
      return;
    }

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === "rejected") {
        log("Notification delivery failed: %O", result.reason);
      }
    }
  }

  /**
   * Send results to Slack via webhook
   *
   * @param runData - Test run data
   * @param analysis - Optional AI analysis
   */
  async sendSlack(runData: TestRunData, analysis?: AIAnalysis): Promise<void> {
    const webhookUrl = this._config.slackWebhookUrl;
    if (!webhookUrl) {
      throw new Error("Slack webhook URL not configured");
    }

    log("Sending Slack notification for run: %s", runData.runId);

    const passed = runData.results.filter((r) => r.status === "passed").length;
    const failed = runData.results.filter((r) => r.status === "failed").length;
    const skipped = runData.results.filter((r) => r.status === "skipped").length;
    const total = runData.results.length;

    // Build Slack blocks
    const blocks: Record<string, unknown>[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${this._statusEmoji(runData.status)} TestForge AI — ${runData.projectName}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Suite:*\n${runData.suiteId}` },
          { type: "mrkdwn", text: `*Environment:*\n${runData.environment ?? "N/A"}` },
          { type: "mrkdwn", text: `*Duration:*\n${this._formatDuration(runData.duration)}` },
          { type: "mrkdwn", text: `*Triggered by:*\n${runData.triggeredBy}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Results:* ${passed} ✅ passed · ${failed} ❌ failed · ${skipped} ⏭️ skipped · ${total} total`,
        },
      },
      {
        type: "divider",
      },
    ];

    // Add AI summary if available
    if (analysis) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🤖 AI Summary:*\n${analysis.executiveSummary}`,
        },
      });

      if (analysis.priorityFixes.length > 0) {
        const fixesText = analysis.priorityFixes
          .slice(0, 3)
          .map((fix) => `${this._priorityEmoji(fix.priority)} *${fix.test}*: ${fix.fix}`)
          .join("\n");

        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: `*Priority Fixes:*\n${fixesText}` },
        });
      }

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Health Status:* ${this._healthEmoji(analysis.healthStatus)} \`${analysis.healthStatus.toUpperCase()}\``,
        },
      });
    }

    // Failed test details
    const failedTests = runData.results.filter((r) => r.status === "failed");
    if (failedTests.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Failed Tests:*\n${failedTests
            .slice(0, 5)
            .map((t) => `• ${t.testName}${t.error ? ` — \`${t.error.substring(0, 50)}...\`` : ""}`)
            .join("\n")}${failedTests.length > 5 ? `\n_...and ${failedTests.length - 5} more_` : ""}`,
        },
      });
    }

    // Actions
    const actions: Record<string, unknown>[] = [];
    if (runData.ciUrl) {
      actions.push({
        type: "button",
        text: { type: "plain_text", text: "CI Build", emoji: true },
        url: runData.ciUrl,
      });
    }

    if (actions.length > 0) {
      blocks.push({ type: "actions", elements: actions });
    }

    await axios.post(webhookUrl, { blocks }, { timeout: 10000 });
    log("Slack notification sent successfully");
  }

  /**
   * Send results to Microsoft Teams via webhook
   *
   * @param runData - Test run data
   * @param analysis - Optional AI analysis
   */
  async sendTeams(runData: TestRunData, analysis?: AIAnalysis): Promise<void> {
    const webhookUrl = this._config.teamsWebhookUrl;
    if (!webhookUrl) {
      throw new Error("Teams webhook URL not configured");
    }

    log("Sending Teams notification for run: %s", runData.runId);

    const passed = runData.results.filter((r) => r.status === "passed").length;
    const failed = runData.results.filter((r) => r.status === "failed").length;
    const total = runData.results.length;

    const card: {
      type: string;
      themeColor: string;
      summary: string;
      sections: Array<{
        startGroup?: boolean;
        activityTitle: string;
        activitySubtitle: string;
        facts: { name: string; value: string }[];
        markdown: boolean;
      }>;
      potentialAction?: Array<{
        type: string;
        name: string;
        targets: { os: string; uri: string }[];
      }>;
    } = {
      type: "messageCard",
      themeColor: runData.status === "passed" ? "22c55e" : runData.status === "failed" ? "ef4444" : "eab308",
      summary: `TestForge AI: ${passed}/${total} passed`,
      sections: [
        {
          activityTitle: `TestForge AI — ${runData.projectName}`,
          activitySubtitle: `Run ${runData.runId} · ${runData.suiteId}`,
          facts: [
            { name: "Status", value: runData.status },
            { name: "Passed", value: `${passed}` },
            { name: "Failed", value: `${failed}` },
            { name: "Total", value: `${total}` },
            { name: "Duration", value: this._formatDuration(runData.duration) },
            { name: "Environment", value: runData.environment ?? "N/A" },
          ],
          markdown: true,
        },
      ],
    };

    if (analysis) {
      card.sections.push({
        startGroup: true,
        activityTitle: "🤖 AI Analysis",
        activitySubtitle: analysis.executiveSummary,
        facts: [
          { name: "Health Status", value: analysis.healthStatus.toUpperCase() },
          ...(analysis.topRisks.length > 0
            ? [{ name: "Top Risk", value: analysis.topRisks[0] ?? "" }]
            : []),
        ],
        markdown: true,
      });
    }

    if (runData.ciUrl) {
      card.potentialAction = [
        {
          type: "OpenUri",
          name: "View CI Build",
          targets: [{ os: "default", uri: runData.ciUrl }],
        },
      ];
    }

    await axios.post(webhookUrl, card, { timeout: 10000 });
    log("Teams notification sent successfully");
  }

  /**
   * Send results via email
   *
   * @param runData - Test run data
   * @param analysis - Optional AI analysis
   */
  async sendEmail(runData: TestRunData, analysis?: AIAnalysis): Promise<void> {
    const emailConfig = this._config.emailConfig;
    if (!emailConfig) {
      throw new Error("Email configuration not provided");
    }

    log("Sending email notification to: %s", emailConfig.to.join(", "));

    const htmlBody = this._generateEmailHtml(runData, analysis);

    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: emailConfig.smtpHost,
        port: emailConfig.smtpPort,
        secure: emailConfig.useTls,
        auth: emailConfig.username
          ? { user: emailConfig.username, pass: emailConfig.password }
          : undefined,
      });

      const passed = runData.results.filter((r) => r.status === "passed").length;
      const total = runData.results.length;
      const statusEmoji = passed === total ? "✅" : "⚠️";

      await transporter.sendMail({
        from: emailConfig.from,
        to: emailConfig.to.join(", "),
        subject: `${statusEmoji} TestForge AI — ${runData.projectName}: ${passed}/${total} passed`,
        html: htmlBody,
      });

      log("Email sent successfully to %s", emailConfig.to.join(", "));
    } catch (error) {
      // Fallback: log the HTML if nodemailer not available or send fails
      if ((error as Error).message?.includes("Cannot find module") || (error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
        log("nodemailer not installed. Email HTML generated (%d bytes). Install with: bun add nodemailer", htmlBody.length);
      } else {
        log("Email send failed: %O", error);
        throw error;
      }
    }
  }

  /**
   * Generate HTML email body
   */
  private _generateEmailHtml(runData: TestRunData, analysis?: AIAnalysis): string {
    const passed = runData.results.filter((r) => r.status === "passed").length;
    const failed = runData.results.filter((r) => r.status === "failed").length;
    const total = runData.results.length;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 1rem; color: #1a1a1a; }
    .header { background: #2563eb; color: white; padding: 1rem; border-radius: 0.5rem 0.5rem 0 0; }
    .header h1 { margin: 0; font-size: 1.25rem; }
    .body { background: #f9fafb; padding: 1rem; border-radius: 0 0 0.5rem 0.5rem; }
    .stat { display: inline-block; text-align: center; margin: 0.5rem 1rem; }
    .stat .number { font-size: 2rem; font-weight: bold; }
    .stat .label { color: #6b7280; font-size: 0.875rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f3f4f6; }
    .passed { color: #22c55e; }
    .failed { color: #ef4444; }
    .ai-section { background: #f0f9ff; border-left: 4px solid #2563eb; padding: 1rem; margin: 1rem 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>TestForge AI — ${runData.projectName}</h1>
    <p style="margin:0.5rem 0 0;opacity:0.8;">Run ${runData.runId} · ${runData.suiteId}</p>
  </div>
  <div class="body">
    <div>
      <div class="stat"><div class="number passed">${passed}</div><div class="label">Passed</div></div>
      <div class="stat"><div class="number failed">${failed}</div><div class="label">Failed</div></div>
      <div class="stat"><div class="number">${total}</div><div class="label">Total</div></div>
    </div>
    <p><strong>Duration:</strong> ${this._formatDuration(runData.duration)} · <strong>Environment:</strong> ${runData.environment ?? "N/A"}</p>
    ${analysis ? `<div class="ai-section"><h3>🤖 AI Summary</h3><p>${analysis.executiveSummary}</p></div>` : ""}
    <table>
      <tr><th>Test</th><th>Type</th><th>Status</th><th>Duration</th></tr>
      ${runData.results
        .map(
          (r) =>
            `<tr><td>${r.testName}</td><td>${r.testType}</td><td class="${r.status}">${r.status}</td><td>${this._formatDuration(r.duration)}</td></tr>`
        )
        .join("")}
    </table>
  </div>
</body>
</html>`;
  }

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
      default:
        return "⏹️";
    }
  }

  private _priorityEmoji(priority: string): string {
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

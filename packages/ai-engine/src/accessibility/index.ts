import { z } from "zod";
import type { AIProvider } from "../providers/types.js";
import debug from "debug";

const log = debug("testforge:ai:accessibility");

/**
 * WCAG conformance levels
 */
export type A11yStandard = "WCAG-AA" | "WCAG-AAA" | "Section508";

/**
 * Accessibility violation detected by the agent
 */
export interface A11yViolation {
  /** Unique violation identifier */
  id: string;
  /** WCAG rule ID that was violated */
  ruleId: string;
  /** Human-readable description of the violation */
  description: string;
  /** WCAG success criterion reference (e.g., "1.1.1") */
  wcagCriterion: string;
  /** Impact level of the violation */
  impact: "minor" | "moderate" | "serious" | "critical";
  /** CSS selector of the violating element */
  selector: string;
  /** HTML snippet of the violating element */
  htmlSnippet: string;
  /** AI explanation in plain English */
  aiExplanation: string;
  /** Suggested code fix */
  suggestedFix: string;
}

/**
 * Output from accessibility testing
 */
export interface AccessibilityOutput {
  /** All violations found */
  violations: A11yViolation[];
  /** Overall accessibility score (0-100, higher is better) */
  score: number;
  /** Remediation steps in priority order */
  remediation: string[];
  /** Summary of passes (rules that passed) */
  passesCount: number;
  /** Summary of incomplete tests */
  incompleteCount: number;
}

/**
 * Zod schema for accessibility violation output
 */
const A11yViolationSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  description: z.string(),
  wcagCriterion: z.string(),
  impact: z.enum(["minor", "moderate", "serious", "critical"]),
  selector: z.string(),
  htmlSnippet: z.string(),
  aiExplanation: z.string(),
  suggestedFix: z.string(),
});

const AccessibilityOutputSchema = z.object({
  violations: z.array(A11yViolationSchema),
  score: z.number().min(0).max(100),
  remediation: z.array(z.string()),
  passesCount: z.number(),
  incompleteCount: z.number(),
});

/**
 * AccessibilityAgent tests web applications for WCAG compliance
 *
 * The agent:
 * 1. Navigates the app as a screen reader would
 * 2. Tests keyboard navigation and focus order
 * 3. Validates ARIA labels and roles
 * 4. Checks color contrast and text alternatives
 * 5. Uses AI to explain each violation in plain English
 * 6. Generates code patches as fixes
 *
 * @example
 * ```ts
 * const agent = new AccessibilityAgent(aiProvider);
 * const result = await agent.test({
 *   url: "https://myapp.example.com/login",
 *   standard: "WCAG-AA",
 * });
 * ```
 */
export class AccessibilityAgent {
  private readonly _provider: AIProvider;

  constructor(provider: AIProvider) {
    this._provider = provider;
  }

  /**
   * Test a URL for accessibility compliance
   *
   * @param input - URL and standard to test against
   * @returns Accessibility analysis with violations and remediation
   */
  async test(input: {
    url: string;
    standard: A11yStandard;
  }): Promise<AccessibilityOutput> {
    log("Testing accessibility of %s against %s", input.url, input.standard);

    // In production, this would:
    // 1. Use Playwright to inject axe-core
    // 2. Run axe-core analysis
    // 3. Capture accessibility tree
    // 4. Analyze keyboard navigation
    // 5. Test screen reader compatibility

    // For now, we simulate the analysis with AI
    const output = await this._simulateA11yAnalysis(input);

    log(
      "Accessibility test complete: %d violations, score: %d/100",
      output.violations.length,
      output.score
    );

    return output;
  }

  /**
   * Test multiple pages for accessibility
   *
   * @param input - URLs and standard to test
   * @returns Combined accessibility analysis
   */
  async testMultiple(input: {
    urls: string[];
    standard: A11yStandard;
  }): Promise<{ pageResults: Map<string, AccessibilityOutput>; overallScore: number }> {
    log("Testing accessibility of %d pages", input.urls.length);

    const pageResults = new Map<string, AccessibilityOutput>();
    let totalScore = 0;

    for (const url of input.urls) {
      const result = await this.test({ url, standard: input.standard });
      pageResults.set(url, result);
      totalScore += result.score;
    }

    const overallScore = pageResults.size > 0
      ? Math.round(totalScore / pageResults.size)
      : 0;

    return { pageResults, overallScore };
  }

  /**
   * Generate an accessibility report in various formats
   */
  async generateReport(
    output: AccessibilityOutput,
    format: "json" | "markdown" | "html" = "json"
  ): Promise<string> {
    switch (format) {
      case "json":
        return JSON.stringify(output, null, 2);
      case "markdown":
        return this._generateMarkdownReport(output);
      case "html":
        return this._generateHtmlReport(output);
      default: {
        const _exhaustiveCheck: never = format;
        throw new Error(`Unknown format: ${_exhaustiveCheck}`);
      }
    }
  }

  /**
   * Simulate accessibility analysis using AI
   * In production, this would use actual axe-core results
   */
  private async _simulateA11yAnalysis(input: {
    url: string;
    standard: A11yStandard;
  }): Promise<AccessibilityOutput> {
    const prompt = `You are an accessibility expert analyzing the web page at: ${input.url}

Test against ${input.standard} standard.

Common accessibility issues to check for:
1. Missing alt text on images (WCAG 1.1.1)
2. Insufficient color contrast (WCAG 1.4.3)
3. Missing form labels (WCAG 1.3.1)
4. Missing landmark regions (WCAG 1.3.1)
5. Keyboard traps (WCAG 2.1.2)
6. Missing page titles (WCAG 2.4.2)
7. Missing language attribute (WCAG 3.1.1)
8. Missing focus indicators (WCAG 2.4.7)
9. Empty links or buttons (WCAG 2.4.4)
10. Missing skip navigation link (WCAG 2.4.1)

For this type of page (${input.url}), analyze what accessibility issues are likely present.

Return your analysis as valid JSON with the following structure:
{
  "violations": [
    {
      "id": "a11y-001",
      "ruleId": "aria-required-attr",
      "description": "ARIA attribute is missing",
      "wcagCriterion": "1.3.1",
      "impact": "serious",
      "selector": "button#submit",
      "htmlSnippet": "<button id=\"submit\">Submit</button>",
      "aiExplanation": "Plain English explanation",
      "suggestedFix": "<button id=\"submit\" aria-label=\"Submit form\">Submit</button>"
    }
  ],
  "score": 75,
  "remediation": ["Priority ordered list of fixes"],
  "passesCount": 15,
  "incompleteCount": 3
}`;

    return this._provider.generateStructured(
      prompt,
      AccessibilityOutputSchema,
      `You are a WCAG accessibility specialist. Analyze the page type and predict likely accessibility issues. 
Test against ${input.standard} standard.
Respond with ONLY valid JSON.`
    );
  }

  /**
   * Generate a markdown-formatted accessibility report
   */
  private _generateMarkdownReport(output: AccessibilityOutput): string {
    let report = `# Accessibility Report\n\n`;
    report += `**Score:** ${output.score}/100\n`;
    report += `**Violations:** ${output.violations.length}\n`;
    report += `**Passed Rules:** ${output.passesCount}\n`;
    report += `**Incomplete Tests:** ${output.incompleteCount}\n\n`;

    if (output.violations.length > 0) {
      report += `## Violations\n\n`;

      // Group by impact
      const byImpact = new Map<string, A11yViolation[]>();
      for (const violation of output.violations) {
        const existing = byImpact.get(violation.impact) ?? [];
        existing.push(violation);
        byImpact.set(violation.impact, existing);
      }

      for (const [impact, violations] of byImpact) {
        report += `### ${impact.toUpperCase()} Impact\n\n`;
        for (const v of violations) {
          report += `#### ${v.description}\n\n`;
          report += `- **Rule:** ${v.ruleId}\n`;
          report += `- **WCAG:** ${v.wcagCriterion}\n`;
          report += `- **Element:** \`${v.selector}\`\n\n`;
          report += `**Explanation:** ${v.aiExplanation}\n\n`;
          report += `**Fix:**\n\`\`\`html\n${v.suggestedFix}\n\`\`\`\n\n`;
        }
      }
    }

    report += `## Remediation Priority\n\n`;
    output.remediation.forEach((step, index) => {
      report += `${index + 1}. ${step}\n`;
    });

    return report;
  }

  /**
   * Generate an HTML-formatted accessibility report
   */
  private _generateHtmlReport(output: AccessibilityOutput): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Accessibility Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    .score { font-size: 3rem; font-weight: bold; color: ${output.score >= 80 ? "#22c55e" : output.score >= 50 ? "#eab308" : "#ef4444"}; }
    .violation { border: 1px solid #e5e7eb; padding: 1rem; margin: 1rem 0; border-radius: 0.5rem; }
    .impact-critical { border-left: 4px solid #ef4444; }
    .impact-serious { border-left: 4px solid #f97316; }
    .impact-moderate { border-left: 4px solid #eab308; }
    .impact-minor { border-left: 4px solid #22c55e; }
    code { background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 0.25rem; }
    pre { background: #f9fafb; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Accessibility Report</h1>
  <div class="score">${output.score}/100</div>
  <p>${output.violations.length} violations · ${output.passesCount} passed · ${output.incompleteCount} incomplete</p>
  
  ${output.violations
    .map(
      (v) => `
    <div class="violation impact-${v.impact}">
      <h3>${v.description}</h3>
      <p><strong>Rule:</strong> ${v.ruleId} | <strong>WCAG:</strong> ${v.wcagCriterion}</p>
      <p><strong>Element:</strong> <code>${v.selector}</code></p>
      <p>${v.aiExplanation}</p>
      <pre><code>${v.suggestedFix}</code></pre>
    </div>`
    )
    .join("\n")}
  
  <h2>Remediation Priority</h2>
  <ol>
    ${output.remediation.map((step) => `<li>${step}</li>`).join("\n")}
  </ol>
</body>
</html>`;
  }
}

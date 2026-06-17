import { describe, it, expect, vi, beforeEach } from "vitest";
import { AccessibilityAgent } from "./index.js";
import type { AIProvider } from "../providers/types.js";

function createMockProvider(): AIProvider {
  return {
    providerId: "mock",
    model: "mock-model",
    generate: vi.fn().mockResolvedValue("Accessibility analysis"),
    generateStructured: vi.fn().mockResolvedValue({
      violations: [
        {
          id: "a11y-001",
          ruleId: "image-alt",
          description: "Images must have alt text",
          wcagCriterion: "1.1.1",
          impact: "serious" as const,
          selector: "img.hero-banner",
          htmlSnippet: '<img src="hero.png" class="hero-banner">',
          aiExplanation:
            "The hero banner image is missing alternative text for screen readers",
          suggestedFix:
            '<img src="hero.png" class="hero-banner" alt="Welcome to our platform">',
        },
        {
          id: "a11y-002",
          ruleId: "color-contrast",
          description: "Insufficient color contrast",
          wcagCriterion: "1.4.3",
          impact: "moderate" as const,
          selector: ".text-muted",
          htmlSnippet: '<p class="text-muted">Help text</p>',
          aiExplanation:
            "The muted text has a contrast ratio of 2.5:1, below the required 4.5:1",
          suggestedFix:
            '<p class="text-muted" style="color: #595959">Help text</p>',
        },
      ],
      score: 72,
      remediation: [
        "Add alt text to all images",
        "Fix color contrast on muted text",
        "Add ARIA labels to form inputs",
      ],
      passesCount: 15,
      incompleteCount: 3,
    }),
    generateStream: vi.fn().mockImplementation(async function* () {
      yield "chunk";
    }),
    vision: vi.fn().mockResolvedValue("Vision response"),
    getLastTokenUsage: vi.fn().mockReturnValue(null),
  };
}

describe("AccessibilityAgent", () => {
  let provider: AIProvider;
  let agent: AccessibilityAgent;

  beforeEach(() => {
    provider = createMockProvider();
    agent = new AccessibilityAgent(provider);
  });

  describe("test", () => {
    it("should test a URL for accessibility", async () => {
      const result = await agent.test({
        url: "https://example.com/login",
        standard: "WCAG-AA",
      });

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.score).toBe(72);
      expect(result.remediation.length).toBeGreaterThan(0);
    });

    it("should categorize violations by impact", async () => {
      const result = await agent.test({
        url: "https://example.com",
        standard: "WCAG-AA",
      });

      const impacts = result.violations.map((v) => v.impact);
      expect(impacts).toContain("serious");
      expect(impacts).toContain("moderate");
    });

    it("should include WCAG criterion references", async () => {
      const result = await agent.test({
        url: "https://example.com",
        standard: "WCAG-AA",
      });

      for (const violation of result.violations) {
        expect(violation.wcagCriterion.length).toBeGreaterThan(0);
      }
    });

    it("should provide suggested fixes", async () => {
      const result = await agent.test({
        url: "https://example.com",
        standard: "WCAG-AA",
      });

      for (const violation of result.violations) {
        expect(violation.suggestedFix.length).toBeGreaterThan(0);
      }
    });
  });

  describe("testMultiple", () => {
    it("should test multiple URLs and calculate overall score", async () => {
      const result = await agent.testMultiple({
        urls: ["https://example.com/page1", "https://example.com/page2"],
        standard: "WCAG-AA",
      });

      expect(result.pageResults.size).toBe(2);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe("generateReport", () => {
    it("should generate JSON report", async () => {
      const testResult = await agent.test({
        url: "https://example.com",
        standard: "WCAG-AA",
      });

      const jsonReport = await agent.generateReport(testResult, "json");
      const parsed = JSON.parse(jsonReport);

      expect(parsed.violations).toBeDefined();
      expect(parsed.score).toBeDefined();
    });

    it("should generate Markdown report", async () => {
      const testResult = await agent.test({
        url: "https://example.com",
        standard: "WCAG-AA",
      });

      const mdReport = await agent.generateReport(testResult, "markdown");

      expect(mdReport).toContain("# Accessibility Report");
      expect(mdReport).toContain("## Violations");
      expect(mdReport).toContain("## Remediation Priority");
    });

    it("should generate HTML report", async () => {
      const testResult = await agent.test({
        url: "https://example.com",
        standard: "WCAG-AA",
      });

      const htmlReport = await agent.generateReport(testResult, "html");

      expect(htmlReport).toContain("<!DOCTYPE html>");
      expect(htmlReport).toContain("Accessibility Report");
      expect(htmlReport).toContain("violation");
    });
  });
});

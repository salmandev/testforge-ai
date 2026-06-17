import { describe, it, expect, vi, beforeEach } from "vitest";
import { FailureAnalyzer } from "./index.js";
import type { AIProvider } from "../providers/types.js";

function createMockProvider(): AIProvider {
  return {
    providerId: "mock",
    model: "mock-model",
    generate: vi.fn().mockResolvedValue("Failure analysis response"),
    generateStructured: vi.fn().mockResolvedValue({
      diagnosis: "The test failed because the submit button was renamed",
      rootCause: "CSS selector #submit-button no longer exists in the DOM",
      suggestedFix: "Update the locator to #new-submit-button",
      confidence: 92,
      category: "element-not-found" as const,
    }),
    generateStream: vi.fn().mockImplementation(async function* () {
      yield "chunk";
    }),
    vision: vi.fn().mockResolvedValue(
      "Screenshot shows error message 'Element not found'"
    ),
    getLastTokenUsage: vi.fn().mockReturnValue(null),
  };
}

describe("FailureAnalyzer", () => {
  let provider: AIProvider;
  let analyzer: FailureAnalyzer;

  beforeEach(() => {
    provider = createMockProvider();
    analyzer = new FailureAnalyzer(provider);
  });

  describe("analyze", () => {
    it("should analyze a failure and provide diagnosis", async () => {
      const input = {
        error: new Error("TimeoutError: locator.click: Timeout 30000ms"),
        screenshot: Buffer.from("fake-screenshot"),
        networkLog: [
          { url: "/api/login", method: "POST", status: 500, duration: 2500 },
        ],
        domSnapshot: "<html><body>Error page</body></html>",
        testCode: "await page.click('#submit');",
      };

      const result = await analyzer.analyze(input);

      expect(provider.vision).toHaveBeenCalled();
      expect(result.diagnosis.length).toBeGreaterThan(0);
      expect(result.rootCause.length).toBeGreaterThan(0);
      expect(result.suggestedFix.length).toBeGreaterThan(0);
      expect(result.confidence).toBe(92);
      expect(result.category).toBe("element-not-found");
    });

    it("should handle failures with no network issues", async () => {
      const result = await analyzer.analyze({
        error: new Error("AssertionError: expected 200, got 404"),
        screenshot: Buffer.from("screenshot"),
        networkLog: [
          { url: "/api/data", method: "GET", status: 200, duration: 100 },
        ],
        domSnapshot: "<html></html>",
        testCode: "expect(response.status()).toBe(200);",
      });

      expect(result.category).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { IntentEngine } from "./index.js";
import type { AIProvider } from "../providers/types.js";

function createMockProvider(): AIProvider {
  return {
    providerId: "mock",
    model: "mock-model",
    generate: vi.fn().mockResolvedValue("Test re-evaluation results"),
    generateStructured: vi.fn().mockResolvedValue({
      tests: [
        {
          id: "intent-test-001",
          name: "Checkout Flow Test",
          type: "web" as const,
          description: "Test checkout end-to-end",
          steps: [
            {
              id: "step-1",
              description: "Add item to cart",
              action: "click",
              expected: "Item added to cart",
            },
          ],
          tags: ["e2e", "checkout"],
        },
      ],
      maintenancePlan:
        "Review tests weekly. Update on UI changes. Monitor flakiness.",
    }),
    generateStream: vi.fn().mockImplementation(async function* () {
      yield "chunk";
    }),
    vision: vi.fn().mockResolvedValue("Vision response"),
    getLastTokenUsage: vi.fn().mockReturnValue(null),
  };
}

describe("IntentEngine", () => {
  let provider: AIProvider;
  let engine: IntentEngine;

  beforeEach(() => {
    provider = createMockProvider();
    engine = new IntentEngine(provider);
  });

  describe("execute", () => {
    it("should generate tests from intent", async () => {
      const result = await engine.execute({
        intent: "Ensure checkout works end-to-end",
        appUrl: "https://mystore.example.com",
      });

      expect(result.tests.length).toBeGreaterThan(0);
      expect(result.maintenancePlan.length).toBeGreaterThan(0);

      const test = result.tests[0];
      expect(test.name).toBe("Checkout Flow Test");
      expect(test.description).toBe("Test checkout end-to-end");
    });

    it("should include tags in generated tests", async () => {
      const result = await engine.execute({
        intent: "Test user registration",
        appUrl: "https://app.example.com",
      });

      const test = result.tests[0];
      expect(test.tags).toContain("e2e");
    });

    it("should generate steps for each test", async () => {
      const result = await engine.execute({
        intent: "Test login functionality",
        appUrl: "https://app.example.com",
      });

      const test = result.tests[0];
      expect(test.steps.length).toBeGreaterThan(0);
    });
  });

  describe("reevaluate", () => {
    it("should re-evaluate existing tests against app changes", async () => {
      const existingTests = [
        {
          id: "test-001",
          name: "Login Test",
          type: "web" as const,
          status: "passed" as const,
          locators: [],
          steps: [
            {
              id: "step-1",
              description: "Click login",
              action: "click",
            },
          ],
          tags: [],
          aiHealthScore: 95,
          flakinessScore: 0,
          createdAt: new Date(),
        },
      ];

      const result = await engine.reevaluate(
        existingTests,
        "Login button was moved from header to a dedicated login page"
      );

      expect(result.updatedTests.length).toBeGreaterThan(0);
      expect(result.changeLog.length).toBeGreaterThan(0);
    });
  });
});

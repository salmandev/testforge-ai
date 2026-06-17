import { describe, it, expect, vi, beforeEach } from "vitest";
import { TestGenerator } from "./index.js";
import type { AIProvider } from "../providers/types.js";
import type { TestCase } from "@testforge/core";

// Mock AI Provider
function createMockProvider(): AIProvider {
  return {
    providerId: "mock",
    model: "mock-model",
    generate: vi.fn().mockResolvedValue("Generated test response"),
    generateStructured: vi.fn().mockResolvedValue({
      tests: [
        {
          id: "test-001",
          name: "Login Test",
          type: "web" as const,
          steps: [
            {
              id: "step-1",
              description: "Navigate to login",
              action: "navigate",
              data: { url: "https://example.com" },
              expected: "Login page displayed",
            },
          ],
          tags: ["smoke"],
          description: "Verify login works",
        },
      ],
      pageObjects: ["export class LoginPage {}"],
      confidence: 85,
    }),
    generateStream: vi.fn().mockImplementation(async function* () {
      yield "chunk";
    }),
    vision: vi.fn().mockResolvedValue("Screenshot shows login form"),
    getLastTokenUsage: vi.fn().mockReturnValue(null),
  };
}

describe("TestGenerator", () => {
  let provider: AIProvider;
  let generator: TestGenerator;

  beforeEach(() => {
    provider = createMockProvider();
    generator = new TestGenerator(provider);
  });

  describe("generate", () => {
    it("should generate tests from URL", async () => {
      const result = await generator.generate({
        url: "https://example.com/login",
      });

      expect(result.tests.length).toBeGreaterThan(0);
      expect(result.confidence).toBe(85);
      expect(result.pageObjects.length).toBeGreaterThan(0);

      const test = result.tests[0] as TestCase;
      expect(test.name).toBe("Login Test");
      expect(test.type).toBe("web");
    });

    it("should generate tests from screenshot", async () => {
      const screenshot = Buffer.from("fake-png-data");

      const result = await generator.generate({
        screenshot,
      });

      expect(provider.vision).toHaveBeenCalled();
      expect(result.tests.length).toBeGreaterThan(0);
    });

    it("should generate tests from natural language", async () => {
      const result = await generator.generate({
        naturalLanguage: "Test that users can register and login",
      });

      expect(result.tests.length).toBeGreaterThan(0);
    });

    it("should translate Arabic text before generating tests", async () => {
      (provider.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "Test that users can register with Arabic names"
      );

      const result = await generator.generate({
        arabicText: "اختبار تسجيل المستخدمين",
      });

      expect(provider.generate).toHaveBeenCalled(); // Translation call
      expect(result.tests.length).toBeGreaterThan(0);
    });

    it("should generate API tests from OpenAPI spec", async () => {
      const result = await generator.generate({
        openApiSpec: "openapi: 3.0.0\npaths:\n  /users:\n    get:",
      });

      expect(result.tests.length).toBeGreaterThan(0);
      const test = result.tests[0] as TestCase;
      expect(test.type).toBe("api");
    });

    it("should generate tests from Postman collection", async () => {
      const result = await generator.generate({
        postmanCollection: JSON.stringify({
          info: { name: "API Collection" },
          item: [],
        }),
      });

      expect(result.tests.length).toBeGreaterThan(0);
    });

    it("should throw error when no valid input is provided", async () => {
      await expect(generator.generate({})).rejects.toThrow(
        /No valid input provided/
      );
    });
  });
});

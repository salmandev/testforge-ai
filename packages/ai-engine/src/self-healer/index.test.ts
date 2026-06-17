import { describe, it, expect, vi, beforeEach } from "vitest";
import { SelfHealer } from "./index.js";
import type { AIProvider } from "../providers/types.js";
import { EventBus } from "@testforge/core";
import type { Locator } from "@testforge/core";

// Mock fs operations
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("{}"),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

function createMockProvider(): AIProvider {
  return {
    providerId: "mock",
    model: "mock-model",
    generate: vi.fn().mockResolvedValue("Healed locator response"),
    generateStructured: vi.fn().mockResolvedValue({
      strategy: "css",
      value: "#new-submit-button",
      confidence: 88,
      explanation: "Button was renamed from 'submit' to 'submit-button'",
    }),
    generateStream: vi.fn().mockImplementation(async function* () {
      yield "chunk";
    }),
    vision: vi.fn().mockResolvedValue("Vision analysis"),
    getLastTokenUsage: vi.fn().mockReturnValue(null),
  };
}

describe("SelfHealer", () => {
  let provider: AIProvider;
  let eventBus: EventBus;
  let healer: SelfHealer;

  beforeEach(() => {
    provider = createMockProvider();
    eventBus = new EventBus();
    healer = new SelfHealer(provider, eventBus, "/tmp/healed-locators.json");
  });

  describe("initialize", () => {
    it("should load healed locators from disk", async () => {
      await healer.initialize();
      // Should not throw even if file doesn't exist
      expect(true).toBe(true);
    });
  });

  describe("heal", () => {
    it("should heal a broken locator", async () => {
      const input = {
        locator: {
          strategy: "css" as const,
          value: "#old-submit",
          confidence: 100,
        },
        pageSnapshot: "<html><body><button id='new-submit-button'>Submit</button></body></html>",
        screenshot: Buffer.from("fake-screenshot"),
        error: "Element not found: #old-submit",
      };

      const result = await healer.heal(input);

      expect(result.healedLocator.strategy).toBe("css");
      expect(result.healedLocator.value).toBe("#new-submit-button");
      expect(result.confidence).toBe(88);
      expect(result.explanation).toContain("renamed");
    });

    it("should emit test:healed event", async () => {
      const eventListener = vi.fn();
      eventBus.on("test:healed", eventListener);

      await healer.heal({
        locator: {
          strategy: "css" as const,
          value: "#old",
          confidence: 100,
        },
        pageSnapshot: "<html></html>",
        screenshot: Buffer.from("screenshot"),
        error: "Not found",
      });

      expect(eventListener).toHaveBeenCalled();
    });

    it("should return cached healed locator on second call", async () => {
      const locator: Locator = {
        strategy: "css",
        value: "#cached-test",
        confidence: 100,
      };

      // First call
      await healer.heal({
        locator,
        pageSnapshot: "<html></html>",
        screenshot: Buffer.from("screenshot"),
        error: "Not found",
      });

      // Second call should return cached result
      const result = await healer.heal({
        locator,
        pageSnapshot: "<html></html>",
        screenshot: Buffer.from("screenshot"),
        error: "Not found",
      });

      expect(result.explanation).toBe("Previously healed locator reused");
    });

    it("should update healing stats", async () => {
      await healer.heal({
        locator: {
          strategy: "css" as const,
          value: "#stats-test",
          confidence: 100,
        },
        pageSnapshot: "<html></html>",
        screenshot: Buffer.from("screenshot"),
        error: "Not found",
      });

      const stats = healer.getStats();
      expect(stats.totalAttempts).toBe(1);
      expect(stats.successfulHeals).toBe(1);
    });
  });

  describe("getStats", () => {
    it("should return initial stats", () => {
      const stats = healer.getStats();

      expect(stats.totalAttempts).toBe(0);
      expect(stats.successfulHeals).toBe(0);
      expect(stats.failedHeals).toBe(0);
    });
  });

  describe("clearHealedLocators", () => {
    it("should clear all healed locators", async () => {
      // Heal a locator
      await healer.heal({
        locator: {
          strategy: "css" as const,
          value: "#clear-test",
          confidence: 100,
        },
        pageSnapshot: "<html></html>",
        screenshot: Buffer.from("screenshot"),
        error: "Not found",
      });

      expect(healer.getHealedLocators().size).toBeGreaterThan(0);

      // Clear
      await healer.clearHealedLocators();

      expect(healer.getHealedLocators().size).toBe(0);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { VisualDNA } from "./index.js";
import type { AIProvider } from "../providers/types.js";

function createMockProvider(): AIProvider {
  return {
    providerId: "mock",
    model: "mock-model",
    generate: vi.fn().mockResolvedValue("Baseline analysis"),
    generateStructured: vi.fn().mockResolvedValue({
      diffs: [
        {
          description: "CTA button changed from blue to gray",
          component: "Submit Button",
          changeType: "color" as const,
          severity: "minor" as const,
          confidence: 95,
        },
        {
          description: "Navigation menu is missing",
          component: "Main Navigation",
          changeType: "visibility" as const,
          severity: "breaking" as const,
          confidence: 99,
        },
      ],
      overallSeverity: "breaking" as const,
      narrative:
        "The navigation menu is missing which breaks the primary user flow. The button color change is minor.",
    }),
    generateStream: vi.fn().mockImplementation(async function* () {
      yield "chunk";
    }),
    vision: vi.fn().mockResolvedValue("Page has header, nav, main content"),
    getLastTokenUsage: vi.fn().mockReturnValue(null),
  };
}

describe("VisualDNA", () => {
  let provider: AIProvider;
  let visualDNA: VisualDNA;

  beforeEach(() => {
    provider = createMockProvider();
    visualDNA = new VisualDNA(provider);
  });

  describe("compare", () => {
    it("should detect visual differences", async () => {
      const result = await visualDNA.compare({
        baseline: Buffer.from("baseline-screenshot"),
        current: Buffer.from("current-screenshot"),
      });

      expect(result.diffs.length).toBeGreaterThan(0);
      expect(result.severity).toBe("breaking");
      expect(result.aiNarrative.length).toBeGreaterThan(0);
    });

    it("should classify diffs by severity", async () => {
      const result = await visualDNA.compare({
        baseline: Buffer.from("baseline"),
        current: Buffer.from("current"),
      });

      const severities = result.diffs.map((d) => d.severity);
      expect(severities).toContain("minor");
      expect(severities).toContain("breaking");
    });

    it("should classify diffs by change type", async () => {
      const result = await visualDNA.compare({
        baseline: Buffer.from("baseline"),
        current: Buffer.from("current"),
      });

      const changeTypes = result.diffs.map((d) => d.changeType);
      expect(changeTypes).toContain("color");
      expect(changeTypes).toContain("visibility");
    });

    it("should use component tree if provided", async () => {
      const result = await visualDNA.compare({
        baseline: Buffer.from("baseline"),
        current: Buffer.from("current"),
        componentTree: [
          {
            type: "button",
            text: "Submit",
            boundingBox: { x: 100, y: 200, width: 150, height: 40 },
            cssClasses: ["btn-primary"],
            children: [],
          },
        ],
      });

      // Should call vision for baseline + generateStructured for comparison
      expect(provider.vision).toHaveBeenCalled();
      expect(provider.generateStructured).toHaveBeenCalled();
      expect(result.diffs.length).toBeGreaterThan(0);
    });
  });

  describe("compareComponent", () => {
    it("should compare a specific component between screenshots", async () => {
      const result = await visualDNA.compareComponent({
        baseline: Buffer.from("baseline"),
        current: Buffer.from("current"),
        componentDescription: "Submit Button",
      });

      expect(result.diffs.length).toBeGreaterThan(0);
      expect(result.aiNarrative.length).toBeGreaterThan(0);
    });
  });
});

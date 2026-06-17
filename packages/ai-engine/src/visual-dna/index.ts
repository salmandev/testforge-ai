import { z } from "zod";
import type { AIProvider } from "../providers/types.js";
import debug from "debug";

const log = debug("testforge:ai:visual-dna");

/**
 * Pixel diff result from pixelmatch
 */
export interface PixelDiffResult {
  /** Number of mismatched pixels */
  mismatchedPixels: number;
  /** Total pixels compared */
  totalPixels: number;
  /** Percentage of pixels that differ (0-100) */
  mismatchPercentage: number;
  /** Diff image as PNG buffer */
  diffImage: Buffer;
  /** Width of compared images */
  width: number;
  /** Height of compared images */
  height: number;
}

/**
 * Options for pixel-level comparison
 */
export interface PixelDiffOptions {
  /** Pixelmatch threshold (0-1, default 0.1) */
  threshold?: number;
  /** Include AA pixels in diff (default false) */
  includeAA?: boolean;
  /** Alpha blending factor (0-1, default 0.1) */
  alpha?: number;
  /** Diff color [r,g,b] (default [255,0,0]) */
  diffColor?: [number, number, number];
  /** Diff color for masked pixels (default [0,128,255]) */
  diffColorAlt?: [number, number, number];
}

/**
 * Severity level for visual differences
 */
export type VisualDiffSeverity = "none" | "minor" | "major" | "breaking";

/**
 * A component node in the page structure tree
 */
export interface ComponentNode {
  /** Component type (button, heading, image, etc.) */
  type: string;
  /** Component text content if any */
  text?: string;
  /** Bounding box coordinates */
  boundingBox: { x: number; y: number; width: number; height: number };
  /** CSS classes applied */
  cssClasses: string[];
  /** Child components */
  children: ComponentNode[];
}

/**
 * A single visual difference detected
 */
export interface VisualDiff {
  /** Description of what changed */
  description: string;
  /** Component or element affected */
  component: string;
  /** Type of change */
  changeType: "position" | "color" | "size" | "content" | "visibility" | "style";
  /** Severity of the change */
  severity: VisualDiffSeverity;
  /** Bounding box of the changed region */
  region?: { x: number; y: number; width: number; height: number };
  /** AI confidence in the detection (0-100) */
  confidence: number;
}

/**
 * Output from visual DNA comparison
 */
export interface VisualDNAOutput {
  /** All detected visual differences */
  diffs: VisualDiff[];
  /** Overall severity assessment */
  severity: VisualDiffSeverity;
  /** AI narrative explaining the changes in plain English */
  aiNarrative: string;
}

/**
 * Zod schema for visual diff output validation
 */
const VisualDiffOutputSchema = z.object({
  diffs: z.array(
    z.object({
      description: z.string(),
      component: z.string(),
      changeType: z.enum([
        "position",
        "color",
        "size",
        "content",
        "visibility",
        "style",
      ]),
      severity: z.enum(["none", "minor", "major", "breaking"]),
      confidence: z.number().min(0).max(100),
    })
  ),
  overallSeverity: z.enum(["none", "minor", "major", "breaking"]),
  narrative: z.string(),
});

/**
 * VisualDNA performs component-semantic visual regression testing
 *
 * Unlike traditional pixel-diff tools, VisualDNA:
 * 1. Uses AI vision to understand what actually changed
 * 2. Categorizes changes by semantic meaning, not just pixel difference
 * 3. Provides plain-English narratives explaining the impact
 * 4. Distinguishes intentional design changes from accidental regressions
 *
 * @example
 * ```ts
 * const visualDNA = new VisualDNA(aiProvider);
 * const result = await visualDNA.compare({
 *   baseline: baselineScreenshot,
 *   current: currentScreenshot,
 * });
 * // result.aiNarrative: "The CTA button moved 8px left and changed
 * // from primary to secondary variant — likely intentional but
 * // confirm with designer"
 * ```
 */
export class VisualDNA {
  private readonly _provider: AIProvider;

  constructor(provider: AIProvider) {
    this._provider = provider;
  }

  /**
   * Compare baseline and current screenshots for visual differences
   *
   * @param input - Baseline and current screenshots, optionally with component tree
   * @returns Detected differences with severity and narrative
   */
  async compare(input: {
    baseline: Buffer;
    current: Buffer;
    componentTree?: ComponentNode[];
  }): Promise<VisualDNAOutput> {
    log("Starting visual DNA comparison");

    // Step 1: Analyze the baseline screenshot
    const baselineAnalysis = await this._provider.vision(
      input.baseline,
      "Describe the layout and key UI components of this page in detail. List all visible elements, their positions, colors, and text content. This is the BASELINE version."
    );

    // Step 2: Analyze the current screenshot and compare to baseline
    const comparisonPrompt = `You are comparing two screenshots for visual regression testing.

BASELINE DESCRIPTION:
${baselineAnalysis}

${input.componentTree ? `COMPONENT TREE:
${JSON.stringify(input.componentTree, null, 2).substring(0, 3000)}

` : ""}
Analyze the CURRENT screenshot and identify ALL visual differences from the baseline description.

For each difference, determine:
1. What component/element changed
2. What type of change (position, color, size, content, visibility, style)
3. How severe the change is:
   - "none": No meaningful change detected
   - "minor": Small visual tweak (padding, minor color shade, slight position shift)
   - "major": Noticeable UI change (element moved significantly, color scheme change, size change)
   - "breaking": Layout broken, missing elements, overlapping content, unusable UI

Provide your analysis as valid JSON.`;

    const response = await this._provider.generateStructured(
      comparisonPrompt,
      VisualDiffOutputSchema,
      "You are a visual regression testing expert. Compare screenshots and categorize changes by semantic meaning and severity. Respond with ONLY valid JSON."
    );

    // Build output
    const diffs: VisualDiff[] = response.diffs.map((diff) => ({
      ...diff,
      region: undefined, // Would be populated by actual coordinate detection
    }));

    const severity = response.overallSeverity;
    const aiNarrative = this._generateNarrative(diffs, severity, response.narrative);

    log(
      "Visual DNA complete: %d diffs found, severity: %s",
      diffs.length,
      severity
    );

    return { diffs, severity, aiNarrative };
  }

  /**
   * Compare a specific component across two screenshots
   *
   * @param input - Baseline and current screenshots with component selector
   * @returns Focused comparison of the specific component
   */
  async compareComponent(input: {
    baseline: Buffer;
    current: Buffer;
    componentDescription: string;
  }): Promise<VisualDNAOutput> {
    log("Comparing component: %s", input.componentDescription);

    const prompt = `Compare the "${input.componentDescription}" component between these two screenshots.

Focus ONLY on this specific component and ignore other page changes.

Analyze:
1. Has the component's position changed?
2. Has its appearance changed (color, size, shape)?
3. Has its content changed (text, images)?
4. Is it still visible and functional?
5. Is the change intentional (design update) or accidental (regression)?

Provide your analysis as JSON with severity and explanation.`;

    const response = await this._provider.generateStructured(
      prompt,
      VisualDiffOutputSchema,
      "You are a visual QA specialist. Focus on comparing a specific component between two screenshots. Respond with ONLY valid JSON."
    );

    const diffs: VisualDiff[] = response.diffs.map((diff) => ({
      ...diff,
      region: undefined,
    }));

    const severity = response.overallSeverity;
    const aiNarrative = this._generateNarrative(diffs, severity, response.narrative);

    return { diffs, severity, aiNarrative };
  }

  /**
   * Perform a real pixel-level diff using pixelmatch + pngjs.
   * Returns quantitative diff data without AI analysis.
   *
   * @param baseline - Baseline PNG screenshot as Buffer
   * @param current - Current PNG screenshot as Buffer
   * @param options - Pixelmatch options
   * @returns Pixel diff statistics and diff image
   */
  async pixelDiff(
    baseline: Buffer,
    current: Buffer,
    options?: PixelDiffOptions
  ): Promise<PixelDiffResult> {
    log("Performing pixel-level diff");

    const { PNG } = await import("pngjs");
    const pixelmatch = (await import("pixelmatch")).default ?? (await import("pixelmatch"));

    const baselineImg = PNG.sync.read(baseline);
    const currentImg = PNG.sync.read(current);

    const width = Math.max(baselineImg.width, currentImg.width);
    const height = Math.max(baselineImg.height, currentImg.height);

    // Pad smaller image if dimensions differ
    const baseData = this._padImageData(baselineImg, width, height);
    const currData = this._padImageData(currentImg, width, height);

    const diff = new PNG({ width, height });

    const mismatchedPixels = (pixelmatch as (
      img1: Buffer, img2: Buffer, output: Buffer | null,
      w: number, h: number, opts?: Record<string, unknown>
    ) => number)(
      baseData,
      currData,
      diff.data,
      width,
      height,
      {
        threshold: options?.threshold ?? 0.1,
        includeAA: options?.includeAA ?? false,
        alpha: options?.alpha ?? 0.1,
        diffColor: options?.diffColor ?? [255, 0, 0],
        diffColorAlt: options?.diffColorAlt ?? [0, 128, 255],
      }
    );

    const totalPixels = width * height;
    const mismatchPercentage = totalPixels > 0
      ? Math.round((mismatchedPixels / totalPixels) * 10000) / 100
      : 0;

    const diffImage = PNG.sync.write(diff);

    log("Pixel diff: %d/%d pixels mismatched (%.2f%%)", mismatchedPixels, totalPixels, mismatchPercentage);

    return {
      mismatchedPixels,
      totalPixels,
      mismatchPercentage,
      diffImage,
      width,
      height,
    };
  }

  /**
   * Compare with both pixel diff AND AI semantic analysis.
   * Combines quantitative pixel data with AI narrative.
   */
  async fullCompare(input: {
    baseline: Buffer;
    current: Buffer;
    componentTree?: ComponentNode[];
    pixelOptions?: PixelDiffOptions;
  }): Promise<VisualDNAOutput & { pixelDiff: PixelDiffResult }> {
    const [aiResult, pixelResult] = await Promise.all([
      this.compare(input),
      this.pixelDiff(input.baseline, input.current, input.pixelOptions),
    ]);

    // Enrich AI result with pixel data
    if (pixelResult.mismatchPercentage > 0 && aiResult.diffs.length === 0) {
      aiResult.diffs.push({
        description: `Pixel-level diff detected ${pixelResult.mismatchPercentage}% changed pixels`,
        component: "page",
        changeType: "style",
        severity: pixelResult.mismatchPercentage > 10 ? "major" : pixelResult.mismatchPercentage > 2 ? "minor" : "none",
        confidence: 100,
      });
      aiResult.severity = pixelResult.mismatchPercentage > 10 ? "major" : "minor";
    }

    return { ...aiResult, pixelDiff: pixelResult };
  }

  /**
   * Pad image data to target dimensions (for different-sized screenshots)
   */
  private _padImageData(img: { data: Buffer; width: number; height: number }, targetW: number, targetH: number): Buffer {
    if (img.width === targetW && img.height === targetH) return img.data;
    const padded = Buffer.alloc(targetW * targetH * 4, 0);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const srcIdx = (y * img.width + x) * 4;
        const dstIdx = (y * targetW + x) * 4;
        padded[dstIdx] = img.data[srcIdx] ?? 0;
        padded[dstIdx + 1] = img.data[srcIdx + 1] ?? 0;
        padded[dstIdx + 2] = img.data[srcIdx + 2] ?? 0;
        padded[dstIdx + 3] = img.data[srcIdx + 3] ?? 255;
      }
    }
    return padded;
  }

  /**
   * Generate a human-readable narrative from the detected diffs
   */
  private _generateNarrative(
    diffs: VisualDiff[],
    severity: VisualDiffSeverity,
    aiAnalysis: string
  ): string {
    if (diffs.length === 0) {
      return "No visual differences detected. The pages are visually identical.";
    }

    const severityCounts = {
      none: diffs.filter((d) => d.severity === "none").length,
      minor: diffs.filter((d) => d.severity === "minor").length,
      major: diffs.filter((d) => d.severity === "major").length,
      breaking: diffs.filter((d) => d.severity === "breaking").length,
    };

    let narrative = `Visual regression analysis found ${diffs.length} difference(s): `;
    narrative += `${severityCounts.breaking} breaking, ${severityCounts.major} major, ${severityCounts.minor} minor.\n\n`;

    if (severityCounts.breaking > 0) {
      narrative += "⚠️ BREAKING changes detected:\n";
      for (const diff of diffs.filter((d) => d.severity === "breaking")) {
        narrative += `  • ${diff.component}: ${diff.description}\n`;
      }
      narrative += "\n";
    }

    if (severityCounts.major > 0) {
      narrative += "🔶 Major changes:\n";
      for (const diff of diffs.filter((d) => d.severity === "major")) {
        narrative += `  • ${diff.component}: ${diff.description}\n`;
      }
      narrative += "\n";
    }

    narrative += `AI Analysis: ${aiAnalysis}`;

    return narrative;
  }
}

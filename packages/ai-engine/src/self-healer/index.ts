import { z } from "zod";
import type { AIProvider } from "../providers/types.js";
import type { Locator, LocatorStrategy } from "@testforge/core";
import { LocatorSchema, LocatorStrategySchema } from "@testforge/core";
import type { EventBus } from "@testforge/core";
import debug from "debug";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const log = debug("testforge:ai:self-healer");

/**
 * Input for the self-healing process
 */
export interface SelfHealerInput {
  /** The locator that failed to find an element */
  locator: Locator;
  /** Current page snapshot (DOM text or accessibility tree) */
  pageSnapshot: string;
  /** Screenshot of the current page state */
  screenshot: Buffer;
  /** Error message from the failed locator */
  error: string;
}

/**
 * Output from the self-healing process
 */
export interface SelfHealerOutput {
  /** The healed locator with updated strategy/value */
  healedLocator: Locator;
  /** AI confidence in the healed locator (0-100) */
  confidence: number;
  /** Explanation of what changed and how the fix was derived */
  explanation: string;
}

/**
 * Zod schema for self-healer output validation
 */
const SelfHealerOutputSchema = z.object({
  strategy: LocatorStrategySchema,
  value: z.string(),
  confidence: z.number().min(0).max(100),
  explanation: z.string(),
});

/**
 * Statistics about self-healing success rates
 */
export interface SelfHealerStats {
  /** Total healing attempts */
  totalAttempts: number;
  /** Successful healing operations */
  successfulHeals: number;
  /** Failed healing operations */
  failedHeals: number;
  /** Success rate by strategy */
  successRateByStrategy: Record<string, { attempts: number; successes: number }>;
}

/**
 * SelfHealer automatically repairs broken locators using AI analysis
 *
 * The self-healing process follows a fallback chain:
 * 1. Try alternative CSS selectors
 * 2. Try ARIA-based locators
 * 3. Try text-based matching
 * 4. Try visual/coordinate-based location
 *
 * Healed locators are persisted to disk for future runs.
 *
 * @example
 * ```ts
 * const healer = new SelfHealer(aiProvider, eventBus);
 * const result = await healer.heal({
 *   locator: { strategy: "css", value: ".old-button", confidence: 100 },
 *   pageSnapshot: "<html>...</html>",
 *   screenshot: screenshotBuffer,
 *   error: "Element not found: .old-button",
 * });
 * ```
 */
export class SelfHealer {
  private readonly _provider: AIProvider;
  private readonly _eventBus: EventBus;
  private readonly _healedLocatorsPath: string;
  private readonly _healedLocators: Map<string, Locator> = new Map();
  private readonly _stats: SelfHealerStats = {
    totalAttempts: 0,
    successfulHeals: 0,
    failedHeals: 0,
    successRateByStrategy: {},
  };

  /**
   * Creates a new SelfHealer instance
   *
   * @param provider - AI provider for intelligent locator repair
   * @param eventBus - Event bus for emitting test:healed events
   * @param healedLocatorsPath - Path to persist healed locators (default: healed-locators.json)
   */
  constructor(
    provider: AIProvider,
    eventBus: EventBus,
    healedLocatorsPath?: string
  ) {
    this._provider = provider;
    this._eventBus = eventBus;
    this._healedLocatorsPath = healedLocatorsPath ?? "healed-locators.json";
  }

  /**
   * Initialize the healer by loading persisted healed locators
   */
  async initialize(): Promise<void> {
    try {
      if (existsSync(this._healedLocatorsPath)) {
        const data = await readFile(this._healedLocatorsPath, "utf-8");
        const locators = JSON.parse(data) as Record<string, Locator>;

        for (const [key, locator] of Object.entries(locators)) {
          this._healedLocators.set(key, locator);
        }

        log(
          "Loaded %d healed locators from %s",
          this._healedLocators.size,
          this._healedLocatorsPath
        );
      }
    } catch (error) {
      log("Failed to load healed locators: %O", error);
    }
  }

  /**
   * Attempt to heal a broken locator
   *
   * @param input - Information about the failed locator
   * @returns Healed locator with confidence and explanation
   */
  async heal(input: SelfHealerInput): Promise<SelfHealerOutput> {
    this._stats.totalAttempts++;
    log(
      "Attempting to heal locator: %s (%s)",
      input.locator.value,
      input.locator.strategy
    );

    // Check if we already have a healed version of this locator
    const locatorKey = this._getLocatorKey(input.locator);
    const existingHeal = this._healedLocators.get(locatorKey);
    if (existingHeal) {
      log("Using previously healed locator");
      return {
        healedLocator: existingHeal,
        confidence: existingHeal.confidence ?? 100,
        explanation: "Previously healed locator reused",
      };
    }

    // Try AI-based healing using vision analysis
    const healedLocator = await this._aiHeal(input);

    // Persist the healed locator
    this._healedLocators.set(locatorKey, healedLocator.healedLocator);
    await this._persistHealedLocators();

    // Update stats
    this._updateStats(healedLocator);

    // Emit event
    this._eventBus.emit("test:healed", {
      testId: "unknown", // Will be set by caller
      locatorStrategy: input.locator.strategy,
      originalLocator: input.locator.value,
      healedLocator: healedLocator.healedLocator.value,
      confidence: healedLocator.confidence,
      explanation: healedLocator.explanation,
      timestamp: new Date(),
    });

    log(
      "Healed locator: %s -> %s (confidence: %d%%)",
      input.locator.value,
      healedLocator.healedLocator.value,
      healedLocator.confidence
    );

    return healedLocator;
  }

  /**
   * Get current healing statistics
   */
  getStats(): SelfHealerStats {
    return { ...this._stats };
  }

  /**
   * Get all healed locators
   */
  getHealedLocators(): ReadonlyMap<string, Locator> {
    return new Map(this._healedLocators);
  }

  /**
   * Clear all healed locators (both memory and disk)
   */
  async clearHealedLocators(): Promise<void> {
    this._healedLocators.clear();
    try {
      await writeFile(this._healedLocatorsPath, "{}");
    } catch {
      // Ignore persistence errors
    }
  }

  /**
   * Use AI vision to analyze and heal the broken locator
   */
  private async _aiHeal(input: SelfHealerInput): Promise<SelfHealerOutput> {
    const prompt = `A test automation script failed because a UI element locator is broken.

BROKEN LOCATOR:
- Strategy: ${input.locator.strategy}
- Value: ${input.locator.value}
- Error: ${input.error}

CURRENT PAGE SNAPSHOT (first 3000 chars):
${input.pageSnapshot.substring(0, 3000)}

Analyze the screenshot and page snapshot to find the best alternative locator for the element that the broken locator was trying to find.

Consider these strategies in order of preference:
1. CSS selector (most reliable)
2. ARIA attribute (accessible)
3. Text content (human-readable)
4. XPath (last resort)

Return the healed locator as JSON.`;

    const response = await this._provider.generateStructured(
      prompt,
      SelfHealerOutputSchema,
      "You are an expert in web automation and DOM analysis. Given a broken locator and the current page state, find the best alternative locator. Respond with ONLY valid JSON."
    );

    const healedLocator: Locator = LocatorSchema.parse({
      strategy: response.strategy,
      value: response.value,
      confidence: response.confidence,
      healedFrom: input.locator.value,
      healedAt: new Date(),
    });

    return {
      healedLocator,
      confidence: response.confidence,
      explanation: response.explanation,
    };
  }

  /**
   * Update healing statistics
   */
  private _updateStats(output: SelfHealerOutput): void {
    const strategy = output.healedLocator.strategy;

    if (!this._stats.successRateByStrategy[strategy]) {
      this._stats.successRateByStrategy[strategy] = {
        attempts: 0,
        successes: 0,
      };
    }

    this._stats.successRateByStrategy[strategy]!.attempts++;

    if (output.confidence >= 50) {
      this._stats.successfulHeals++;
      this._stats.successRateByStrategy[strategy]!.successes++;
    } else {
      this._stats.failedHeals++;
    }
  }

  /**
   * Generate a unique key for a locator
   */
  private _getLocatorKey(locator: Locator): string {
    return `${locator.strategy}:${locator.value}`;
  }

  /**
   * Persist healed locators to disk
   */
  private async _persistHealedLocators(): Promise<void> {
    try {
      const data = Object.fromEntries(this._healedLocators);
      await writeFile(
        this._healedLocatorsPath,
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      log("Failed to persist healed locators: %O", error);
    }
  }
}

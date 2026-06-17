import type { AIProvider } from "../providers/types.js";
import type { Locator } from "@testforge/core";
import { LocatorSchema } from "@testforge/core";
import type { EventBus } from "@testforge/core";
import { SelfHealer, type SelfHealerInput, type SelfHealerOutput } from "../self-healer/index.js";
import debug from "debug";

const log = debug("testforge:ai:d365-healer");

/**
 * D365-specific locator fallback strategies.
 *
 * When a D365 element locator fails, this healer tries a D365-aware
 * fallback chain before delegating to the generic AI-based SelfHealer.
 */
export interface D365HealerConfig {
  /** Whether to try D365 fallback strategies before AI healing */
  enableFallbacks: boolean;
  /** Whether to cache successful fallbacks for future lookups */
  cacheFallbacks: boolean;
  /** Additional custom data-id prefixes to try */
  customDataIdPrefixes: string[];
}

/**
 * Default D365 healer configuration
 */
export const DEFAULT_D365_HEALER_CONFIG: D365HealerConfig = {
  enableFallbacks: true,
  cacheFallbacks: true,
  customDataIdPrefixes: [],
};

/**
 * A resolved locator from the D365 fallback chain
 */
export interface D365FallbackResult {
  /** The fallback strategy that found the element */
  strategy: string;
  /** The resolved locator */
  locator: Locator;
  /** Confidence score (100 for deterministic fallbacks) */
  confidence: number;
}

/**
 * D365LocatorHealer wraps the generic SelfHealer with D365-specific
 * fallback strategies optimized for the UCI form framework.
 *
 * Fallback chain (tried before AI healing):
 * 1. `data-id` attribute — D365's primary field identifier
 * 2. `aria-label` — UCI accessibility labels
 * 3. Text content — visible field label text
 * 4. Field label — associated label element
 * 5. XPath — structural DOM path
 *
 * If all fallbacks fail, delegates to the AI-powered SelfHealer
 * which uses vision analysis to find the element.
 *
 * @example
 * ```ts
 * const healer = new D365LocatorHealer(claudeProvider, eventBus);
 *
 * const result = await healer.heal({
 *   locator: { strategy: "css", value: ".old-field", confidence: 100 },
 *   pageSnapshot: "<html>...</html>",
 *   screenshot: screenshotBuffer,
 *   error: "Element not found",
 * });
 *
 * // result.healedLocator might be:
 * // { strategy: "css", value: "[data-id='firstname']", confidence: 95 }
 * ```
 */
export class D365LocatorHealer {
  private readonly _selfHealer: SelfHealer;
  private readonly _config: D365HealerConfig;
  private readonly _fallbackCache: Map<string, Locator> = new Map();
  private _stats = {
    totalAttempts: 0,
    fallbackSuccesses: 0,
    aiDelegations: 0,
    fallbackStrategyHits: {} as Record<string, number>,
  };

  constructor(
    provider: AIProvider,
    eventBus: EventBus,
    config?: Partial<D365HealerConfig>
  ) {
    this._selfHealer = new SelfHealer(provider, eventBus);
    this._config = { ...DEFAULT_D365_HEALER_CONFIG, ...config };
  }

  /**
   * Attempt to heal a broken locator using D365-specific fallbacks,
   * then fall back to AI-based healing.
   */
  async heal(input: SelfHealerInput): Promise<SelfHealerOutput> {
    this._stats.totalAttempts++;
    log("D365 heal attempt: %s (%s)", input.locator.value, input.locator.strategy);

    // Check fallback cache first
    if (this._config.cacheFallbacks) {
      const cached = this._fallbackCache.get(input.locator.value);
      if (cached) {
        log("Using cached D365 fallback: %s -> %s", input.locator.value, cached.value);
        return {
          healedLocator: cached,
          confidence: cached.confidence ?? 90,
          explanation: `Cached D365 fallback for "${input.locator.value}"`,
        };
      }
    }

    // Try D365-specific fallback strategies
    if (this._config.enableFallbacks) {
      const fallback = this._tryD365Fallbacks(input);
      if (fallback) {
        this._stats.fallbackSuccesses++;

        if (this._config.cacheFallbacks) {
          this._fallbackCache.set(input.locator.value, fallback.locator);
        }

        log("D365 fallback success: %s -> %s (strategy: %s)", input.locator.value, fallback.locator.value, fallback.strategy);

        return {
          healedLocator: fallback.locator,
          confidence: fallback.confidence,
          explanation: `D365 fallback via ${fallback.strategy}: "${input.locator.value}" → "${fallback.locator.value}"`,
        };
      }
    }

    // Delegate to AI-based SelfHealer
    this._stats.aiDelegations++;
    log("D365 fallbacks exhausted, delegating to AI SelfHealer");

    return this._selfHealer.heal(input);
  }

  /**
   * Generate D365 field locators from a field name and page snapshot.
   *
   * Extracts all possible locator strategies for a D365 field,
   * checking which ones exist in the DOM snapshot.
   *
   * @param fieldName — D365 field logical name (e.g. "firstname")
   * @param pageSnapshot — Current DOM/HTML snapshot
   * @returns Array of candidate locators, ordered by preference
   */
  generateD365Locators(fieldName: string, pageSnapshot: string): Locator[] {
    const candidates: Locator[] = [];
    const snapshot = pageSnapshot.toLowerCase();

    // Strategy 1: data-id attribute (D365 primary)
    const dataIdSelectors = [
      `[data-id="${fieldName}"]`,
      `[data-id="${fieldName}.fieldControl_container"]`,
      `[data-id="${fieldName}.fieldControl-text-box-text"]`,
      `[data-id="${fieldName}.fieldControl-date-time-input"]`,
      `[data-id="${fieldName}.fieldControl-checkbox-toggle"]`,
      ...this._config.customDataIdPrefixes.map((prefix) => `[data-id="${prefix}${fieldName}"]`),
    ];

    for (const selector of dataIdSelectors) {
      if (snapshot.includes(selector.toLowerCase().replace(/[[\]"]/g, ""))) {
        candidates.push(LocatorSchema.parse({
          strategy: "css",
          value: selector,
          confidence: 95,
        }));
      }
    }

    // Strategy 2: aria-label (UCI accessibility)
    const ariaLabel = fieldName.replace(/([A-Z])/g, " $1").trim();
    if (snapshot.includes(`aria-label="${fieldName.toLowerCase()}"`) || snapshot.includes(`aria-label="${ariaLabel.toLowerCase()}"`)) {
      candidates.push(LocatorSchema.parse({
        strategy: "aria",
        value: fieldName,
        confidence: 85,
      }));
    }

    // Strategy 3: text content (visible label)
    const displayName = fieldName
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .trim();

    if (snapshot.includes(`>${displayName.toLowerCase()}<`) || snapshot.includes(`>${displayName.toLowerCase()}`)) {
      candidates.push(LocatorSchema.parse({
        strategy: "text",
        value: displayName,
        confidence: 70,
      }));
    }

    // Strategy 4: field label association
    const labelPattern = `label[for="${fieldName}"]`;
    if (snapshot.includes(labelPattern.toLowerCase())) {
      candidates.push(LocatorSchema.parse({
        strategy: "css",
        value: labelPattern,
        confidence: 75,
      }));
    }

    // Strategy 5: XPath structural (last resort)
    const xpathCandidates = [
      `//div[contains(@data-id, '${fieldName}')]`,
      `//input[contains(@data-id, '${fieldName}')]`,
      `//div[contains(@aria-label, '${fieldName}')]`,
    ];

    for (const xpath of xpathCandidates) {
      if (snapshot.includes(fieldName.toLowerCase())) {
        candidates.push(LocatorSchema.parse({
          strategy: "xpath",
          value: xpath,
          confidence: 50,
        }));
        break; // Only add one XPath candidate
      }
    }

    log("Generated %d D365 locators for field: %s", candidates.length, fieldName);
    return candidates;
  }

  /**
   * Get healing statistics.
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Get the fallback locator cache.
   */
  getFallbackCache(): ReadonlyMap<string, Locator> {
    return new Map(this._fallbackCache);
  }

  /**
   * Clear the fallback cache.
   */
  clearFallbackCache(): void {
    this._fallbackCache.clear();
  }

  /**
   * Initialize the underlying SelfHealer (loads persisted healed locators).
   */
  async initialize(): Promise<void> {
    await this._selfHealer.initialize();
  }

  // ─── Private ──────────────────────────────────────────────────────────

  /**
   * Try D365-specific fallback strategies against the page snapshot.
   *
   * Fallback chain:
   * 1. data-id attribute
   * 2. aria-label
   * 3. text content
   * 4. field label
   * 5. XPath
   */
  private _tryD365Fallbacks(input: SelfHealerInput): D365FallbackResult | null {
    const snapshot = input.pageSnapshot.toLowerCase();
    const originalValue = input.locator.value;

    // Extract a field name hint from the original locator
    const fieldHint = this._extractFieldHint(originalValue);
    if (!fieldHint) {
      log("Could not extract field hint from: %s", originalValue);
      return null;
    }

    // Strategy 1: data-id
    const dataIdSelectors = [
      `[data-id="${fieldHint}"]`,
      `[data-id="${fieldHint}.fieldControl_container"]`,
      `[data-id="${fieldHint}.fieldControl-text-box-text"]`,
    ];

    for (const selector of dataIdSelectors) {
      if (this._selectorExistsInSnapshot(selector, snapshot)) {
        this._recordStrategyHit("data-id");
        return {
          strategy: "data-id",
          locator: LocatorSchema.parse({
            strategy: "css",
            value: selector,
            confidence: 95,
            healedFrom: originalValue,
            healedAt: new Date(),
          }),
          confidence: 95,
        };
      }
    }

    // Strategy 2: aria-label
    const ariaLabel = fieldHint.replace(/([A-Z])/g, " $1").trim();
    if (snapshot.includes(`aria-label="${fieldHint.toLowerCase()}"`) || snapshot.includes(`aria-label="${ariaLabel.toLowerCase()}"`)) {
      this._recordStrategyHit("aria-label");
      return {
        strategy: "aria-label",
        locator: LocatorSchema.parse({
          strategy: "aria",
          value: fieldHint,
          confidence: 85,
          healedFrom: originalValue,
          healedAt: new Date(),
        }),
        confidence: 85,
      };
    }

    // Strategy 3: text content
    const displayName = fieldHint.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
    if (snapshot.includes(`>${displayName.toLowerCase()}<`)) {
      this._recordStrategyHit("text-content");
      return {
        strategy: "text-content",
        locator: LocatorSchema.parse({
          strategy: "text",
          value: displayName,
          confidence: 70,
          healedFrom: originalValue,
          healedAt: new Date(),
        }),
        confidence: 70,
      };
    }

    // Strategy 4: field label
    const labelSelector = `label[for="${fieldHint}"]`;
    if (snapshot.includes(labelSelector.toLowerCase())) {
      this._recordStrategyHit("field-label");
      return {
        strategy: "field-label",
        locator: LocatorSchema.parse({
          strategy: "css",
          value: labelSelector,
          confidence: 75,
          healedFrom: originalValue,
          healedAt: new Date(),
        }),
        confidence: 75,
      };
    }

    // Strategy 5: XPath
    const xpath = `//div[contains(@data-id, '${fieldHint}')]`;
    if (snapshot.includes(fieldHint.toLowerCase())) {
      this._recordStrategyHit("xpath");
      return {
        strategy: "xpath",
        locator: LocatorSchema.parse({
          strategy: "xpath",
          value: xpath,
          confidence: 50,
          healedFrom: originalValue,
          healedAt: new Date(),
        }),
        confidence: 50,
      };
    }

    log("All D365 fallbacks exhausted for: %s", originalValue);
    return null;
  }

  /**
   * Extract a D365 field name hint from a locator value.
   *
   * Handles patterns like:
   * - `[data-id="firstname"]` → "firstname"
   * - `#firstname` → "firstname"
   * - `.field-firstname` → "firstname"
   * - `input[name="firstname"]` → "firstname"
   */
  private _extractFieldHint(locatorValue: string): string | null {
    // data-id pattern
    const dataIdMatch = locatorValue.match(/data-id="([^"]+)"/);
    if (dataIdMatch?.[1]) {
      // Strip .fieldControl suffix
      return dataIdMatch[1].split(".fieldControl")[0] ?? dataIdMatch[1];
    }

    // ID pattern
    const idMatch = locatorValue.match(/#([a-zA-Z][\w-]*)/);
    if (idMatch?.[1]) return idMatch[1];

    // Name attribute pattern
    const nameMatch = locatorValue.match(/name="([^"]+)"/);
    if (nameMatch?.[1]) return nameMatch[1];

    // Class pattern
    const classMatch = locatorValue.match(/\.field-([a-zA-Z][\w-]*)/);
    if (classMatch?.[1]) return classMatch[1];

    // aria-label pattern
    const ariaMatch = locatorValue.match(/aria-label="([^"]+)"/);
    if (ariaMatch?.[1]) {
      // Convert display name back to logical name (approximate)
      return ariaMatch[1].toLowerCase().replace(/\s+/g, "");
    }

    // If the value is just a plain word (likely a field name)
    if (/^[a-zA-Z][\w]*$/.test(locatorValue)) {
      return locatorValue;
    }

    return null;
  }

  /**
   * Check if a CSS selector pattern exists in the page snapshot.
   */
  private _selectorExistsInSnapshot(selector: string, snapshot: string): boolean {
    // Simple string matching — not a full CSS selector engine,
    // but sufficient for D365's predictable data-id patterns
    const normalized = selector.replace(/[[\]"]/g, "").toLowerCase();
    return snapshot.includes(normalized);
  }

  /**
   * Record a hit for a fallback strategy.
   */
  private _recordStrategyHit(strategy: string): void {
    if (!this._stats.fallbackStrategyHits[strategy]) {
      this._stats.fallbackStrategyHits[strategy] = 0;
    }
    this._stats.fallbackStrategyHits[strategy]++;
  }
}

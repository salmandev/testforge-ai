import { z } from "zod";

/**
 * Locator strategy types supported by TestForge
 */
export const LocatorStrategySchema = z.enum([
  "css",
  "xpath",
  "aria",
  "text",
  "visual",
]);

export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;

/**
 * Represents a single UI element locator with AI confidence tracking
 */
export const LocatorSchema = z.object({
  /** The strategy used to locate the element */
  strategy: LocatorStrategySchema,
  /** The locator value (e.g., CSS selector, XPath expression) */
  value: z.string(),
  /** AI confidence score (0-100) for this locator */
  confidence: z.number().min(0).max(100).default(100),
  /** Original locator this was healed from, if applicable */
  healedFrom: z.string().optional(),
  /** Timestamp when this locator was last healed */
  healedAt: z.coerce.date().optional(),
});

export type Locator = z.infer<typeof LocatorSchema>;

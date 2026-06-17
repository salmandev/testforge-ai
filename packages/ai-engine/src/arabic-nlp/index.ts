import debug from "debug";

const log = debug("testforge:ai:arabic-nlp");

/**
 * Parsed intent from Arabic natural language
 */
export interface ArabicIntent {
  /** The action to perform (click, type, assert, navigate, etc.) */
  action: string;
  /** The target element description */
  target: string;
  /** The value to use (for type/fill/assert actions) */
  value?: string;
  /** Confidence score (0-100) */
  confidence: number;
  /** Original Arabic text */
  originalText: string;
  /** English translation of the intent */
  englishTranslation: string;
}

/**
 * Common Arabic UI action patterns
 */
const ARABIC_ACTION_PATTERNS: {
  patterns: RegExp[];
  action: string;
  targetGroup: number;
  valueGroup?: number;
}[] = [
  // اضغط على الزر (Click on the button)
  {
    patterns: [/(?:اضغط|انقر|كليك)\s+(?:على\s+)?(.+)/],
    action: "click",
    targetGroup: 1,
  },
  // اكتب في الحقل (Type in the field)
  {
    patterns: [/(?:اكتب|ادخل|ادخال)\s+(.+?)\s+(?:في|ب)\s+(.+)/],
    action: "type",
    targetGroup: 2,
    valueGroup: 1,
  },
  // تحقق من (Verify/assert)
  {
    patterns: [/(?:تحقق|تأكد|تاكد)\s+(?:من\s+)?(?:ان\s+)?(.+?)\s*(?:يساوي|=)\s*(.+)/],
    action: "assert",
    targetGroup: 1,
    valueGroup: 2,
  },
  // انتقل إلى (Navigate to)
  {
    patterns: [/(?:انتقل|اذهب|افتح)\s+(?:إلى|الى|ل)\s+(.+)/],
    action: "navigate",
    targetGroup: 1,
  },
  // اختر من القائمة (Select from dropdown)
  {
    patterns: [/(?:اختر|حدد)\s+(.+?)\s+(?:من|في)\s+(.+)/],
    action: "select",
    targetGroup: 2,
    valueGroup: 1,
  },
  // انتظر (Wait)
  {
    patterns: [/(?:انتظر|استنى|انتظر\s+)?(\d+)\s*(?:ثانية|ثواني|ث)/],
    action: "wait",
    targetGroup: 0,
    valueGroup: 1,
  },
  // مرر لأسفل (Scroll down)
  {
    patterns: [/(?:مرر|اسحب|سحب)\s+(?:ل|الى\s+)?(?:أسفل|اسفل|تحت)/],
    action: "scroll",
    targetGroup: 0,
  },
  // سجل الدخول (Login)
  {
    patterns: [/(?:سجل|تسجيل)\s+(?:الدخول|الخروج)/],
    action: "click",
    targetGroup: 0,
  },
];

/**
 * Arabic NL Parser — converts Arabic natural language to test actions
 *
 * Supports common Arabic UI testing commands with RTL text handling.
 *
 * @example
 * ```ts
 * const parser = new ArabicNLParser();
 * const intent = parser.parse("اضغط على زر إرسال");
 * // { action: "click", target: "زر إرسال", confidence: 85 }
 * ```
 */
export class ArabicNLParser {
  /**
   * Parse Arabic text into a structured test intent
   */
  parse(text: string): ArabicIntent {
    const trimmed = text.trim();

    // Remove Arabic diacritics for matching
    const normalized = this._removeDiacritics(trimmed);

    for (const rule of ARABIC_ACTION_PATTERNS) {
      for (const pattern of rule.patterns) {
        const match = normalized.match(pattern);
        if (match) {
          const target = rule.targetGroup > 0 ? (match[rule.targetGroup] ?? "").trim() : trimmed;
          const value = rule.valueGroup !== undefined ? (match[rule.valueGroup] ?? "").trim() : undefined;

          log("Arabic NL parsed: %s -> action=%s target=%s", trimmed, rule.action, target);

          return {
            action: rule.action,
            target,
            value: value || undefined,
            confidence: this._calculateConfidence(trimmed, rule.action),
            originalText: trimmed,
            englishTranslation: this._translateAction(rule.action, target, value),
          };
        }
      }
    }

    // Fallback: treat as navigation or generic interaction
    log("Arabic NL: no pattern matched, defaulting to generic interaction");
    return {
      action: "interact",
      target: trimmed,
      confidence: 30,
      originalText: trimmed,
      englishTranslation: `Interact with: ${trimmed}`,
    };
  }

  /**
   * Parse multiple Arabic lines into a sequence of intents
   */
  parseMultiple(text: string): ArabicIntent[] {
    const lines = text.split(/\n+/).filter((l) => l.trim().length > 0);
    return lines.map((line) => this.parse(line));
  }

  /**
   * Detect if text is Arabic/RTL
   */
  static isArabic(text: string): boolean {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicRegex.test(text);
  }

  /**
   * Detect if text contains Arabic numbers (٠١٢٣٤٥٦٧٨٩)
   */
  static hasArabicNumbers(text: string): boolean {
    return /[\u0660-\u0669]/.test(text);
  }

  /**
   * Convert Arabic-Indic digits to Western digits
   */
  static normalizeNumbers(text: string): string {
    const arabicToWestern: Record<string, string> = {
      "\u0660": "0", "\u0661": "1", "\u0662": "2", "\u0663": "3", "\u0664": "4",
      "\u0665": "5", "\u0666": "6", "\u0667": "7", "\u0668": "8", "\u0669": "9",
    };
    return text.replace(/[\u0660-\u0669]/g, (c) => arabicToWestern[c] ?? c);
  }

  /**
   * Remove Arabic diacritics (tashkeel) for better pattern matching
   */
  private _removeDiacritics(text: string): string {
    // Arabic diacritical marks: Fatha, Damma, Kasra, Sukun, Shadda, Tanwin
    return text.replace(/[\u064B-\u065F\u0670]/g, "");
  }

  /**
   * Calculate confidence based on text clarity and pattern match strength
   */
  private _calculateConfidence(text: string, action: string): number {
    let confidence = 70;

    // Higher confidence for clear action verbs
    const clearVerbs = ["اضغط", "انقر", "اكتب", "تحقق", "انتقل"];
    if (clearVerbs.some((v) => text.includes(v))) confidence += 15;

    // Lower confidence for very short text
    if (text.length < 5) confidence -= 20;

    // Higher confidence for longer, descriptive text
    if (text.length > 20) confidence += 5;

    // Cap at 95
    return Math.min(95, Math.max(10, confidence));
  }

  /**
   * Translate an Arabic action to English description
   */
  private _translateAction(action: string, target: string, value?: string): string {
    const actionMap: Record<string, string> = {
      click: "Click on",
      type: "Type",
      assert: "Assert",
      navigate: "Navigate to",
      select: "Select",
      wait: "Wait",
      scroll: "Scroll",
      interact: "Interact with",
    };

    const verb = actionMap[action] ?? action;
    if (value) return `${verb} "${value}" in "${target}"`;
    return `${verb} "${target}"`;
  }
}

/**
 * RTL Locator Strategy for Arabic/RTL interfaces
 *
 * Provides locator strategies optimized for RTL layouts:
 * - Text-based locators for Arabic content
 * - Position-aware locators for RTL flow
 * - Bilingual locator fallbacks
 *
 * @example
 * ```ts
 * const strategy = new RTLLocatorStrategy();
 * const locators = strategy.generateLocators("زر تسجيل الدخول");
 * // Returns array of locator strategies prioritized for RTL
 * ```
 */
export class RTLLocatorStrategy {
  /**
   * Generate locator strategies for an Arabic UI element
   */
  generateLocators(text: string): { strategy: string; value: string; confidence: number }[] {
    const locators: { strategy: string; value: string; confidence: number }[] = [];

    // 1. Exact Arabic text match
    locators.push({
      strategy: "text",
      value: text,
      confidence: 90,
    });

    // 2. CSS selector with dir="rtl" context
    locators.push({
      strategy: "css",
      value: `[dir="rtl"] :text("${text}")`,
      confidence: 80,
    });

    // 3. XPath text match
    locators.push({
      strategy: "xpath",
      value: `//*[text()="${text}" or contains(text(),"${text}")]`,
      confidence: 75,
    });

    // 4. ARIA label (common in accessible Arabic apps)
    locators.push({
      strategy: "aria",
      value: text,
      confidence: 70,
    });

    // 5. data-testid patterns (common convention)
    const testIdGuess = text
      .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();
    if (testIdGuess.length > 0) {
      locators.push({
        strategy: "css",
        value: `[data-testid="${testIdGuess}"]`,
        confidence: 50,
      });
    }

    log("Generated %d RTL locator strategies for: %s", locators.length, text);
    return locators;
  }

  /**
   * Convert RTL coordinates to LTR-equivalent for cross-layout compatibility
   */
  static rtlToLtrPosition(rtlX: number, containerWidth: number): number {
    return containerWidth - rtlX;
  }

  /**
   * Detect if a page is RTL layout
   */
  static isRTLLayout(dir?: string, lang?: string): boolean {
    if (dir === "rtl") return true;
    const rtlLangs = ["ar", "he", "fa", "ur", "ps", "sd", "yi"];
    return rtlLangs.includes((lang ?? "").substring(0, 2).toLowerCase());
  }

  /**
   * Generate a CSS selector for RTL-aware elements
   */
  static rtlAwareSelector(baseSelector: string, isRTL: boolean): string {
    if (!isRTL) return baseSelector;
    return `[dir="rtl"] ${baseSelector}, ${baseSelector}`;
  }
}

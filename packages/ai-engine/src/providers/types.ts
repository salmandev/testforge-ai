/**
 * Unified AI Provider interface for TestForge AI Engine
 *
 * All AI providers (Claude, Ollama, etc.) implement this interface
 * to provide a consistent API for text generation, streaming, and vision.
 */

/**
 * Configuration for AI provider cost and token tracking
 */
export interface TokenUsage {
  /** Input tokens consumed */
  input: number;
  /** Output tokens generated */
  output: number;
  /** Total tokens (input + output) */
  total: number;
  /** Estimated cost in USD */
  cost: number;
}

/**
 * Unified AI Provider interface
 *
 * Every AI provider must implement these three core capabilities:
 * - Text generation with system prompt support
 * - Async streaming for real-time output
 * - Vision/multimodal analysis for screenshot understanding
 */
export interface AIProvider {
  /**
   * Provider identifier (e.g., "anthropic", "ollama")
   */
  readonly providerId: string;

  /**
   * Model name being used (e.g., "claude-sonnet-4-20250514")
   */
  readonly model: string;

  /**
   * Generate a text response from the AI
   *
   * @param prompt - The user prompt/message
   * @param system - Optional system prompt for context setting
   * @returns The generated text response
   */
  generate(prompt: string, system?: string): Promise<string>;

  /**
   * Generate text with structured output parsing via Zod schema
   *
   * @param prompt - The user prompt/message
   * @param schema - Zod schema to parse and validate the output
   * @param system - Optional system prompt
   * @returns Parsed and validated result
   */
  generateStructured<T>(
    prompt: string,
    schema: import("zod").ZodType<T>,
    system?: string
  ): Promise<T>;

  /**
   * Stream text generation as an async generator
   *
   * Yields chunks of text as they are generated for real-time display
   *
   * @param prompt - The user prompt/message
   * @param system - Optional system prompt
   * @yields Generated text chunks
   */
  generateStream(
    prompt: string,
    system?: string
  ): AsyncGenerator<string, void, unknown>;

  /**
   * Analyze an image with a text prompt (multimodal vision)
   *
   * @param image - Image buffer (PNG, JPEG, etc.)
   * @param prompt - The prompt describing what to analyze
   * @returns Text description/analysis of the image
   */
  vision(image: Buffer, prompt: string): Promise<string>;

  /**
   * Get token usage from the last operation
   *
   * @returns Token usage data, or null if not available
   */
  getLastTokenUsage(): TokenUsage | null;
}

/**
 * Retry configuration for AI calls
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;
  /** Request timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  timeoutMs: 30000,
};

/**
 * Base class providing retry logic with exponential backoff for AI providers
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly providerId: string;
  abstract readonly model: string;

  protected retryConfig: RetryConfig;
  private _lastTokenUsage: TokenUsage | null = null;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  abstract generate(prompt: string, system?: string): Promise<string>;
  abstract generateStructured<T>(
    prompt: string,
    schema: import("zod").ZodType<T>,
    system?: string
  ): Promise<T>;
  abstract generateStream(
    prompt: string,
    system?: string
  ): AsyncGenerator<string, void, unknown>;
  abstract vision(image: Buffer, prompt: string): Promise<string>;

  /**
   * Get token usage from the last operation
   */
  getLastTokenUsage(): TokenUsage | null {
    return this._lastTokenUsage;
  }

  /**
   * Set the last token usage data
   */
  protected setLastTokenUsage(usage: TokenUsage): void {
    this._lastTokenUsage = usage;
  }

  /**
   * Execute a function with retry logic and exponential backoff
   */
  protected async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise<T>((_resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Request timeout after ${this.retryConfig.timeoutMs}ms`)),
            this.retryConfig.timeoutMs
          );

          fn()
            .then((result) => {
              clearTimeout(timer);
              return result;
            })
            .catch((error) => {
              clearTimeout(timer);
              throw error;
            })
            .then((result) => {
              clearTimeout(timer);
              // We need to resolve/reject from within here
              return result;
            })
            .catch((error) => {
              clearTimeout(timer);
              reject(error);
            });
        });

        return await timeoutPromise;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.retryConfig.maxRetries) {
          const delay = Math.min(
            this.retryConfig.baseDelayMs * 2 ** attempt,
            this.retryConfig.maxDelayMs
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error("Unknown error during retry");
  }
}

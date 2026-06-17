import type { AIProvider } from "./types.js";
import { ClaudeProvider, type ClaudeConfig } from "./claude.js";
import { OllamaProvider, type OllamaConfig } from "./ollama.js";

/**
 * Available AI provider types
 */
export type ProviderType = "anthropic" | "ollama";

/**
 * Configuration for the ProviderFactory
 */
export interface ProviderFactoryConfig {
  /** Anthropic/Claude configuration */
  anthropic?: Partial<ClaudeConfig>;
  /** Ollama configuration */
  ollama?: Partial<OllamaConfig>;
  /** Preferred provider order (default: ["anthropic", "ollama"]) */
  preferredOrder?: ProviderType[];
}

/**
 * Factory that auto-selects and creates AI providers based on environment
 *
 * Auto-selection logic:
 * 1. If ANTHROPIC_API_KEY is set → use Claude
 * 2. If OLLAMA_BASE_URL is set or localhost:11434 reachable → use Ollama
 * 3. Fall back: Claude → Ollama → throw helpful error
 *
 * @example
 * ```ts
 * const provider = await ProviderFactory.create();
 * const response = await provider.generate("Hello");
 * ```
 */
export class ProviderFactory {
  /**
   * Create an AI provider instance with auto-selection
   *
   * @param config - Optional factory configuration
   * @returns An AIProvider instance (Claude or Ollama)
   * @throws Error if no provider can be initialized
   */
  static async create(config?: ProviderFactoryConfig): Promise<AIProvider> {
    const preferredOrder = config?.preferredOrder ?? ["anthropic", "ollama"];

    for (const providerType of preferredOrder) {
      try {
        const provider = await this._tryCreateProvider(
          providerType,
          config
        );
        if (provider) {
          return provider;
        }
      } catch {
        // Continue to next provider
      }
    }

    throw new Error(
      "No AI provider available. Please configure one of:\n" +
        "1. Set ANTHROPIC_API_KEY environment variable for Claude\n" +
        "2. Install and run Ollama (https://ollama.ai) for local AI\n" +
        "\n" +
        "Visit https://testforge.ai/docs/setup for detailed instructions."
    );
  }

  /**
   * Create a specific provider type directly
   */
  static createClaude(config: ClaudeConfig): ClaudeProvider {
    return new ClaudeProvider(config);
  }

  static createOllama(config?: OllamaConfig): OllamaProvider {
    return new OllamaProvider(config);
  }

  /**
   * Check if a provider type is available
   */
  static async isAvailable(type: ProviderType): Promise<boolean> {
    try {
      const provider = await this._tryCreateProvider(type);
      return provider !== null;
    } catch {
      return false;
    }
  }

  /**
   * Attempt to create a specific provider type
   */
  private static async _tryCreateProvider(
    type: ProviderType,
    config?: ProviderFactoryConfig
  ): Promise<AIProvider | null> {
    switch (type) {
      case "anthropic": {
        const apiKey =
          config?.anthropic?.apiKey ?? process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          return null;
        }
        return new ClaudeProvider({
          apiKey,
          model: config?.anthropic?.model,
          maxTokens: config?.anthropic?.maxTokens,
          temperature: config?.anthropic?.temperature,
          retryConfig: config?.anthropic?.retryConfig,
        });
      }

      case "ollama": {
        const baseUrl =
          config?.ollama?.baseUrl ??
          process.env.OLLAMA_BASE_URL ??
          "http://localhost:11434";

        // Test connectivity to Ollama
        try {
          const response = await fetch(`${baseUrl}/api/tags`, {
            method: "GET",
            signal: AbortSignal.timeout(3000),
          });
          if (!response.ok) {
            return null;
          }
        } catch {
          return null;
        }

        return new OllamaProvider({
          baseUrl,
          model: config?.ollama?.model,
          numPredict: config?.ollama?.numPredict,
          temperature: config?.ollama?.temperature,
          retryConfig: config?.ollama?.retryConfig,
        });
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unknown provider type: ${_exhaustiveCheck}`);
      }
    }
  }
}

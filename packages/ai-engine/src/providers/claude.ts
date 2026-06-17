import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BaseAIProvider, type TokenUsage, type RetryConfig } from "./types.js";
import debug from "debug";

const log = debug("testforge:ai:claude");

/**
 * Configuration for the Claude AI provider
 */
export interface ClaudeConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Retry configuration */
  retryConfig?: Partial<RetryConfig>;
}

/**
 * Claude (Anthropic) AI Provider implementation
 *
 * Uses the official @anthropic-ai/sdk to interact with Claude models.
 * Supports text generation, structured output, streaming, and vision.
 *
 * @example
 * ```ts
 * const claude = new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY! });
 * const response = await claude.generate("Explain quantum computing");
 * ```
 */
export class ClaudeProvider extends BaseAIProvider {
  readonly providerId = "anthropic";
  readonly model: string;

  private client: Anthropic;
  private maxTokens: number;
  private temperature: number;

  constructor(config: ClaudeConfig) {
    super(config.retryConfig);
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? "claude-sonnet-4-20250514";
    this.maxTokens = config.maxTokens ?? 4096;
    this.temperature = config.temperature ?? 0.1;
  }

  /**
   * Generate a text response using Claude
   */
  async generate(prompt: string, system?: string): Promise<string> {
    return this.withRetry(async () => {
      log("Generating with model %s, system prompt: %s", this.model, !!system);

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system,
        messages: [{ role: "user", content: prompt }],
      });

      const content = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      const usage: TokenUsage = {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        total: message.usage.input_tokens + message.usage.output_tokens,
        cost: this._calculateCost(
          message.usage.input_tokens,
          message.usage.output_tokens
        ),
      };
      this.setLastTokenUsage(usage);

      log("Token usage: %d input, %d output, cost: $%f", usage.input, usage.output, usage.cost);
      return content;
    });
  }

  /**
   * Generate structured output using Claude with JSON schema
   */
  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    system?: string
  ): Promise<T> {
    return this.withRetry(async () => {
      const jsonSchema = zodToJsonSchema(schema, "OutputSchema");

      log(
        "Generating structured output with model %s",
        this.model
      );

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: `${system ?? ""}\n\nIMPORTANT: Respond with valid JSON matching this schema. Do not include any text before or after the JSON.`,
        messages: [
          { role: "user", content: prompt },
          {
            role: "assistant",
            content: `Here is the JSON schema:\n${JSON.stringify(jsonSchema, null, 2)}\n\nPlease provide the JSON response:`,
          },
        ],
      });

      const content = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      const usage: TokenUsage = {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        total: message.usage.input_tokens + message.usage.output_tokens,
        cost: this._calculateCost(
          message.usage.input_tokens,
          message.usage.output_tokens
        ),
      };
      this.setLastTokenUsage(usage);

      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonString = jsonMatch
        ? (jsonMatch[1] ?? content)
        : content;

      const parsed = JSON.parse(jsonString.trim());
      const validated = schema.parse(parsed);

      log("Structured output validated successfully");
      return validated;
    });
  }

  /**
   * Stream text generation from Claude as an async generator
   */
  async *generateStream(
    prompt: string,
    system?: string
  ): AsyncGenerator<string, void, unknown> {
    log("Streaming with model %s", this.model);

    const stream = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    let totalOutputTokens = 0;

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        const text = chunk.delta.text;
        totalOutputTokens += text.length;
        yield text;
      }
    }

    log("Streaming completed, ~%d output tokens", Math.ceil(totalOutputTokens / 4));
  }

  /**
   * Analyze an image using Claude's vision capabilities
   */
  async vision(image: Buffer, prompt: string): Promise<string> {
    return this.withRetry(async () => {
      log("Vision analysis with model %s", this.model);

      const base64Image = image.toString("base64");
      const mediaType = this._detectMediaType(image) as "image/png" | "image/jpeg" | "image/gif" | "image/webp";

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      });

      const content = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      const usage: TokenUsage = {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        total: message.usage.input_tokens + message.usage.output_tokens,
        cost: this._calculateCost(
          message.usage.input_tokens,
          message.usage.output_tokens
        ),
      };
      this.setLastTokenUsage(usage);

      log("Vision analysis completed, token cost: $%f", usage.cost);
      return content;
    });
  }

  /**
   * Calculate estimated cost based on Anthropic pricing (as of 2025)
   * Claude Sonnet 4: $3/M input, $15/M output tokens
   */
  private _calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCostPerToken = 3 / 1_000_000;
    const outputCostPerToken = 15 / 1_000_000;
    return inputTokens * inputCostPerToken + outputTokens * outputCostPerToken;
  }

  /**
   * Detect image MIME type from buffer
   */
  private _detectMediaType(image: Buffer): string {
    // Check PNG signature
    if (
      image[0] === 0x89 &&
      image[1] === 0x50 &&
      image[2] === 0x4e &&
      image[3] === 0x47
    ) {
      return "image/png";
    }
    // Check JPEG signature
    if (image[0] === 0xff && image[1] === 0xd8) {
      return "image/jpeg";
    }
    // Check WebP signature
    if (
      image[0] === 0x52 &&
      image[1] === 0x49 &&
      image[2] === 0x46 &&
      image[3] === 0x46
    ) {
      return "image/webp";
    }
    return "image/png"; // Default fallback
  }
}

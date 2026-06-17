import ollama from "ollama";
import type { ChatResponse } from "ollama";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BaseAIProvider, type TokenUsage, type RetryConfig } from "./types.js";
import debug from "debug";

const log = debug("testforge:ai:ollama");

/**
 * Configuration for the Ollama AI provider
 */
export interface OllamaConfig {
  /** Ollama server base URL (default: http://localhost:11434) */
  baseUrl?: string;
  /** Model to use (default: llama3.2) */
  model?: string;
  /** Maximum tokens to generate */
  numPredict?: number;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Retry configuration */
  retryConfig?: Partial<RetryConfig>;
}

/**
 * Ollama AI Provider implementation
 *
 * Uses the ollama-js client to interact with locally-hosted Ollama models.
 * Provides a free, offline-capable alternative to Claude.
 *
 * @example
 * ```ts
 * const ollama = new OllamaProvider({ model: "llama3.2" });
 * const response = await ollama.generate("Explain quantum computing");
 * ```
 */
export class OllamaProvider extends BaseAIProvider {
  readonly providerId = "ollama";
  readonly model: string;

  private host: string;
  private numPredict: number;
  private temperature: number;

  constructor(config: OllamaConfig = {}) {
    super(config.retryConfig);
    this.host = config.baseUrl ?? "http://localhost:11434";
    this.model = config.model ?? "llama3.2";
    this.numPredict = config.numPredict ?? 4096;
    this.temperature = config.temperature ?? 0.1;
  }

  /**
   * Generate a text response using Ollama
   */
  async generate(prompt: string, system?: string): Promise<string> {
    return this.withRetry(async () => {
      log("Generating with model %s", this.model);

      const response: ChatResponse = await ollama.chat({
        model: this.model,
        messages: [
          ...(system ? [{ role: "system" as const, content: system }] : []),
          { role: "user" as const, content: prompt },
        ],
        stream: false,
        options: {
          temperature: this.temperature,
          num_predict: this.numPredict,
        },
      });

      const usage: TokenUsage = {
        input: response.prompt_eval_count ?? 0,
        output: response.eval_count ?? 0,
        total: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
        cost: 0, // Ollama is free/local
      };
      this.setLastTokenUsage(usage);

      log("Token usage: %d input, %d output", usage.input, usage.output);
      return response.message.content;
    });
  }

  /**
   * Generate structured output using Ollama with JSON schema
   */
  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    system?: string
  ): Promise<T> {
    return this.withRetry(async () => {
      const jsonSchema = zodToJsonSchema(schema, "OutputSchema");

      log("Generating structured output with model %s", this.model);

      const enhancedSystem = `${system ?? ""}\n\nIMPORTANT: Respond with valid JSON only. Do not include any text before or after the JSON. The JSON must match this schema:\n${JSON.stringify(jsonSchema, null, 2)}`;

      const response: ChatResponse = await ollama.chat({
        model: this.model,
        messages: [
          { role: "system" as const, content: enhancedSystem },
          { role: "user" as const, content: prompt },
        ],
        stream: false,
        format: "json",
        options: {
          temperature: this.temperature,
          num_predict: this.numPredict,
        },
      });

      const usage: TokenUsage = {
        input: response.prompt_eval_count ?? 0,
        output: response.eval_count ?? 0,
        total: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
        cost: 0,
      };
      this.setLastTokenUsage(usage);

      const content = response.message.content;
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
   * Stream text generation from Ollama as an async generator
   */
  async *generateStream(
    prompt: string,
    system?: string
  ): AsyncGenerator<string, void, unknown> {
    log("Streaming with model %s", this.model);

    const stream = await ollama.chat({
      model: this.model,
      messages: [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        { role: "user" as const, content: prompt },
      ],
      stream: true,
      options: {
        temperature: this.temperature,
        num_predict: this.numPredict,
      },
    });

    let totalOutputTokens = 0;

    for await (const chunk of stream) {
      const text = chunk.message.content;
      totalOutputTokens += text.length;
      yield text;
    }

    log("Streaming completed, ~%d output tokens", Math.ceil(totalOutputTokens / 4));
  }

  /**
   * Analyze an image using Ollama's vision capabilities
   *
   * Note: Requires a vision-capable model (e.g., llava)
   */
  async vision(image: Buffer, prompt: string): Promise<string> {
    return this.withRetry(async () => {
      log("Vision analysis with model %s", this.model);

      const base64Image = image.toString("base64");

      const response: ChatResponse = await ollama.chat({
        model: this.model,
        messages: [
          {
            role: "user" as const,
            content: prompt,
            images: [base64Image],
          },
        ],
        stream: false,
        options: {
          temperature: this.temperature,
          num_predict: this.numPredict,
        },
      });

      const usage: TokenUsage = {
        input: response.prompt_eval_count ?? 0,
        output: response.eval_count ?? 0,
        total: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
        cost: 0,
      };
      this.setLastTokenUsage(usage);

      log("Vision analysis completed");
      return response.message.content;
    });
  }
}

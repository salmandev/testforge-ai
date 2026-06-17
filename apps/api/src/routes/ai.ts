import type { FastifyInstance } from "fastify";
import type { ApiServerConfig } from "../server.js";
import { z } from "zod";
import { ProviderFactory } from "@testforge/ai-engine";

/**
 * Register AI-related routes
 */
export async function registerAiRoutes(
  app: FastifyInstance,
  _config: ApiServerConfig
): Promise<void> {
  // AI test generation
  app.post("/api/ai/generate", {
    schema: {
      body: z.object({
        url: z.string().url().optional(),
        naturalLanguage: z.string().optional(),
        screenshot: z.string().optional(),
        openApiSpec: z.string().optional(),
        postmanCollection: z.string().optional(),
        arabicText: z.string().optional(),
      }),
    },
    handler: async (request) => {
      const body = request.body as Record<string, string | undefined>;
      const provider = await ProviderFactory.create();
      const { TestGenerator } = await import("@testforge/ai-engine");
      const generator = new TestGenerator(provider);

      const input: Record<string, unknown> = {};
      if (body.url) input.url = body.url;
      if (body.naturalLanguage) input.naturalLanguage = body.naturalLanguage;
      if (body.openApiSpec) input.openApiSpec = body.openApiSpec;
      if (body.postmanCollection) input.postmanCollection = body.postmanCollection;
      if (body.arabicText) input.arabicText = body.arabicText;

      const result = await generator.generate(input);

      return {
        tests: result.tests,
        pageObjects: result.pageObjects,
        confidence: result.confidence,
      };
    },
  });

  // Self-heal endpoint
  app.post("/api/ai/heal", {
    schema: {
      body: z.object({
        locator: z.object({
          strategy: z.string(),
          value: z.string(),
        }),
        pageSnapshot: z.string(),
        error: z.string(),
      }),
    },
    handler: async (request) => {
      const body = request.body as {
        locator: { strategy: string; value: string };
        pageSnapshot: string;
        error: string;
      };

      const provider = await ProviderFactory.create();
      const { SelfHealer } = await import("@testforge/ai-engine");
      const { EventBus } = await import("@testforge/core");
      const healer = new SelfHealer(provider, new EventBus());

      const result = await healer.heal({
        locator: {
          strategy: body.locator.strategy as any,
          value: body.locator.value,
          confidence: 0,
          source: "ai" as const,
        },
        pageSnapshot: body.pageSnapshot,
        screenshot: Buffer.from(""),
        error: body.error,
      });

      return result;
    },
  });

  // AI suite analysis
  app.post("/api/ai/analyze", {
    schema: {
      body: z.object({
        suiteResults: z.record(z.unknown()),
        flakiness: z.boolean().optional(),
        coverage: z.boolean().optional(),
      }),
    },
    handler: async (request) => {
      const body = request.body as {
        suiteResults: Record<string, unknown>;
        flakiness?: boolean;
        coverage?: boolean;
      };

      const provider = await ProviderFactory.create();

      let prompt: string;
      if (body.flakiness) {
        prompt = "Analyze these test results for flakiness patterns. Which tests are likely to fail intermittently and why?";
      } else if (body.coverage) {
        prompt = "Analyze these test results for coverage gaps. What areas of the application are not being tested?";
      } else {
        prompt = "Provide a comprehensive analysis of these test results including quality assessment, risks, and recommendations.";
      }

      const analysis = await provider.generate(
        `${prompt}\n\nTest Results:\n${JSON.stringify(body.suiteResults, null, 2).substring(0, 5000)}`,
        "You are a senior QA analyst reviewing test results and providing actionable insights."
      );

      return { analysis };
    },
  });

  // Start autonomous agent
  app.post("/api/ai/agent", {
    schema: {
      body: z.object({
        appUrl: z.string().url(),
        depth: z.number().default(3),
        findBugs: z.boolean().default(true),
        generateTests: z.boolean().default(true),
      }),
    },
    handler: async (request) => {
      const body = request.body as {
        appUrl: string;
        depth?: number;
        findBugs?: boolean;
        generateTests?: boolean;
      };

      const provider = await ProviderFactory.create();
      const { AutonomousAgent } = await import("@testforge/ai-engine");
      const agent = new AutonomousAgent(provider);

      const result = await agent.explore({
        appUrl: body.appUrl,
        depth: body.depth ?? 3,
        findBugs: body.findBugs ?? true,
        generateTests: body.generateTests ?? true,
      });

      return {
        bugsFound: result.bugsFound,
        testsGenerated: result.testsGenerated,
        coverageMap: result.coverageMap,
        explorationSummary: result.explorationSummary,
      };
    },
  });
}

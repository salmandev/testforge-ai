import { z } from "zod";
import type { AIProvider } from "../providers/types.js";
import type { TestCase } from "@testforge/core";
import { TestCaseSchema } from "@testforge/core";
import debug from "debug";

const log = debug("testforge:ai:intent-engine");

/**
 * Input for intent-based test generation
 */
export interface IntentEngineInput {
  /** Natural language intent description */
  intent: string;
  /** Application URL to test against */
  appUrl: string;
}

/**
 * Output from intent-based test generation
 */
export interface IntentEngineOutput {
  /** Generated test cases covering the intent */
  tests: TestCase[];
  /** Maintenance plan for the generated tests */
  maintenancePlan: string;
}

/**
 * Zod schema for intent engine output validation
 */
const IntentEngineOutputSchema = z.object({
  tests: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(["web", "mobile", "api", "visual"]),
      description: z.string(),
      steps: z.array(
        z.object({
          id: z.string(),
          description: z.string(),
          action: z.string(),
          data: z.unknown().optional(),
          expected: z.string().optional(),
        })
      ),
      tags: z.array(z.string()).default([]),
    })
  ),
  maintenancePlan: z.string(),
});

/**
 * IntentEngine transforms high-level testing intents into executable test suites
 *
 * This is a 2026 innovation: instead of writing individual tests, users describe
 * WHAT they want to test and the engine figures out HOW.
 *
 * The engine:
 * 1. Breaks intent into test scenarios
 * 2. Generates full test suite with Page Objects
 * 3. Creates a maintenance plan for ongoing updates
 * 4. Re-evaluates and updates tests when the application changes
 *
 * @example
 * ```ts
 * const engine = new IntentEngine(aiProvider);
 * const result = await engine.execute({
 *   intent: "Ensure checkout works end-to-end",
 *   appUrl: "https://mystore.example.com",
 * });
 * ```
 */
export class IntentEngine {
  private readonly _provider: AIProvider;

  constructor(provider: AIProvider) {
    this._provider = provider;
  }

  /**
   * Execute intent-based test generation
   *
   * @param input - Intent and application URL
   * @returns Generated tests with maintenance plan
   */
  async execute(input: IntentEngineInput): Promise<IntentEngineOutput> {
    log("Processing intent: %s", input.intent);

    const prompt = `You are an expert test architect. Convert this high-level testing intent into a comprehensive, executable test suite.

APPLICATION URL: ${input.appUrl}

TESTING INTENT: "${input.intent}"

Break down this intent into specific test scenarios covering:

1. HAPPY PATH: The primary user flow that should work
2. EDGE CASES: Unusual but valid scenarios
3. ERROR HANDLING: What should go wrong and how
4. DATA VARIATIONS: Different input types and values
5. CROSS-BROWSER: Browser-specific considerations
6. PERFORMANCE: Timing and load considerations
7. SECURITY: Authentication, authorization, input validation

For each test, provide:
- Detailed step-by-step actions
- Clear assertions and expected results
- Appropriate tags for organization

Also provide a maintenance plan explaining:
- How often tests should be reviewed
- What changes would require test updates
- How to handle flaky tests
- Monitoring recommendations

Return the result as valid JSON.`;

    const systemPrompt = `You are a senior test architect with deep expertise in test automation strategy.
Convert high-level intents into practical, maintainable test suites.
Think about real-world usage, edge cases, and long-term maintenance.
Respond with ONLY valid JSON, no markdown blocks or additional text.`;

    const response = await this._provider.generateStructured(
      prompt,
      IntentEngineOutputSchema,
      systemPrompt
    );

    // Convert to full TestCase objects
    const tests: TestCase[] = response.tests.map((test) =>
      TestCaseSchema.parse({
        ...test,
        status: "pending" as const,
        locators: [],
        aiHealthScore: 100,
        flakinessScore: 0,
        createdAt: new Date(),
      })
    );

    log(
      "Generated %d tests from intent, maintenance plan: %d chars",
      tests.length,
      response.maintenancePlan.length
    );

    return {
      tests,
      maintenancePlan: response.maintenancePlan,
    };
  }

  /**
   * Re-evaluate existing tests against application changes
   *
   * This method should be called periodically to ensure tests
   * remain valid as the application evolves.
   *
   * @param existingTests - Current test cases to re-evaluate
   * @param appChanges - Description of what changed in the app
   * @returns Updated tests with any modifications needed
   */
  async reevaluate(
    existingTests: TestCase[],
    appChanges: string
  ): Promise<{ updatedTests: TestCase[]; changeLog: string }> {
    log("Re-evaluating %d tests against app changes", existingTests.length);

    const prompt = `Review these test cases in light of the following application changes and determine if updates are needed.

APPLICATION CHANGES:
${appChanges}

EXISTING TESTS (${existingTests.length} tests):
${JSON.stringify(
      existingTests.map((t) => ({
        id: t.id,
        name: t.name,
        steps: t.steps.map((s) => ({
          id: s.id,
          description: s.description,
          action: s.action,
        })),
      })),
      null,
      2
    ).substring(0, 6000)}

For each test, determine:
1. Is it still valid? (Yes/No)
2. Does it need updates? (Yes/No)  
3. What specific changes are needed?
4. Should new tests be added for new functionality?

Return the updated test suite and a changelog explaining all modifications.`;

    const response = await this._provider.generate(
      prompt,
      "You are a test maintenance specialist. Review tests against application changes and update them as needed. Provide clear explanations."
    );

    // Parse the response to extract updated tests
    // For now, return the original tests with the AI guidance
    return {
      updatedTests: existingTests,
      changeLog: response,
    };
  }
}

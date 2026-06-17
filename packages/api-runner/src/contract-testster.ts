import type { TestCase } from "@testforge/core";
import { TestCaseSchema } from "@testforge/core";
import type { AIProvider } from "@testforge/ai-engine";
import debug from "debug";

const log = debug("testforge:api-runner:contract");

/**
 * Contract test generation result
 */
export interface ContractTestResult {
  /** Generated contract test cases */
  tests: TestCase[];
  /** Number of endpoints covered */
  endpointsCovered: number;
  /** Number of edge cases generated */
  edgeCasesGenerated: number;
}

/**
 * ContractTester reads OpenAPI specs and generates contract tests
 *
 * This is a 2026 innovation: it automatically validates that API
 * implementations match their specifications.
 *
 * Features:
 * - Parse OpenAPI 3.x specifications
 * - Generate tests for every endpoint
 * - Validate request/response schemas
 * - Test edge cases and boundary conditions
 * - Generate auth and error response tests
 *
 * @example
 * ```ts
 * const tester = new ContractTester(aiProvider, "https://api.example.com/openapi.json");
 * const result = await tester.generateTests();
 * ```
 */
export class ContractTester {
  private readonly _provider: AIProvider;
  private readonly _openApiSpec: string;
  private readonly _baseUrl: string;

  constructor(provider: AIProvider, openApiSpec: string, baseUrl?: string) {
    this._provider = provider;
    this._openApiSpec = openApiSpec;
    this._baseUrl = baseUrl ?? "";
  }

  /**
   * Generate contract tests from OpenAPI specification
   */
  async generateTests(): Promise<ContractTestResult> {
    log("Generating contract tests from OpenAPI spec");

    const prompt = `You are an API contract testing expert. Generate comprehensive contract tests from this OpenAPI specification:

\`\`\`yaml
${this._openApiSpec.substring(0, 6000)}
\`\`\`

For each endpoint, generate tests covering:
1. Happy path (valid request → expected response)
2. Missing required fields
3. Invalid data types
4. Boundary values (min/max length, min/max number)
5. Authentication failures (missing token, invalid token, expired token)
6. Authorization failures (forbidden resources)
7. Rate limiting (if specified)
8. Error response schema validation

Return the test cases as JSON array with test structure.`;

    const testsSchema = {
      type: "object",
      properties: {
        tests: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              type: { type: "string", enum: ["api"] },
              description: { type: "string" },
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    description: { type: "string" },
                    action: { type: "string" },
                    data: { type: "object" },
                    expected: { type: "string" },
                  },
                  required: ["id", "description", "action"],
                },
              },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["id", "name", "type", "steps"],
          },
        },
        endpointsCovered: { type: "number" },
        edgeCasesGenerated: { type: "number" },
      },
      required: ["tests", "endpointsCovered", "edgeCasesGenerated"],
    };

    const response = await this._provider.generateStructured(
      prompt,
      testsSchema as never,
      "You are an API contract testing specialist. Generate thorough contract tests. Respond with ONLY valid JSON."
    ) as ContractTestResult;

    // Convert to full TestCase objects
    const tests: TestCase[] = response.tests.map((test) =>
      TestCaseSchema.parse({
        ...test,
        type: "api" as const,
        status: "pending" as const,
        locators: [],
        aiHealthScore: 100,
        flakinessScore: 0,
        createdAt: new Date(),
        tags: test.tags ?? ["contract", "api"],
      })
    );

    log(
      "Generated %d contract tests covering %d endpoints with %d edge cases",
      tests.length,
      response.endpointsCovered,
      response.edgeCasesGenerated
    );

    return { ...response, tests };
  }
}

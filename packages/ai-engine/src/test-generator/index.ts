import { z } from "zod";
import type { AIProvider } from "../providers/types.js";
import type { TestCase } from "@testforge/core";
import { TestCaseSchema } from "@testforge/core";
import debug from "debug";

const log = debug("testforge:ai:test-generator");

/**
 * Input for test generation
 */
export interface TestGeneratorInput {
  /** URL to crawl for web test generation */
  url?: string;
  /** Screenshot buffer for visual test generation */
  screenshot?: Buffer;
  /** OpenAPI/Swagger specification for API test generation */
  openApiSpec?: string;
  /** Natural language description of tests to generate */
  naturalLanguage?: string;
  /** Arabic language input (translated before generation) */
  arabicText?: string;
  /** Postman collection export for API test generation */
  postmanCollection?: string;
}

/**
 * Output from test generation
 */
export interface TestGeneratorOutput {
  /** Generated test cases */
  tests: TestCase[];
  /** Generated Page Object class contents */
  pageObjects: string[];
  /** AI confidence score in the generation (0-100) */
  confidence: number;
}

/**
 * Zod schema for test generation output validation
 */
const TestGenerationOutputSchema = z.object({
  tests: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(["web", "mobile", "api", "visual"]),
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
      description: z.string().optional(),
    })
  ),
  pageObjects: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100),
});

/**
 * TestGenerator uses AI to automatically generate test cases
 *
 * Supported input modes:
 * - URL crawling: extracts DOM structure and interactive elements
 * - Screenshot analysis: generates tests from visual layout
 * - OpenAPI spec: generates API test suites from specifications
 * - Natural language: converts descriptions to executable tests
 * - Arabic text: translates intent then generates tests
 * - Postman collection: imports and enhances existing API tests
 *
 * @example
 * ```ts
 * const generator = new TestGenerator(aiProvider);
 * const result = await generator.generate({
 *   url: "https://example.com/login",
 * });
 * ```
 */
export class TestGenerator {
  private readonly _provider: AIProvider;

  constructor(provider: AIProvider) {
    this._provider = provider;
  }

  /**
   * Generate test cases from various input sources
   *
   * @param input - Generation input configuration
   * @returns Generated tests with page objects and confidence score
   */
  async generate(input: TestGeneratorInput): Promise<TestGeneratorOutput> {
    log("Starting test generation with input: %O", Object.keys(input));

    if (input.url) {
      return this._generateFromUrl(input.url);
    }

    if (input.screenshot) {
      return this._generateFromScreenshot(input.screenshot);
    }

    if (input.openApiSpec) {
      return this._generateFromOpenApiSpec(input.openApiSpec);
    }

    if (input.postmanCollection) {
      return this._generateFromPostmanCollection(input.postmanCollection);
    }

    if (input.arabicText) {
      return this._generateFromArabicText(input.arabicText);
    }

    if (input.naturalLanguage) {
      return this._generateFromNaturalLanguage(input.naturalLanguage);
    }

    throw new Error(
      "No valid input provided. Specify one of: url, screenshot, openApiSpec, postmanCollection, arabicText, naturalLanguage"
    );
  }

  /**
   * Generate tests by crawling a URL with Playwright-like instructions
   */
  private async _generateFromUrl(url: string): Promise<TestGeneratorOutput> {
    log("Generating tests from URL: %s", url);

    const prompt = `You are an expert test automation engineer. Generate comprehensive Playwright test cases for the web application at ${url}.

Analyze the typical structure of such applications and generate:
1. Login/authentication tests
2. Navigation tests  
3. Form interaction tests
4. Error handling tests
5. Edge case tests

For each test, provide:
- Clear step-by-step actions
- Appropriate assertions
- Page Object Model classes

Return the result as valid JSON matching this structure:
{
  "tests": [
    {
      "id": "test-001",
      "name": "User can login successfully",
      "type": "web",
      "steps": [
        {
          "id": "step-1",
          "description": "Navigate to login page",
          "action": "navigate",
          "data": { "url": "${url}" },
          "expected": "Login page is displayed"
        }
      ],
      "tags": ["smoke", "auth"],
      "description": "Verify valid user can login"
    }
  ],
  "pageObjects": ["export class LoginPage { ... }"],
  "confidence": 85
}`;

    const systemPrompt = `You are a senior QA engineer specializing in Playwright test automation. 
You excel at creating robust, maintainable test suites using Page Object Model pattern.
Always generate practical, realistic tests that cover happy paths and edge cases.
Respond with ONLY valid JSON, no markdown blocks or additional text.`;

    const response = await this._provider.generateStructured(
      prompt,
      TestGenerationOutputSchema,
      systemPrompt
    );

    // Convert raw test data to full TestCase objects
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
      "Generated %d tests from URL, confidence: %d%%",
      tests.length,
      response.confidence
    );

    return {
      tests,
      pageObjects: response.pageObjects ?? [],
      confidence: response.confidence,
    };
  }

  /**
   * Generate tests from a screenshot using AI vision
   */
  private async _generateFromScreenshot(
    screenshot: Buffer
  ): Promise<TestGeneratorOutput> {
    log("Generating tests from screenshot");

    const visionPrompt = `Analyze this application screenshot and generate comprehensive test cases.

Identify:
1. All interactive elements (buttons, links, form fields)
2. Navigation structure
3. Key UI components and layouts
4. Data entry points
5. Call-to-action elements

Generate test cases covering:
- Primary user flows
- Form validation scenarios
- Navigation paths
- Error states

Return as JSON with test steps and page object descriptions.`;

    const visionResponse = await this._provider.vision(screenshot, visionPrompt);

    // Use the vision analysis to generate structured tests
    const prompt = `Based on this analysis of an application screenshot, generate structured test cases:

${visionResponse}

Return the result as valid JSON matching the test generation schema.`;

    const response = await this._provider.generateStructured(
      prompt,
      TestGenerationOutputSchema,
      "You are an expert test automation engineer. Generate practical Playwright tests based on visual analysis of an application. Respond with ONLY valid JSON."
    );

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

    return {
      tests,
      pageObjects: response.pageObjects ?? [],
      confidence: response.confidence,
    };
  }

  /**
   * Generate API tests from an OpenAPI/Swagger specification
   */
  private async _generateFromOpenApiSpec(
    spec: string
  ): Promise<TestGeneratorOutput> {
    log("Generating tests from OpenAPI spec");

    const prompt = `You are an API testing expert. Generate comprehensive API test cases from this OpenAPI specification:

\`\`\`yaml
${spec.substring(0, 8000)}
\`\`\`

Generate tests covering:
1. Happy path for each endpoint (valid requests, expected responses)
2. Edge cases (missing fields, invalid types, boundary values)
3. Authentication and authorization tests
4. Error response validation (4xx, 5xx)
5. Rate limiting and pagination if applicable
6. Schema validation for request/response bodies

Return as JSON with the test structure.`;

    const response = await this._provider.generateStructured(
      prompt,
      TestGenerationOutputSchema,
      "You are a senior API test automation engineer. Generate thorough API tests covering happy paths, edge cases, and error scenarios. Respond with ONLY valid JSON."
    );

    const tests: TestCase[] = response.tests.map((test) =>
      TestCaseSchema.parse({
        ...test,
        type: "api" as const,
        status: "pending" as const,
        locators: [],
        aiHealthScore: 100,
        flakinessScore: 0,
        createdAt: new Date(),
      })
    );

    return {
      tests,
      pageObjects: response.pageObjects ?? [],
      confidence: response.confidence,
    };
  }

  /**
   * Generate tests from a Postman collection export
   */
  private async _generateFromPostmanCollection(
    collection: string
  ): Promise<TestGeneratorOutput> {
    log("Generating tests from Postman collection");

    const prompt = `Convert this Postman collection export into comprehensive API test cases:

\`\`\`json
${collection.substring(0, 8000)}
\`\`\`

For each request in the collection:
1. Generate assertion-based test cases
2. Add negative test cases (invalid inputs, auth failures)
3. Add edge case tests
4. Include data validation tests

Return as JSON with structured test cases.`;

    const response = await this._provider.generateStructured(
      prompt,
      TestGenerationOutputSchema,
      "You are an API testing specialist. Convert Postman collections into robust, assertion-rich test suites. Respond with ONLY valid JSON."
    );

    const tests: TestCase[] = response.tests.map((test) =>
      TestCaseSchema.parse({
        ...test,
        type: "api" as const,
        status: "pending" as const,
        locators: [],
        aiHealthScore: 100,
        flakinessScore: 0,
        createdAt: new Date(),
      })
    );

    return {
      tests,
      pageObjects: response.pageObjects ?? [],
      confidence: response.confidence,
    };
  }

  /**
   * Generate tests from Arabic text by translating intent first
   */
  private async _generateFromArabicText(
    arabicText: string
  ): Promise<TestGeneratorOutput> {
    log("Generating tests from Arabic text");

    // Step 1: Translate Arabic intent to English
    const translatePrompt = `Translate the following Arabic testing requirements into clear English technical specifications:

${arabicText}

Provide a detailed English description of what tests should be created.`;

    const englishDescription = await this._provider.generate(
      translatePrompt,
      "You are a technical translator specializing in QA requirements. Translate Arabic testing requirements into precise English technical specifications."
    );

    // Step 2: Generate tests from the English description
    return this._generateFromNaturalLanguage(englishDescription);
  }

  /**
   * Generate tests from natural language description
   */
  private async _generateFromNaturalLanguage(
    description: string
  ): Promise<TestGeneratorOutput> {
    log("Generating tests from natural language: %s", description.substring(0, 50));

    const prompt = `Generate comprehensive Playwright test cases based on this description:

"${description}"

Create practical, executable tests that cover:
1. Main user flows described
2. Implicit requirements and edge cases
3. Error handling scenarios
4. Data validation tests

Return as JSON with detailed test steps and page objects.`;

    const response = await this._provider.generateStructured(
      prompt,
      TestGenerationOutputSchema,
      "You are an expert test automation engineer. Convert natural language requirements into practical Playwright test cases. Respond with ONLY valid JSON."
    );

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

    return {
      tests,
      pageObjects: response.pageObjects ?? [],
      confidence: response.confidence,
    };
  }
}

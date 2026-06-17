import { z } from "zod";
import type { AIProvider } from "../providers/types.js";
import type { TestCase } from "@testforge/core";
import { TestCaseSchema } from "@testforge/core";
import { ConfidentialClientApplication, type Configuration as MsalConfig } from "@azure/msal-node";
import axios from "axios";
import debug from "debug";

const log = debug("testforge:ai:d365-generator");

/**
 * Dataverse connection configuration (duplicated from d365-runner
 * to avoid circular workspace dependency).
 */
export interface D365GeneratorConfig {
  /** Dataverse organization URL */
  orgUrl: string;
  /** Azure AD tenant ID */
  tenantId: string;
  /** Azure AD application client ID */
  clientId: string;
  /** Azure AD application client secret */
  clientSecret: string;
  /** Dataverse API version (default: 9.2) */
  apiVersion?: string;
}

/**
 * Options for test generation
 */
export interface D365GeneratorOptions {
  /** Entity logical names to generate tests for (e.g. ["account", "lead"]) */
  entities?: string[];
  /** Natural language description (e.g. "test the lead qualification process") */
  naturalLanguage?: string;
}

/**
 * Metadata about a Dataverse entity
 */
export interface EntityMetadata {
  logicalName: string;
  displayName: string;
  primaryIdField: string;
  primaryNameField: string;
  fields: FieldMetadata[];
  relationships: RelationshipMetadata[];
}

/**
 * Metadata about a Dataverse field
 */
export interface FieldMetadata {
  logicalName: string;
  displayName: string;
  fieldType: string;
  maxLength?: number;
  isRequired: boolean;
  isLookup: boolean;
  lookupTargets?: string[];
  optionSetValues?: Array<{ value: number; label: string }>;
}

/**
 * Metadata about a Dataverse relationship
 */
export interface RelationshipMetadata {
  schemaName: string;
  relatedEntity: string;
  relationshipType: "one-to-many" | "many-to-one" | "many-to-many";
}

/**
 * Zod schema for D365 test generation output
 */
const D365TestOutputSchema = z.object({
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
  confidence: z.number().min(0).max(100),
});

/**
 * D365TestGenerator fetches Dataverse metadata and uses AI to generate
 * comprehensive test cases for Dynamics 365 entities.
 *
 * Generates 4 test categories per entity:
 * - CRUD tests (create, read, update, delete)
 * - Field validation tests (required, max length, format)
 * - Relationship/lookup tests
 * - Business rule tests (field dependencies, auto-numbering)
 *
 * Also accepts natural language descriptions to generate targeted tests
 * (e.g. "test the lead qualification process in Arabic").
 *
 * @example
 * ```ts
 * const generator = new D365TestGenerator(claudeProvider, {
 *   orgUrl: "https://myorg.crm.dynamics.com",
 *   tenantId: "...",
 *   clientId: "...",
 *   clientSecret: "...",
 * });
 *
 * const tests = await generator.generateTests({
 *   entities: ["lead", "opportunity"],
 * });
 * ```
 */
export class D365TestGenerator {
  private readonly _provider: AIProvider;
  private readonly _config: D365GeneratorConfig;
  private readonly _msalApp: ConfidentialClientApplication;
  private readonly _apiVersion: string;
  private _token: string | null = null;
  private _tokenExpiry: Date | null = null;

  constructor(provider: AIProvider, config: D365GeneratorConfig) {
    this._provider = provider;
    this._config = config;
    this._apiVersion = config.apiVersion ?? "9.2";

    const msalConfig: MsalConfig = {
      auth: {
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      },
    };

    this._msalApp = new ConfidentialClientApplication(msalConfig);
    log("D365TestGenerator created for: %s", config.orgUrl);
  }

  // ─── Metadata Fetching ────────────────────────────────────────────────

  /**
   * Fetch entity metadata from the Dataverse EntityDefinitions API.
   *
   * @param entityNames — Optional filter: only fetch these entities
   * @returns Array of entity metadata with fields and relationships
   */
  async fetchMetadata(entityNames?: string[]): Promise<EntityMetadata[]> {
    log("Fetching Dataverse metadata (entities: %s)", entityNames?.join(", ") ?? "all");

    const http = await this._createAxiosInstance();
    const entities: EntityMetadata[] = [];

    try {
      // Fetch entity list
      let entityUrl = `/api/data/v${this._apiVersion}/EntityDefinitions`;
      if (entityNames?.length) {
        const filter = entityNames.map((n) => `'${n}'`).join(",");
        entityUrl += `?$filter=Microsoft.Dynamics.CRM.In(PropertyName=@p1,PropertyValues=[@p2])&@p1='LogicalName'&@p2=${filter}`;
      }

      const entityResponse = await http.get<{ value: Array<Record<string, unknown>> }>(entityUrl);
      const entityList = entityResponse.data.value ?? [];

      log("Found %d entities", entityList.length);

      for (const entity of entityList) {
        const logicalName = entity.LogicalName as string;
        const displayName = (entity.DisplayName as Record<string, string>)?.UserLocalizedLabel ?? logicalName;
        const primaryIdField = entity.PrimaryIdAttribute as string;
        const primaryNameField = (entity.PrimaryNameAttribute as string) ?? "";

        // Fetch fields for this entity
        const fields = await this._fetchEntityFields(http, logicalName);

        // Fetch relationships
        const relationships = await this._fetchRelationships(http, logicalName);

        entities.push({
          logicalName,
          displayName,
          primaryIdField,
          primaryNameField,
          fields,
          relationships,
        });
      }
    } catch (error) {
      log("Metadata fetch error: %O", error);
      // Return empty array rather than crashing — allows offline/test usage
    }

    log("Fetched metadata for %d entities", entities.length);
    return entities;
  }

  /**
   * Fetch field definitions for a specific entity.
   */
  private async _fetchEntityFields(
    http: ReturnType<typeof axios.create>,
    entityName: string
  ): Promise<FieldMetadata[]> {
    try {
      const url = `/api/data/v${this._apiVersion}/EntityDefinitions(LogicalName='${entityName}')/Attributes`;
      const response = await http.get<{ value: Array<Record<string, unknown>> }>(url);
      const attributes = response.data.value ?? [];

      return attributes
        .filter((attr) => (attr.IsCustomizable as Record<string, boolean>)?.Value !== false || (attr.IsLogical as boolean) === false)
        .map((attr) => {
          const fieldType = attr.AttributeType as string;
          const maxLength = (attr.MaxLength as number) ?? undefined;
          const isRequired = (attr.RequiredLevel as Record<string, string>)?.Value === "ApplicationRequired";
          const isLookup = fieldType === "Lookup" || fieldType === "Customer" || fieldType === "Owner";
          const lookupTargets = attr.Targets as string[] | undefined;

          return {
            logicalName: attr.LogicalName as string,
            displayName: (attr.DisplayName as Record<string, string>)?.UserLocalizedLabel ?? (attr.LogicalName as string),
            fieldType,
            maxLength,
            isRequired,
            isLookup,
            lookupTargets: lookupTargets ?? undefined,
          };
        });
    } catch (error) {
      log("Field fetch error for %s: %O", entityName, error);
      return [];
    }
  }

  /**
   * Fetch relationships for a specific entity.
   */
  private async _fetchRelationships(
    http: ReturnType<typeof axios.create>,
    entityName: string
  ): Promise<RelationshipMetadata[]> {
    try {
      const url = `/api/data/v${this._apiVersion}/EntityDefinitions(LogicalName='${entityName}')/OneToManyRelationships`;
      const response = await http.get<{ value: Array<Record<string, unknown>> }>(url);
      const rels = response.data.value ?? [];

      return rels.map((rel) => ({
        schemaName: rel.SchemaName as string,
        relatedEntity: (rel.ReferencingEntity as string) ?? (rel.ReferencedEntity as string) ?? "",
        relationshipType: "one-to-many" as const,
      }));
    } catch {
      return [];
    }
  }

  // ─── Test Generation ──────────────────────────────────────────────────

  /**
   * Generate test cases for D365 entities.
   *
   * @param options — Generation options (entities, natural language)
   * @returns Generated TestCase[] array ready for D365Runner
   */
  async generateTests(options: D365GeneratorOptions = {}): Promise<TestCase[]> {
    log("Generating D365 tests: entities=%O, nl=%s", options.entities, options.naturalLanguage?.substring(0, 50));

    // Fetch metadata for context
    const metadata = await this.fetchMetadata(options.entities);

    if (options.naturalLanguage) {
      return this._generateFromNaturalLanguage(options.naturalLanguage, metadata);
    }

    if (metadata.length === 0) {
      log("No metadata available, generating generic D365 CRUD tests");
      return this._generateGenericCRUDTests(options.entities ?? ["account"]);
    }

    return this._generateFromMetadata(metadata);
  }

  /**
   * Generate tests from Dataverse entity metadata.
   */
  private async _generateFromMetadata(metadata: EntityMetadata[]): Promise<TestCase[]> {
    const metadataSummary = this._buildMetadataSummary(metadata);

    const prompt = `You are a Dynamics 365 / Dataverse test automation expert. Generate comprehensive test cases for the following entities based on their metadata.

${metadataSummary}

Generate 4 categories of tests for EACH entity:

1. **CRUD Tests** — Create, Read, Update, Delete for each entity
   - Use d365.openForm, d365.setValue, d365.save, d365.openRecord actions
   - Include realistic sample data appropriate for each field type

2. **Field Validation Tests** — Required fields, max length, format validation
   - Test submitting without required fields
   - Test exceeding max length on string fields
   - Test invalid formats (email, phone, dates)

3. **Relationship/Lookup Tests** — Setting lookups, verifying related records
   - Test setting lookup fields with search text
   - Test verifying related entity records exist

4. **Business Rule Tests** — Field dependencies, calculated fields, auto-numbering
   - Test that changing one field affects another
   - Test auto-number generation
   - Test option set default values

Each step must use one of these actions:
- "d365.navigate" with data: { area, group, subarea }
- "d365.openForm" with data: { entity }
- "d365.openRecord" with data: { entity, id }
- "d365.setValue" with data: { field, value }
- "d365.clickField" with data: { field }
- "d365.getFieldValue" with data: { field }
- "d365.save"
- "click" with locator: { strategy: "css", value: "selector" }

Return ONLY valid JSON.`;

    const systemPrompt = `You are a senior QA engineer specializing in Microsoft Dynamics 365 CE testing.
Generate practical, realistic test cases using the D365 UCI form interaction model.
Use data-id attributes as CSS selectors when possible.
Respond with ONLY valid JSON matching the schema, no markdown.`;

    const response = await this._provider.generateStructured(
      prompt,
      D365TestOutputSchema,
      systemPrompt
    );

    const tests: TestCase[] = response.tests.map((test) =>
      TestCaseSchema.parse({
        ...test,
        status: "pending" as const,
        locators: [],
        tags: [...(test.tags ?? []), "d365", "auto-generated"],
        aiHealthScore: response.confidence,
        flakinessScore: 0,
        createdAt: new Date(),
      })
    );

    log("Generated %d D365 tests from metadata, confidence: %d%%", tests.length, response.confidence);
    return tests;
  }

  /**
   * Generate tests from natural language description with D365 context.
   */
  private async _generateFromNaturalLanguage(
    description: string,
    metadata: EntityMetadata[]
  ): Promise<TestCase[]> {
    log("Generating D365 tests from natural language: %s", description.substring(0, 80));

    const metadataContext = metadata.length > 0
      ? `\n\nAvailable entity metadata:\n${this._buildMetadataSummary(metadata)}`
      : "";

    const prompt = `Generate Dynamics 365 test cases based on this description:

"${description}"
${metadataContext}

Create practical, executable D365 UCI tests that cover:
1. The main business process described
2. Implicit requirements and edge cases
3. Data validation scenarios
4. User interaction flows through the D365 UI

Each step must use one of these actions:
- "d365.navigate" with data: { area, group, subarea }
- "d365.openForm" with data: { entity }
- "d365.openRecord" with data: { entity, id }
- "d365.setValue" with data: { field, value }
- "d365.clickField" with data: { field }
- "d365.getFieldValue" with data: { field }
- "d365.save"
- "click" with locator: { strategy: "css", value: "selector" }

Return ONLY valid JSON.`;

    const response = await this._provider.generateStructured(
      prompt,
      D365TestOutputSchema,
      "You are a Dynamics 365 test automation expert. Convert natural language requirements into practical D365 UCI test cases. Respond with ONLY valid JSON."
    );

    const tests: TestCase[] = response.tests.map((test) =>
      TestCaseSchema.parse({
        ...test,
        status: "pending" as const,
        locators: [],
        tags: [...(test.tags ?? []), "d365", "natural-language"],
        aiHealthScore: response.confidence,
        flakinessScore: 0,
        createdAt: new Date(),
      })
    );

    log("Generated %d D365 tests from NL, confidence: %d%%", tests.length, response.confidence);
    return tests;
  }

  /**
   * Generate generic CRUD tests when no metadata is available.
   */
  private async _generateGenericCRUDTests(entityNames: string[]): Promise<TestCase[]> {
    log("Generating generic CRUD tests for: %s", entityNames.join(", "));

    const prompt = `Generate generic Dynamics 365 CRUD test cases for these entities: ${entityNames.join(", ")}.

For each entity, generate:
1. Create test (open form, fill key fields, save)
2. Read test (open record, verify field values)
3. Update test (open record, change fields, save, verify)
4. Delete test (open record, delete, verify gone)

Use d365.* actions (d365.openForm, d365.setValue, d365.save, d365.openRecord).
Return ONLY valid JSON.`;

    const response = await this._provider.generateStructured(
      prompt,
      D365TestOutputSchema,
      "You are a Dynamics 365 test automation expert. Generate practical CRUD test cases. Respond with ONLY valid JSON."
    );

    return response.tests.map((test) =>
      TestCaseSchema.parse({
        ...test,
        status: "pending" as const,
        locators: [],
        tags: [...(test.tags ?? []), "d365", "crud", "generic"],
        aiHealthScore: response.confidence,
        flakinessScore: 0,
        createdAt: new Date(),
      })
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /**
   * Build a text summary of entity metadata for the AI prompt.
   */
  private _buildMetadataSummary(metadata: EntityMetadata[]): string {
    const lines: string[] = [];

    for (const entity of metadata) {
      lines.push(`## Entity: ${entity.displayName} (${entity.logicalName})`);
      lines.push(`- Primary ID: ${entity.primaryIdField}`);
      lines.push(`- Primary Name: ${entity.primaryNameField}`);

      if (entity.fields.length > 0) {
        lines.push(`\nFields:`);
        for (const field of entity.fields.slice(0, 30)) {
          const required = field.isRequired ? " (required)" : "";
          const lookup = field.isLookup ? ` → lookup to [${field.lookupTargets?.join(", ") ?? "?"}]` : "";
          const maxLen = field.maxLength ? ` (max ${field.maxLength})` : "";
          lines.push(`  - ${field.logicalName}: ${field.fieldType}${required}${maxLen}${lookup}`);
        }
      }

      if (entity.relationships.length > 0) {
        lines.push(`\nRelationships:`);
        for (const rel of entity.relationships.slice(0, 10)) {
          lines.push(`  - ${rel.schemaName}: ${rel.relationshipType} → ${rel.relatedEntity}`);
        }
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Create an authenticated axios instance for Dataverse API calls.
   */
  private async _createAxiosInstance() {
    await this._ensureToken();

    return axios.create({
      baseURL: this._config.orgUrl,
      headers: {
        Authorization: `Bearer ${this._token}`,
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
      },
    });
  }

  /**
   * Ensure we have a valid access token.
   */
  private async _ensureToken(): Promise<void> {
    if (this._token && this._tokenExpiry && this._tokenExpiry > new Date(Date.now() + 300_000)) {
      return;
    }

    const scope = `${this._config.orgUrl}/.default`;
    const result = await this._msalApp.acquireTokenByClientCredential({ scopes: [scope] });

    if (!result?.accessToken) {
      throw new Error("Failed to acquire Dataverse access token for D365TestGenerator");
    }

    this._token = result.accessToken;
    this._tokenExpiry = result.expiresOn ?? new Date(Date.now() + 3600_000);
    log("Token acquired, expires: %s", this._tokenExpiry.toISOString());
  }
}

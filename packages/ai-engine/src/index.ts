/**
 * @testforge/ai-engine
 *
 * AI engine for TestForge — all AI-powered features including
 * test generation, self-healing, failure analysis, autonomous agents,
 * visual regression, accessibility testing, and compliance auditing.
 *
 * @packageDocumentation
 */

export {
  ProviderFactory,
  ClaudeProvider,
  OllamaProvider,
  DEFAULT_RETRY_CONFIG,
} from "./providers/index.js";
export type {
  AIProvider,
  TokenUsage,
  RetryConfig,
  ClaudeConfig,
  OllamaConfig,
  ProviderFactoryConfig,
  ProviderType,
} from "./providers/index.js";

export { TestGenerator } from "./test-generator/index.js";
export type {
  TestGeneratorInput,
  TestGeneratorOutput,
} from "./test-generator/index.js";

export { SelfHealer } from "./self-healer/index.js";
export type {
  SelfHealerInput,
  SelfHealerOutput,
  SelfHealerStats,
} from "./self-healer/index.js";

export { FailureAnalyzer } from "./failure-analyzer/index.js";
export type {
  FailureAnalyzerInput,
  FailureAnalyzerOutput,
  FailureCategory,
  NetworkEntry,
} from "./failure-analyzer/index.js";

export { IntentEngine } from "./intent-engine/index.js";
export type {
  IntentEngineInput,
  IntentEngineOutput,
} from "./intent-engine/index.js";

export { AutonomousAgent } from "./autonomous-agent/index.js";
export type {
  AutonomousAgentInput,
  AutonomousAgentOutput,
  Bug,
  CoverageNode,
} from "./autonomous-agent/index.js";

export { VisualDNA } from "./visual-dna/index.js";
export type {
  VisualDNAOutput,
  VisualDiff,
  VisualDiffSeverity,
  ComponentNode,
  PixelDiffResult,
  PixelDiffOptions,
} from "./visual-dna/index.js";

export { AccessibilityAgent } from "./accessibility/index.js";
export type {
  A11yStandard,
  A11yViolation,
  AccessibilityOutput,
} from "./accessibility/index.js";

export { TestDataGenerator, DataPreset, ArabicTestDataPresets, generateFromPreset, maskSensitiveFields } from "./data-generator/index.js";
export type {
  TestDataGeneratorInput,
  FieldDef,
  FieldType,
  Locale,
} from "./data-generator/index.js";

export { CompliancePack, FRAMEWORKS } from "./compliance/index.js";
export type {
  ComplianceFramework,
  FrameworkInfo,
  ControlCoverage,
  ComplianceOutput,
} from "./compliance/index.js";

export { D365TestGenerator } from "./d365-generator/index.js";
export type {
  D365GeneratorConfig,
  D365GeneratorOptions,
  EntityMetadata,
  FieldMetadata,
  RelationshipMetadata,
} from "./d365-generator/index.js";

export {
  D365LocatorHealer,
  DEFAULT_D365_HEALER_CONFIG,
} from "./d365-healer/index.js";
export type {
  D365HealerConfig,
  D365FallbackResult,
} from "./d365-healer/index.js";

export { ArabicNLParser, RTLLocatorStrategy } from "./arabic-nlp/index.js";
export type { ArabicIntent } from "./arabic-nlp/index.js";

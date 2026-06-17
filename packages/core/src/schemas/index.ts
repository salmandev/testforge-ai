export {
  LocatorSchema,
  LocatorStrategySchema,
} from "./locator.js";
export type { Locator, LocatorStrategy } from "./locator.js";

export {
  TestCaseSchema,
  TestStepSchema,
  TestStatusSchema,
  TestTypeSchema,
} from "./test-case.js";
export type {
  TestCase,
  TestStatus,
  TestStep,
  TestType,
} from "./test-case.js";

export {
  TestSuiteSchema,
  EnvironmentSchema,
  TestRunSchema,
  TestResultSchema,
  StepResultSchema,
} from "./test-suite.js";
export type {
  TestSuite,
  Environment,
  TestRun,
  TestResult,
  StepResult,
} from "./test-suite.js";

export {
  ProjectSchema,
  IntegrationConfigSchema,
  EEFeatureSchema,
} from "./project.js";
export type {
  Project,
  IntegrationConfig,
  EEFeature,
} from "./project.js";

export {
  ComplianceFindingSchema,
  ComplianceReportSchema,
  ComplianceEvidenceSchema,
  ControlStatusSchema,
  RiskRatingSchema,
} from "./compliance.js";
export type {
  ComplianceFinding,
  ComplianceReport,
  ComplianceEvidence,
  ControlStatus,
  RiskRating,
} from "./compliance.js";

/**
 * @testforge/d365-runner
 *
 * Dynamics 365 UCI-aware test runner with Dataverse API client.
 * Extends @testforge/web-runner with D365-specific form, field,
 * and navigation helpers.
 *
 * @packageDocumentation
 */

export { D365Runner } from "./d365-runner.js";
export { DataverseClient } from "./dataverse-client.js";
export { D365ScenarioLibrary } from "./scenarios.js";

export type {
  D365RunnerConfig,
  DataverseClientConfig,
  DataverseQueryOptions,
  DataverseRecord,
  ActionParams,
  FlowTriggerParams,
  D365NavigationTarget,
  D365FieldValue,
  D365FormResult,
  D365EntityInfo,
} from "./types.js";

export { DEFAULT_D365_CONFIG } from "./types.js";

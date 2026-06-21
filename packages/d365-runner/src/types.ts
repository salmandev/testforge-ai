import type { PlaywrightRunnerConfig } from "@testforge/web-runner";

/**
 * Configuration for the D365 UCI runner
 */
export interface D365RunnerConfig extends PlaywrightRunnerConfig {
  /** D365 organization URL (e.g. https://org.crm.dynamics.com) */
  orgUrl: string;
  /** D365 app name or URL to navigate to */
  appName?: string;
  /** Default timeout for D365-specific waits (form load, save, etc.) */
  d365Timeout: number;
  /** Whether to wait for the UCI loading overlay to disappear after actions */
  waitForUciOverlay: boolean;
}

/**
 * Default D365 runner configuration
 */
export const DEFAULT_D365_CONFIG: D365RunnerConfig = {
  orgUrl: "",
  browser: "chromium",
  headed: false,
  videoRecording: false,
  traceRecording: false,
  screenshotMode: "on-failure",
  defaultTimeout: 30000,
  d365Timeout: 60000,
  waitForUciOverlay: true,
  mobile: false,
  retries: 0,
  parallel: 1,
};

/**
 * Configuration for the Dataverse API client
 */
export interface DataverseClientConfig {
  /** D365 / Dataverse organization URL */
  orgUrl: string;
  /** Azure AD tenant ID */
  tenantId: string;
  /** Azure AD application (client) ID */
  clientId: string;
  /** Azure AD application client secret */
  clientSecret: string;
  /** Dataverse API version (default: 9.2) */
  apiVersion?: string;
  /** Additional request headers */
  headers?: Record<string, string>;
}

/**
 * Options for querying Dataverse records
 */
export interface DataverseQueryOptions {
  /** $select — comma-separated field names */
  select?: string[];
  /** $filter — OData filter expression */
  filter?: string;
  /** $orderby — comma-separated field names with asc/desc */
  orderBy?: string[];
  /** $top — max records to return */
  top?: number;
  /** $expand — related entity expansion */
  expand?: string[];
  /** FetchXML query string (overrides OData params) */
  fetchXml?: string;
}

/**
 * A generic Dataverse record
 */
export interface DataverseRecord {
  /** Record GUID */
  id?: string;
  /** Entity logical name */
  entityName?: string;
  /** Record fields */
  [key: string]: unknown;
}

/**
 * Parameters for executing a Dataverse bound/unbound action
 */
export interface ActionParams {
  /** Target entity ID (for bound actions) */
  entityId?: string;
  /** Target entity logical name (for bound actions) */
  entityName?: string;
  /** Action input parameters */
  parameters?: Record<string, unknown>;
}

/**
 * Parameters for triggering a Power Automate flow
 */
export interface FlowTriggerParams {
  /** Flow ID (GUID) */
  flowId: string;
  /** Trigger body payload */
  triggerBody?: Record<string, unknown>;
}

/**
 * D365 navigation area/group/subarea structure
 */
export interface D365NavigationTarget {
  /** Area name (e.g. "Sales", "Service", "Settings") */
  area: string;
  /** Group name within the area (e.g. "Customers", "My Work") */
  group: string;
  /** Subarea name (e.g. "Accounts", "Contacts", "Cases") */
  subarea: string;
}

/**
 * D365 field value types
 */
export type D365FieldValue = string | number | boolean | Date | null;

/**
 * Result of a D365 form operation
 */
export interface D365FormResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Duration of the operation in ms */
  duration: number;
}

/**
 * D365 entity metadata (lightweight)
 */
export interface D365EntityInfo {
  /** Logical name of the entity */
  logicalName: string;
  /** Display name */
  displayName?: string;
  /** Primary ID field (usually <entity>id) */
  primaryIdField: string;
  /** Primary name field */
  primaryNameField?: string;
}

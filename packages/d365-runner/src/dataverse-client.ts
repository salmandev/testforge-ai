import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { ConfidentialClientApplication, type Configuration as MsalConfig } from "@azure/msal-node";
import debug from "debug";
import type {
  DataverseClientConfig,
  DataverseQueryOptions,
  DataverseRecord,
  ActionParams,
} from "./types.js";

const log = debug("testforge:d365-runner:dataverse");

/**
 * Dataverse Web API client with Azure AD (MSAL) authentication.
 *
 * Provides CRUD operations, action execution, and Power Automate flow
 * triggering against Microsoft Dataverse / Dynamics 365.
 *
 * @example
 * ```ts
 * const client = new DataverseClient({
 *   orgUrl: "https://myorg.api.crm.dynamics.com",
 *   tenantId: "abc-def-...",
 *   clientId: "app-id-...",
 *   clientSecret: "secret-...",
 * });
 *
 * const accounts = await client.getRecords("accounts", {
 *   select: ["name", "revenue"],
 *   filter: "revenue gt 1000000",
 *   top: 50,
 * });
 *
 * const newLead = await client.createRecord("leads", {
 *   firstname: "Jane",
 *   lastname: "Doe",
 *   companyname: "Contoso",
 * });
 * ```
 */
export class DataverseClient {
  private readonly _config: DataverseClientConfig;
  private readonly _msalApp: ConfidentialClientApplication;
  private readonly _apiVersion: string;
  private _axios: AxiosInstance | null = null;
  private _tokenExpiry: Date | null = null;

  constructor(config: DataverseClientConfig) {
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
    log("DataverseClient created for: %s (API v%s)", config.orgUrl, this._apiVersion);
  }

  // ─── Authentication ───────────────────────────────────────────────────

  /**
   * Acquire an access token via MSAL client credentials flow.
   * Caches the token and refreshes when close to expiry.
   */
  async getToken(): Promise<string> {
    // Return cached token if still valid (with 5-minute buffer)
    if (this._tokenExpiry && this._tokenExpiry > new Date(Date.now() + 300_000)) {
      const cached = this._axios?.defaults.headers.common["Authorization"] as string | undefined;
      if (cached) {
        return cached.replace("Bearer ", "");
      }
    }

    log("Acquiring new access token");
    const scope = `${this._config.orgUrl}/.default`;

    const result = await this._msalApp.acquireTokenByClientCredential({
      scopes: [scope],
    });

    if (!result?.accessToken) {
      throw new Error("Failed to acquire Dataverse access token");
    }

    const expiry = result.expiresOn ?? new Date(Date.now() + 3600_000);
    this._tokenExpiry = expiry;
    const token = result.accessToken;

    // Create or update the axios instance
    this._axios = axios.create({
      baseURL: `${this._config.orgUrl}/api/data/v${this._apiVersion}/`,
      headers: {
        Authorization: `Bearer ${token}`,
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
        Accept: "application/json",
        Prefer: "odata.include-annotations=OData.Community.Display.V1.FormattedValue",
        ...this._config.headers,
      },
    });

    log("Token acquired, expires: %s", this._tokenExpiry.toISOString());
    return token;
  }

  /**
   * Ensure the axios instance has a valid token.
   */
  private async _ensureAuth(): Promise<AxiosInstance> {
    await this.getToken();
    if (!this._axios) {
      throw new Error("Axios instance not initialized after token acquisition");
    }
    return this._axios;
  }

  // ─── CRUD Operations ──────────────────────────────────────────────────

  /**
   * Retrieve records from a Dataverse entity set.
   *
   * @param entity — Entity set name (e.g. "accounts", "contacts", "leads")
   * @param options — OData query options ($select, $filter, $orderby, $top, $expand)
   *
   * @example
   * ```ts
   * const accounts = await client.getRecords("accounts", {
   *   select: ["name", "revenue"],
   *   filter: "statecode eq 0",
   *   orderBy: ["revenue desc"],
   *   top: 25,
   * });
   * ```
   */
  async getRecords(entity: string, options?: DataverseQueryOptions): Promise<DataverseRecord[]> {
    const http = await this._ensureAuth();
    log("GET %s %O", entity, options);

    const params: Record<string, string> = {};

    if (options?.fetchXml) {
      params.fetchXml = options.fetchXml;
    } else {
      if (options?.select?.length) {
        params.$select = options.select.join(",");
      }
      if (options?.filter) {
        params.$filter = options.filter;
      }
      if (options?.orderBy?.length) {
        params.$orderby = options.orderBy.join(",");
      }
      if (options?.top) {
        params.$top = String(options.top);
      }
      if (options?.expand?.length) {
        params.$expand = options.expand.join(",");
      }
    }

    const config: AxiosRequestConfig = { params };
    const response = await http.get<{ value: DataverseRecord[] }>(entity, config);

    const records = response.data.value ?? [];
    log("Retrieved %d records from %s", records.length, entity);
    return records;
  }

  /**
   * Create a new record in a Dataverse entity set.
   *
   * @param entity — Entity set name (e.g. "leads", "contacts")
   * @param data — Record data as key-value pairs
   * @returns The created record with server-generated fields (id, etc.)
   *
   * @example
   * ```ts
   * const lead = await client.createRecord("leads", {
   *   firstname: "Jane",
   *   lastname: "Doe",
   *   companyname: "Contoso",
   *   emailaddress1: "jane@contoso.com",
   * });
   * ```
   */
  async createRecord(entity: string, data: Record<string, unknown>): Promise<DataverseRecord> {
    const http = await this._ensureAuth();
    log("POST %s: %O", entity, data);

    const response = await http.post<DataverseRecord>(entity, data, {
      headers: { Prefer: "return=representation" },
    });

    const record = response.data;
    log("Created record in %s: %s", entity, record.id ?? "(no id in response)");
    return record;
  }

  /**
   * Update an existing Dataverse record.
   *
   * @param entity — Entity set name
   * @param id — Record GUID
   * @param data — Fields to update
   *
   * @example
   * ```ts
   * await client.updateRecord("accounts", "abc-123", {
   *   name: "Updated Name",
   *   revenue: 2000000,
   * });
   * ```
   */
  async updateRecord(entity: string, id: string, data: Record<string, unknown>): Promise<void> {
    const http = await this._ensureAuth();
    const recordId = this._normalizeId(id);
    log("PATCH %s(%s): %O", entity, recordId, data);

    await http.patch(`${entity}(${recordId})`, data);
    log("Updated record: %s(%s)", entity, recordId);
  }

  /**
   * Delete a Dataverse record.
   *
   * @param entity — Entity set name
   * @param id — Record GUID
   */
  async deleteRecord(entity: string, id: string): Promise<void> {
    const http = await this._ensureAuth();
    const recordId = this._normalizeId(id);
    log("DELETE %s(%s)", entity, recordId);

    await http.delete(`${entity}(${recordId})`);
    log("Deleted record: %s(%s)", entity, recordId);
  }

  // ─── Actions & Flows ──────────────────────────────────────────────────

  /**
   * Execute a Dataverse action (bound or unbound).
   *
   * @param actionName — Logical name of the action
   * @param params — Action parameters including optional entity binding
   *
   * @example
   * ```ts
   * // Unbound action
   * const result = await client.executeAction("Win opportunity", {
   *   parameters: { OpportunityClose: { "@odata.type": "#Microsoft.Dynamics.CRM.opportunityclose" } },
   * });
   *
   * // Bound action
   * await client.executeAction("Microsoft.Dynamics.CRM.QualifyLead", {
   *   entityId: "lead-guid",
   *   entityName: "leads",
   *   parameters: { CreateAccount: true, CreateContact: true },
   * });
   * ```
   */
  async executeAction(actionName: string, params?: ActionParams): Promise<Record<string, unknown>> {
    const http = await this._ensureAuth();
    log("Executing action: %s", actionName);

    let url: string;
    if (params?.entityId && params?.entityName) {
      // Bound action
      const recordId = this._normalizeId(params.entityId);
      url = `${params.entityName}(${recordId})/${actionName}`;
    } else {
      // Unbound action
      url = actionName;
    }

    const body = params?.parameters ?? {};
    const response = await http.post<Record<string, unknown>>(url, body);

    log("Action %s completed", actionName);
    return response.data ?? {};
  }

  /**
   * Trigger a Power Automate (Flow) run via the Dataverse API.
   *
   * @param flowId — The workflow/flow GUID
   * @param triggerBody — Optional payload for the flow trigger
   *
   * @example
   * ```ts
   * await client.runFlow("flow-guid-123", {
   *   entity: { contactid: "abc-123" },
   *   customParam: "value",
   * });
   * ```
   */
  async runFlow(flowId: string, triggerBody?: Record<string, unknown>): Promise<void> {
    const http = await this._ensureAuth();
    const normalizedId = this._normalizeId(flowId);
    log("Triggering flow: %s", normalizedId);

    // The Flow trigger endpoint uses the workflows entity
    const url = `workflows(${normalizedId})/Microsoft.Dynamics.CRM.startflow`;
    const body = triggerBody ? { InputParameters: JSON.stringify(triggerBody) } : {};

    await http.post(url, body);
    log("Flow %s triggered", normalizedId);
  }

  // ─── Utilities ────────────────────────────────────────────────────────

  /**
   * Get a single record by ID.
   */
  async getRecord(entity: string, id: string, select?: string[]): Promise<DataverseRecord | null> {
    const http = await this._ensureAuth();
    const recordId = this._normalizeId(id);
    log("GET %s(%s)", entity, recordId);

    const params: Record<string, string> = {};
    if (select?.length) {
      params.$select = select.join(",");
    }

    try {
      const response = await http.get<DataverseRecord>(`${entity}(${recordId})`, { params });
      return response.data;
    } catch {
      log("Record not found: %s(%s)", entity, recordId);
      return null;
    }
  }

  /**
   * Count records matching a filter.
   */
  async countRecords(entity: string, filter?: string): Promise<number> {
    const http = await this._ensureAuth();
    log("COUNT %s (filter: %s)", entity, filter ?? "none");

    const params: Record<string, string> = { $count: "true" };
    if (filter) {
      params.$filter = filter;
    }

    const response = await http.get<{ "@odata.count": number }>(entity, {
      params,
      headers: { Prefer: "odata.count=true" },
    });

    return response.data["@odata.count"] ?? 0;
  }

  /**
   * Normalize a GUID — strip braces if present.
   */
  private _normalizeId(id: string): string {
    return id.replace(/[{}]/g, "");
  }
}

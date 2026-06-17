import type { TestStep, Locator } from "@testforge/core";
import debug from "debug";

const log = debug("testforge:d365-runner:scenarios");

/**
 * Build a TestStep with Zod-required defaults (screenshot, timeout).
 */
function step(input: {
  id: string;
  description: string;
  action: string;
  locator?: { strategy: "css" | "xpath" | "aria" | "text" | "visual"; value: string };
  data?: unknown;
  expected?: string;
  timeout?: number;
  screenshot?: boolean;
}): TestStep {
  return {
    id: input.id,
    description: input.description,
    action: input.action,
    screenshot: input.screenshot ?? false,
    timeout: input.timeout ?? 30_000,
    ...(input.locator ? { locator: { ...input.locator, confidence: 100 } satisfies Locator } : {}),
    ...(input.data !== undefined ? { data: input.data } : {}),
    ...(input.expected !== undefined ? { expected: input.expected } : {}),
  };
}

/**
 * Pre-built D365 test scenario library.
 *
 * Each scenario method returns `TestStep[]` arrays compatible with
 * `@testforge/core` `TestCaseSchema.steps`. These can be used directly
 * with `D365Runner.executeD365Steps()` or composed into test cases.
 *
 * @example
 * ```ts
 * const scenarios = new D365ScenarioLibrary();
 *
 * // Build a full sales cycle test case
 * const steps = [
 *   ...scenarios.navigateToSales(),
 *   ...scenarios.salesCycle(),
 * ];
 *
 * const testCase: TestCase = {
 *   id: "sales-cycle-001",
 *   name: "Full Sales Cycle",
 *   type: "web",
 *   steps,
 * };
 *
 * await runner.executeD365Steps(testCase.steps);
 * ```
 */
export class D365ScenarioLibrary {
  private _stepCounter = 0;

  /**
   * Generate a unique step ID with a descriptive prefix.
   */
  private _stepId(prefix: string): string {
    this._stepCounter += 1;
    return `${prefix}-${String(this._stepCounter).padStart(3, "0")}`;
  }

  /**
   * Reset the internal step counter (useful between test cases).
   */
  reset(): void {
    this._stepCounter = 0;
  }

  // ─── Sales Cycle ──────────────────────────────────────────────────────

  /**
   * Full sales cycle: Lead capture → Qualify → Convert → Opportunity → Quote.
   *
   * Steps:
   * 1. Navigate to Sales > Leads
   * 2. Create a new lead with sample data
   * 3. Fill in lead details and save
   * 4. Qualify the lead (creates Account, Contact, Opportunity)
   * 5. Navigate to the created Opportunity
   * 6. Add opportunity details
   * 7. Create a quote from the opportunity
   */
  salesCycle(): TestStep[] {
    log("Generating salesCycle scenario steps");
    const steps: TestStep[] = [];

    // ── Step 1: Navigate to Leads ──
    steps.push(step({
      id: this._stepId("sales-nav"),
      description: "Navigate to Sales > My Work > Leads",
      action: "d365.navigate",
      data: { area: "Sales", group: "MyWork", subarea: "Leads" },
      timeout: 60_000,
    }));

    // ── Step 2: Open new Lead form ──
    steps.push(step({
      id: this._stepId("sales-open-form"),
      description: "Open new Lead form",
      action: "d365.openForm",
      data: { entity: "lead" },
      timeout: 60_000,
    }));

    // ── Step 3: Fill lead fields ──
    const leadFields: Array<{ field: string; value: string }> = [
      { field: "firstname", value: "TestForge" },
      { field: "lastname", value: "SalesLead" },
      { field: "companyname", value: "TestForge Automated Corp" },
      { field: "emailaddress1", value: "sales-lead@testforge.ai" },
      { field: "telephone1", value: "+1-555-0199" },
      { field: "jobtitle", value: "VP of Engineering" },
      { field: "revenue", value: "5000000" },
      { field: "numberofemployees", value: "250" },
    ];

    for (const { field, value } of leadFields) {
      steps.push(step({
        id: this._stepId("sales-fill"),
        description: `Set lead field: ${field}`,
        action: "d365.setValue",
        data: { field, value },
      }));
    }

    // ── Step 4: Save the lead ──
    steps.push(step({
      id: this._stepId("sales-save"),
      description: "Save the new lead record",
      action: "d365.save",
      timeout: 60_000,
    }));

    // ── Step 5: Qualify the lead ──
    steps.push(step({
      id: this._stepId("sales-qualify"),
      description: "Click Qualify button to convert lead",
      action: "click",
      locator: {
        strategy: "css",
        value: 'button[data-id="lead|NoRelationship|Form|Mscrm.Form.lead.QualifyLead"], button[aria-label="Qualify"]',
      },
      timeout: 60_000,
    }));

    // Wait for the qualification dialog to process
    steps.push(step({
      id: this._stepId("sales-qualify-confirm"),
      description: "Confirm qualification dialog",
      action: "click",
      locator: {
        strategy: "css",
        value: 'button[data-id="OK_ID"], button[aria-label="OK"]',
      },
    }));

    // ── Step 6: Navigate to Opportunities ──
    steps.push(step({
      id: this._stepId("sales-nav-opp"),
      description: "Navigate to Sales > My Work > Opportunities",
      action: "d365.navigate",
      data: { area: "Sales", group: "MyWork", subarea: "Opportunities" },
      timeout: 60_000,
    }));

    // ── Step 7: Open the first opportunity (created from lead) ──
    steps.push(step({
      id: this._stepId("sales-open-opp"),
      description: "Open the first opportunity in the grid",
      action: "click",
      locator: {
        strategy: "css",
        value: 'div[data-id="entity_control-pcf_grid_control_container"] .ag-row-first a',
      },
    }));

    // ── Step 8: Fill opportunity details ──
    steps.push(step({
      id: this._stepId("sales-opp-revenue"),
      description: "Set estimated revenue on opportunity",
      action: "d365.setValue",
      data: { field: "estimatedvalue", value: "500000" },
    }));

    steps.push(step({
      id: this._stepId("sales-opp-close"),
      description: "Set estimated close date",
      action: "d365.setValue",
      data: { field: "estimatedclosedate", value: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
    }));

    steps.push(step({
      id: this._stepId("sales-opp-save"),
      description: "Save opportunity changes",
      action: "d365.save",
      timeout: 60_000,
    }));

    // ── Step 9: Create Quote ──
    steps.push(step({
      id: this._stepId("sales-create-quote"),
      description: "Click Create Quote from the opportunity",
      action: "click",
      locator: {
        strategy: "css",
        value: 'button[aria-label="Create Quote"], button[data-id*="CreateQuote"]',
      },
      timeout: 60_000,
    }));

    steps.push(step({
      id: this._stepId("sales-quote-save"),
      description: "Save the quote",
      action: "d365.save",
      timeout: 60_000,
    }));

    log("Generated %d sales cycle steps", steps.length);
    return steps;
  }

  // ─── Service Cycle ────────────────────────────────────────────────────

  /**
   * Full service cycle: Case creation → Routing → Resolution → CSAT.
   *
   * Steps:
   * 1. Navigate to Service > Cases
   * 2. Create a new support case
   * 3. Fill in case details and save
   * 4. Route the case to a queue
   * 5. Resolve the case
   * 6. Fill in resolution details
   */
  serviceCycle(): TestStep[] {
    log("Generating serviceCycle scenario steps");
    const steps: TestStep[] = [];

    // ── Step 1: Navigate to Cases ──
    steps.push(step({
      id: this._stepId("svc-nav"),
      description: "Navigate to Service > My Work > Cases",
      action: "d365.navigate",
      data: { area: "Service", group: "MyWork", subarea: "Cases" },
      timeout: 60_000,
    }));

    // ── Step 2: Open new Case form ──
    steps.push(step({
      id: this._stepId("svc-open-form"),
      description: "Open new Case form",
      action: "d365.openForm",
      data: { entity: "incident" },
      timeout: 60_000,
    }));

    // ── Step 3: Fill case fields ──
    const caseFields: Array<{ field: string; value: string }> = [
      { field: "title", value: "TestForge: Unable to access dashboard after update" },
      { field: "description", value: "User reports that the main dashboard fails to load after the latest platform update. Error code: 0x80040216." },
      { field: "emailaddress", value: "support-request@testforge.ai" },
    ];

    for (const { field, value } of caseFields) {
      steps.push(step({
        id: this._stepId("svc-fill"),
        description: `Set case field: ${field}`,
        action: "d365.setValue",
        data: { field, value },
      }));
    }

    // Set priority
    steps.push(step({
      id: this._stepId("svc-priority"),
      description: "Set case priority to High",
      action: "d365.setValue",
      data: { field: "prioritycode", value: "2" },
    }));

    // ── Step 4: Save the case ──
    steps.push(step({
      id: this._stepId("svc-save"),
      description: "Save the new case record",
      action: "d365.save",
      timeout: 60_000,
    }));

    // ── Step 5: Route case to a queue ──
    steps.push(step({
      id: this._stepId("svc-route-click"),
      description: "Click Assign / Route button",
      action: "click",
      locator: {
        strategy: "css",
        value: 'button[aria-label="Assign"], button[data-id*="Assign"]',
      },
    }));

    steps.push(step({
      id: this._stepId("svc-route-confirm"),
      description: "Confirm routing in the assignment dialog",
      action: "click",
      locator: {
        strategy: "css",
        value: 'button[data-id="ok_id"], button[aria-label="Assign"]',
      },
    }));

    // ── Step 6: Resolve the case ──
    steps.push(step({
      id: this._stepId("svc-resolve-click"),
      description: "Click Resolve Case button",
      action: "click",
      locator: {
        strategy: "css",
        value: 'button[aria-label="Resolve Case"], button[data-id*="ResolveCase"]',
      },
    }));

    // Fill resolution details in the dialog
    steps.push(step({
      id: this._stepId("svc-resolution-desc"),
      description: "Enter resolution description",
      action: "d365.setValue",
      data: {
        field: "description",
        value: "Resolved: Applied platform hotfix KB5001234. Dashboard access restored. Verified by user.",
      },
    }));

    steps.push(step({
      id: this._stepId("svc-resolve-confirm"),
      description: "Confirm case resolution",
      action: "click",
      locator: {
        strategy: "css",
        value: 'button[data-id="ok_id"], button[aria-label="Resolve"]',
      },
      timeout: 60_000,
    }));

    // ── Step 7: Verify case is resolved ──
    steps.push(step({
      id: this._stepId("svc-verify"),
      description: "Verify case status shows Resolved",
      action: "d365.getFieldValue",
      data: { field: "statecode" },
      expected: "1",
    }));

    log("Generated %d service cycle steps", steps.length);
    return steps;
  }

  // ─── Navigation Helpers ───────────────────────────────────────────────

  /**
   * Steps to navigate to the Sales area landing page.
   */
  navigateToSales(): TestStep[] {
    return [
      step({
        id: this._stepId("nav-sales"),
        description: "Navigate to Sales area",
        action: "d365.navigate",
        data: { area: "Sales", group: "MyWork", subarea: "SalesDashboards" },
        timeout: 60_000,
      }),
    ];
  }

  /**
   * Steps to navigate to the Service area landing page.
   */
  navigateToService(): TestStep[] {
    return [
      step({
        id: this._stepId("nav-service"),
        description: "Navigate to Service area",
        action: "d365.navigate",
        data: { area: "Service", group: "MyWork", subarea: "ServiceDashboards" },
        timeout: 60_000,
      }),
    ];
  }

  /**
   * Steps to navigate to Settings > Advanced Settings.
   */
  navigateToSettings(): TestStep[] {
    return [
      step({
        id: this._stepId("nav-settings"),
        description: "Navigate to Settings > Administration",
        action: "d365.navigate",
        data: { area: "AppSettings", group: "Settings", subarea: "AdvancedSettings" },
        timeout: 60_000,
      }),
    ];
  }
}

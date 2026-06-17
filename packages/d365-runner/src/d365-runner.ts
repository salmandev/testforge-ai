import type { TestStep } from "@testforge/core";
import type { EventBus } from "@testforge/core";
import { PlaywrightRunner } from "@testforge/web-runner";
import debug from "debug";
import type {
  D365RunnerConfig,
  D365NavigationTarget,
  D365FieldValue,
  D365FormResult,
} from "./types.js";
import { DEFAULT_D365_CONFIG } from "./types.js";

const log = debug("testforge:d365-runner");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;

/**
 * D365 UCI-aware test runner extending PlaywrightRunner.
 *
 * Provides Dynamics 365 Customer Engagement (UCI) helpers:
 * - Form navigation and record operations
 * - Field interaction using data-id / aria-label locator strategy
 * - UCI loading overlay management
 * - Area/subarea navigation via the sitemap
 *
 * @example
 * ```ts
 * const runner = new D365Runner(eventBus, {
 *   orgUrl: "https://myorg.crm.dynamics.com",
 *   browser: "chromium",
 * });
 *
 * await runner.initialize();
 * await runner.login(username, password);
 * await runner.openRecord("account", "abc-123");
 * await runner.setValue("name", "Contoso Ltd");
 * await runner.saveRecord();
 * ```
 */
export class D365Runner extends PlaywrightRunner {
  private readonly _d365Config: D365RunnerConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _page: Page = null;

  constructor(eventBus: EventBus, config?: Partial<D365RunnerConfig>) {
    super(eventBus, config);
    this._d365Config = { ...DEFAULT_D365_CONFIG, ...config };
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Initialize browser and navigate to the D365 org.
   * Returns a Playwright page for direct interaction if needed.
   */
  async initD365(): Promise<void> {
    await this.initialize();

    // We need to get a page from the browser. PlaywrightRunner manages its
    // own context/page internally in runTest, so for standalone D365 helpers
    // we create our own context + page.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const browser = (this as any)._browser as Record<string, unknown> | null;
    if (!browser) {
      throw new Error("Browser not initialized. Call initialize() first.");
    }

    const context = await (
      browser.newContext as (opts?: Record<string, unknown>) => Promise<Record<string, unknown>>
    )({
      viewport: this._d365Config.viewport ?? { width: 1440, height: 900 },
    });

    this._page = await (context.newPage as (() => Promise<Page>))();
    this._page.setDefaultTimeout(this._d365Config.d365Timeout);

    log("D365 page created, navigating to org: %s", this._d365Config.orgUrl);
    await this._page.goto(this._d365Config.orgUrl, {
      waitUntil: "domcontentloaded",
      timeout: this._d365Config.d365Timeout,
    });
  }

  /**
   * Authenticate via Azure AD login page (D365 redirect-based login).
   * Call this after initD365() if not already authenticated.
   */
  async login(username: string, password: string): Promise<void> {
    const page = this._requirePage();
    log("Logging in as: %s", username);

    // Wait for the Microsoft login page
    await page.waitForSelector("input[type='email']", { timeout: 30_000 }).catch(() => {
      log("Login form not detected — may already be authenticated");
      return;
    });

    const emailInput = page.locator("input[type='email']");
    await emailInput.fill(username);
    await page.locator("input[type='submit']").click();

    // Wait for password field
    await page.waitForSelector("input[type='password']", { timeout: 10_000 });
    const passwordInput = page.locator("input[type='password']");
    await passwordInput.fill(password);
    await page.locator("input[type='submit']").click();

    // Handle "Stay signed in?" prompt if present
    await page
      .locator("input[value='Yes'], button:has-text('Yes')")
      .click({ timeout: 10_000 })
      .catch(() => log("No 'Stay signed in' prompt"));

    // Wait for UCI app to load
    await this._waitForUciReady();
    log("Login complete");
  }

  /**
   * Close the D365 page and browser context.
   */
  async teardownD365(): Promise<void> {
    if (this._page) {
      const context = this._page.context?.();
      if (context) {
        await context.close().catch(() => undefined);
      }
      this._page = null;
    }
    await this.teardown();
  }

  // ─── Navigation ───────────────────────────────────────────────────────

  /**
   * Navigate to a D365 sitemap area → group → subarea.
   *
   * @example
   * ```ts
   * await runner.navigateToArea("Sales", "Customers", "Accounts");
   * await runner.navigateToArea("Service", "My Work", "Cases");
   * ```
   */
  async navigateToArea(area: string, group: string, subarea: string): Promise<void> {
    const page = this._requirePage();
    log("Navigating: %s > %s > %s", area, group, subarea);

    // Open the area switcher (bottom-left button in UCI)
    const areaButton = page.locator('button[data-id="sitemap-areaSwitcher-btn"]');
    await areaButton.click({ timeout: this._d365Config.d365Timeout });
    await this._waitForUciOverlay();

    // Select the area
    const areaItem = page.locator(`button[data-id="sitemap-area-${this._slugify(area)}"]`);
    await areaItem.click({ timeout: this._d365Config.d365Timeout });
    await this._waitForUciReady();

    // Expand the group if collapsed
    const groupItem = page.locator(
      `[data-id="sitemap-entity-${this._slugify(group)}"], [aria-label="${group}"]`
    );
    await groupItem.click({ timeout: this._d365Config.d365Timeout }).catch(() => {
      log("Group may already be expanded: %s", group);
    });

    // Click the subarea
    const subareaItem = page.locator(
      `[data-id="sitemap-entity-${this._slugify(subarea)}"], [aria-label="${subarea}"]`
    );
    await subareaItem.click({ timeout: this._d365Config.d365Timeout });
    await this._waitForUciReady();

    log("Navigation complete: %s > %s > %s", area, group, subarea);
  }

  /**
   * Navigate to a D365 area using a structured target object.
   */
  async navigateTo(target: D365NavigationTarget): Promise<void> {
    return this.navigateToArea(target.area, target.group, target.subarea);
  }

  // ─── Record Operations ────────────────────────────────────────────────

  /**
   * Open a specific D365 record by entity logical name and record ID.
   *
   * @example
   * ```ts
   * await runner.openRecord("account", "A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
   * ```
   */
  async openRecord(entity: string, id: string): Promise<void> {
    const page = this._requirePage();
    const url = `${this._d365Config.orgUrl}/main.aspx?etn=${entity}&id=${id}&pagetype=entityrecord`;

    log("Opening record: %s/%s", entity, id);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: this._d365Config.d365Timeout });
    await this._waitForUciReady();
    log("Record opened: %s/%s", entity, id);
  }

  /**
   * Open a new (blank) form for the given entity.
   *
   * @example
   * ```ts
   * await runner.openForm("lead");
   * ```
   */
  async openForm(entity: string): Promise<void> {
    const page = this._requirePage();
    const url = `${this._d365Config.orgUrl}/main.aspx?etn=${entity}&pagetype=entityrecord`;

    log("Opening new form: %s", entity);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: this._d365Config.d365Timeout });
    await this._waitForUciReady();
    log("Form opened: %s", entity);
  }

  /**
   * Click a field on the D365 form by its logical name.
   * Uses data-id attribute first, falls back to aria-label.
   */
  async clickField(fieldName: string): Promise<void> {
    const page = this._requirePage();
    const locator = this._fieldLocator(page, fieldName);

    log("Clicking field: %s", fieldName);
    await locator.click({ timeout: this._d365Config.d365Timeout });
    await this._waitForUciOverlay();
  }

  /**
   * Set a field value on the D365 form.
   *
   * Handles text, number, boolean (toggle), and lookup fields.
   * For lookup fields, pass the search text — the method will select
   * the first matching result from the flyout.
   *
   * @example
   * ```ts
   * await runner.setValue("name", "Contoso Ltd");
   * await runner.setValue("revenue", 1000000);
   * await runner.setValue("telephone1", "+1-555-0100");
   * await runner.setValue("parentaccountid", "Adventure");  // lookup
   * ```
   */
  async setValue(fieldName: string, value: D365FieldValue): Promise<void> {
    const page = this._requirePage();
    const fieldEl = this._fieldLocator(page, fieldName);

    log("Setting field %s = %O", fieldName, value);

    // Click the field to activate it
    await fieldEl.click({ timeout: this._d365Config.d365Timeout });
    await this._waitForUciOverlay();

    if (typeof value === "boolean") {
      // Toggle / two-option fields: check the current state
      const toggle = page.locator(
        `input[data-id="${fieldName}.fieldControl-checkbox-toggle"], ` +
        `div[data-id="${fieldName}"] input[type="checkbox"]`
      );
      const isChecked = await toggle.isChecked().catch(() => false);
      if (isChecked !== value) {
        await toggle.click();
      }
    } else if (value instanceof Date) {
      // Date fields: format and type
      const dateStr = value.toLocaleDateString("en-US");
      const input = page.locator(
        `input[data-id="${fieldName}.fieldControl-date-time-input"], ` +
        `input[data-id="${fieldName}"]`
      );
      await input.fill(dateStr);
      await page.keyboard.press("Tab");
    } else if (value === null) {
      // Clear the field
      const input = this._inputLocator(page, fieldName);
      await input.clear();
      await page.keyboard.press("Tab");
    } else {
      // Text / number fields
      const input = this._inputLocator(page, fieldName);
      await input.fill(String(value));

      // Check if this is a lookup field (has a flyout)
      const isLookup = await page
        .locator(`div[data-id="${fieldName}.fieldControl-LookupResultsDropdown_${fieldName}"]`)
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (isLookup) {
        // Wait for the flyout results and select the first one
        const firstResult = page.locator(
          `li[data-id="${fieldName}.fieldControl-LookupResultsDropdown_${fieldName}_tabRef_tab0"]`
        );
        await firstResult.click({ timeout: 5000 }).catch(() => {
          log("Lookup flyout item not found, pressing Tab to dismiss");
        });
      }

      // Tab out to commit the value
      await page.keyboard.press("Tab");
    }

    await this._waitForUciOverlay();
    log("Field %s set to %O", fieldName, value);
  }

  /**
   * Get the current value of a field on the D365 form.
   */
  async getFieldValue(fieldName: string): Promise<D365FieldValue> {
    const page = this._requirePage();

    log("Getting field value: %s", fieldName);

    // Try input field first (text/number/date)
    const input = page.locator(
      `input[data-id="${fieldName}"], ` +
      `input[data-id="${fieldName}.fieldControl-text-box-text"], ` +
      `input[data-id="${fieldName}.fieldControl-date-time-input"]`
    );

    const inputVisible = await input.first().isVisible({ timeout: 3000 }).catch(() => false);
    if (inputVisible) {
      const val = await input.first().inputValue();
      return val ?? null;
    }

    // Try a div-based read-only field
    const div = page.locator(
      `div[data-id="${fieldName}.fieldControl-text-box-text"], ` +
      `div[data-id="${fieldName}"] .pa-c-field-value`
    );

    const divVisible = await div.first().isVisible({ timeout: 3000 }).catch(() => false);
    if (divVisible) {
      const text = await div.first().textContent();
      return text?.trim() ?? null;
    }

    // Try checkbox / two-option
    const checkbox = page.locator(
      `input[data-id="${fieldName}.fieldControl-checkbox-toggle"], ` +
      `div[data-id="${fieldName}"] input[type="checkbox"]`
    );

    const checkVisible = await checkbox.first().isVisible({ timeout: 2000 }).catch(() => false);
    if (checkVisible) {
      return await checkbox.first().isChecked();
    }

    log("Could not determine value for field: %s", fieldName);
    return null;
  }

  /**
   * Save the current record and wait for the save to complete.
   */
  async saveRecord(): Promise<D365FormResult> {
    const page = this._requirePage();
    const startTime = Date.now();

    log("Saving record");

    try {
      // Click the Save button in the command bar
      const saveButton = page.locator(
        'button[data-id="edit-form-command-bar-save-btn"], ' +
        'button[aria-label="Save (CTRL+S)"]'
      );
      await saveButton.click({ timeout: this._d365Config.d365Timeout });

      await this.waitForSave();

      const duration = Date.now() - startTime;
      log("Record saved in %dms", duration);
      return { success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      log("Save failed: %s", message);
      return { success: false, error: message, duration };
    }
  }

  /**
   * Wait for the D365 save operation to complete.
   * Watches for the save overlay / spinner to appear and disappear.
   */
  async waitForSave(): Promise<void> {
    const page = this._requirePage();

    // Wait for the save overlay to appear (it may be very fast)
    await page
      .locator(
        'div[data-id="notificationWrapper"] .pa-k, ' +
        'div.pa-c-save-dialog, ' +
        'div[data-id="WebDialog_Saving"]'
      )
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => log("Save overlay not detected — save may have been instant"));

    // Wait for it to disappear
    await page
      .locator(
        'div[data-id="notificationWrapper"] .pa-k, ' +
        'div.pa-c-save-dialog, ' +
        'div[data-id="WebDialog_Saving"]'
      )
      .first()
      .waitFor({ state: "hidden", timeout: this._d365Config.d365Timeout })
      .catch(() => log("Save overlay may still be visible"));

    // Check for error dialog
    const errorDialog = page.locator(
      'div[data-id="errorDialogDialogContent"], div.pa-c-error-dialog'
    );
    const hasError = await errorDialog.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasError) {
      const errorText = await errorDialog.textContent();
      throw new Error(`D365 save error: ${errorText?.trim() ?? "Unknown error"}`);
    }
  }

  // ─── D365 Step Execution ─────────────────────────────────────────────

  /**
   * Execute an array of TestSteps using D365-aware actions.
   *
   * Supported step actions:
   * - `d365.openRecord` — data: { entity, id }
   * - `d365.openForm` — data: { entity }
   * - `d365.navigate` — data: { area, group, subarea }
   * - `d365.setValue` — data: { field, value }
   * - `d365.getFieldValue` — data: { field }
   * - `d365.save` — (no data required)
   * - `d365.clickField` — data: { field }
   * - Any standard Playwright action (delegated to parent)
   */
  async executeD365Steps(steps: TestStep[]): Promise<void> {
    for (const step of steps) {
      log("Executing D365 step: %s — %s", step.id, step.description);

      switch (step.action) {
        case "d365.openRecord": {
          const d = step.data as { entity: string; id: string } | undefined;
          if (d?.entity && d?.id) {
            await this.openRecord(d.entity, d.id);
          }
          break;
        }
        case "d365.openForm": {
          const d = step.data as { entity: string } | undefined;
          if (d?.entity) {
            await this.openForm(d.entity);
          }
          break;
        }
        case "d365.navigate": {
          const d = step.data as { area: string; group: string; subarea: string } | undefined;
          if (d?.area && d?.group && d?.subarea) {
            await this.navigateToArea(d.area, d.group, d.subarea);
          }
          break;
        }
        case "d365.setValue": {
          const d = step.data as { field: string; value: D365FieldValue } | undefined;
          if (d?.field) {
            await this.setValue(d.field, d.value ?? null);
          }
          break;
        }
        case "d365.clickField": {
          const d = step.data as { field: string } | undefined;
          if (d?.field) {
            await this.clickField(d.field);
          }
          break;
        }
        case "d365.getFieldValue": {
          const d = step.data as { field: string } | undefined;
          if (d?.field) {
            const val = await this.getFieldValue(d.field);
            log("Field %s = %O", d.field, val);
          }
          break;
        }
        case "d365.save": {
          const result = await this.saveRecord();
          if (!result.success) {
            throw new Error(`Save failed: ${result.error ?? "Unknown"}`);
          }
          break;
        }
        default:
          log("Non-D365 step action: %s (skipped in D365 step executor)", step.action);
          break;
      }
    }
  }

  // ─── Locator Helpers ──────────────────────────────────────────────────

  /**
   * Build a locator for a D365 field.
   * Strategy: prefer `data-id` attribute, fall back to `aria-label`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _fieldLocator(page: any, fieldName: string): any {
    return page.locator(
      `[data-id="${fieldName}"], ` +
      `[data-id="${fieldName}.fieldControl_container"], ` +
      `[aria-label="${fieldName}"]`
    ).first();
  }

  /**
   * Build a locator for a D365 field's input element.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _inputLocator(page: any, fieldName: string): any {
    return page.locator(
      `input[data-id="${fieldName}.fieldControl-text-box-text"], ` +
      `input[data-id="${fieldName}"], ` +
      `input[aria-label="${fieldName}"]`
    ).first();
  }

  /**
   * Slugify a name for use in D365 data-id attributes.
   * D365 typically uses lowercase, no spaces.
   */
  private _slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // ─── UCI Wait Helpers ────────────────────────────────────────────────

  /**
   * Wait for the UCI app shell to be ready (loading overlay gone).
   */
  private async _waitForUciReady(): Promise<void> {
    if (!this._d365Config.waitForUciOverlay) return;
    const page = this._requirePage();

    // Wait for the global loading overlay to disappear
    await page
      .locator(
        'div[data-id="OverlayBackground"], ' +
        'div.pa-c-loading-overlay, ' +
        'div[data-lp-id="loading"]'
      )
      .first()
      .waitFor({ state: "hidden", timeout: this._d365Config.d365Timeout })
      .catch(() => {
        // Overlay may not have appeared at all — that's fine
      });

    // Brief settle time for UCI rendering
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  /**
   * Wait for any transient UCI overlay (after clicks, saves, navigation).
   */
  private async _waitForUciOverlay(): Promise<void> {
    if (!this._d365Config.waitForUciOverlay) return;
    const page = this._requirePage();

    // Brief delay to let any overlay appear
    await new Promise((resolve) => setTimeout(resolve, 300));

    await page
      .locator(
        'div[data-id="OverlayBackground"], ' +
        'div.pa-c-loading-overlay'
      )
      .first()
      .waitFor({ state: "hidden", timeout: 15_000 })
      .catch(() => undefined);
  }

  /**
   * Ensure the page is available.
   */
  private _requirePage(): Page {
    if (!this._page) {
      throw new Error("D365 page not initialized. Call initD365() first.");
    }
    return this._page;
  }
}

import { z } from "zod";
import type { AIProvider } from "../providers/types.js";
import type { LicenseManager, EEFeature } from "@testforge/core";
import type { TestRun } from "@testforge/core";
import debug from "debug";

const log = debug("testforge:ai:compliance");

/**
 * Compliance frameworks supported by TestForge EE
 */
export type ComplianceFramework =
  | "NCA_ECC"
  | "SAMA_CSF"
  | "PCI_DSS"
  | "GDPR"
  | "ISO_27001"
  | "PDPL_SA";

/**
 * Framework metadata information
 */
export interface FrameworkInfo {
  /** Framework identifier */
  id: ComplianceFramework;
  /** Human-readable name */
  name: string;
  /** Description of the framework */
  description: string;
  /** Region/jurisdiction the framework applies to */
  region: string;
  /** Total number of controls in the framework */
  totalControls: number;
  /** License feature required to use this framework */
  requiredFeature: EEFeature;
}

/**
 * A single control within a compliance framework
 */
export interface ControlCoverage {
  /** Control identifier */
  controlId: string;
  /** Control name/description */
  controlName: string;
  /** Whether this control has been tested */
  covered: boolean;
  /** Test IDs that cover this control */
  testIds: string[];
  /** Control status */
  status: "compliant" | "partial" | "non-compliant" | "not-applicable";
  /** Evidence collected */
  evidence: string[];
  /** Notes on compliance status */
  notes: string;
}

/**
 * Output from a compliance run
 */
export interface ComplianceOutput {
  /** Framework that was tested */
  framework: ComplianceFramework;
  /** Coverage for each control */
  coverage: ControlCoverage[];
  /** Overall compliance percentage */
  compliancePercentage: number;
  /** Gaps identified (controls not tested) */
  gaps: string[];
  /** AI-generated compliance summary */
  aiSummary: string;
  /** Run timestamp */
  runAt: Date;
  /** Total controls in framework */
  totalControls: number;
  /** Controls that are covered/tested */
  coveredControls: number;
}

/**
 * Metadata for all available compliance frameworks
 */
export const FRAMEWORKS: Record<ComplianceFramework, FrameworkInfo> = {
  NCA_ECC: {
    id: "NCA_ECC",
    name: "NCA Essential Cybersecurity Controls",
    description:
      "Saudi National Cybersecurity Authority's Essential Cybersecurity Controls framework",
    region: "Saudi Arabia",
    totalControls: 114,
    requiredFeature: "compliance-nca-ecc",
  },
  SAMA_CSF: {
    id: "SAMA_CSF",
    name: "SAMA Cybersecurity Framework",
    description:
      "Saudi Arabian Monetary Authority Cybersecurity Framework for financial institutions",
    region: "Saudi Arabia",
    totalControls: 186,
    requiredFeature: "compliance-sama-csf",
  },
  PCI_DSS: {
    id: "PCI_DSS",
    name: "PCI Data Security Standard",
    description:
      "Payment Card Industry Data Security Standard for organizations handling card data",
    region: "Global",
    totalControls: 248,
    requiredFeature: "compliance-pci-dss",
  },
  GDPR: {
    id: "GDPR",
    name: "General Data Protection Regulation",
    description:
      "EU General Data Protection Regulation for personal data protection",
    region: "European Union",
    totalControls: 99,
    requiredFeature: "compliance-gdpr",
  },
  ISO_27001: {
    id: "ISO_27001",
    name: "ISO/IEC 27001:2022",
    description:
      "International standard for information security management systems",
    region: "Global",
    totalControls: 93,
    requiredFeature: "compliance-iso-27001",
  },
  PDPL_SA: {
    id: "PDPL_SA",
    name: "Saudi Personal Data Protection Law",
    description:
      "Saudi Arabia's Personal Data Protection Law for personal data processing",
    region: "Saudi Arabia",
    totalControls: 42,
    requiredFeature: "compliance-pdpl-sa",
  },
};

/**
 * Zod schema for compliance output validation
 */
const ComplianceOutputSchema = z.object({
  controls: z.array(
    z.object({
      controlId: z.string(),
      controlName: z.string(),
      covered: z.boolean(),
      status: z.enum([
        "compliant",
        "partial",
        "non-compliant",
        "not-applicable",
      ]),
      testIds: z.array(z.string()).default([]),
      notes: z.string(),
    })
  ),
  aiSummary: z.string(),
  gaps: z.array(z.string()),
});

/**
 * CompliancePack runs compliance audits against regulatory frameworks
 *
 * This is an Enterprise Edition (EE) feature, gated by license.
 *
 * Supported frameworks:
 * - NCA ECC (Saudi National Cybersecurity Authority)
 * - SAMA CSF (Saudi Arabian Monetary Authority)
 * - PCI DSS (Payment Card Industry)
 * - GDPR (EU General Data Protection Regulation)
 * - ISO 27001 (Information Security Management)
 * - PDPL SA (Saudi Personal Data Protection Law)
 *
 * @example
 * ```ts
 * const pack = new CompliancePack(aiProvider, licenseManager);
 * const result = await pack.run({
 *   suiteResults: testRun,
 *   framework: "NCA_ECC",
 * });
 * ```
 */
export class CompliancePack {
  private readonly _provider: AIProvider;
  private readonly _licenseManager: LicenseManager;

  constructor(provider: AIProvider, licenseManager: LicenseManager) {
    this._provider = provider;
    this._licenseManager = licenseManager;
  }

  /**
   * Get all available compliance frameworks
   *
   * @returns Array of framework metadata
   */
  getAvailableFrameworks(): FrameworkInfo[] {
    return Object.values(FRAMEWORKS);
  }

  /**
   * Run a compliance audit against a specific framework
   *
   * @param input - Test results and framework to audit
   * @returns Compliance analysis with coverage and gaps
   * @throws Error if the required EE license feature is not available
   */
  async run(input: {
    suiteResults: TestRun;
    framework: ComplianceFramework;
  }): Promise<ComplianceOutput> {
    const framework = FRAMEWORKS[input.framework];
    if (!framework) {
      throw new Error(`Unknown compliance framework: ${input.framework}`);
    }

    // Check license
    if (!this._licenseManager.check(framework.requiredFeature)) {
      throw new Error(
        `Compliance framework "${framework.name}" requires Enterprise Edition license with feature: ${framework.requiredFeature}. ` +
          "Please upgrade your license at https://testforge.io/pricing"
      );
    }

    log(
      "Running compliance audit: %s (%d controls)",
      framework.name,
      framework.totalControls
    );

    // Map test results to controls
    const coverage = await this._mapTestsToControls(
      input.suiteResults,
      framework
    );

    // Calculate compliance metrics
    const coveredControls = coverage.filter((c) => c.covered).length;
    const compliantControls = coverage.filter(
      (c) => c.status === "compliant"
    ).length;
    const compliancePercentage =
      framework.totalControls > 0
        ? Math.round(
            (compliantControls / framework.totalControls) * 100
          )
        : 0;

    // Identify gaps
    const gaps = coverage
      .filter((c) => !c.covered)
      .map(
        (c) =>
          `Control ${c.controlId}: ${c.controlName} — no test coverage`
      );

    const output: ComplianceOutput = {
      framework: input.framework,
      coverage,
      compliancePercentage,
      gaps,
      aiSummary: coverage[0]?.notes ?? "No controls analyzed",
      runAt: new Date(),
      totalControls: framework.totalControls,
      coveredControls,
    };

    log(
      "Compliance audit complete: %d/%d controls covered (%d%% compliant)",
      coveredControls,
      framework.totalControls,
      compliancePercentage
    );

    return output;
  }

  /**
   * Generate an evidence package for audit purposes
   * In production, this would generate a PDF with all evidence
   *
   * @param output - Compliance output from run()
   * @returns Evidence package summary (PDF generation would return Buffer)
   */
  async generateEvidencePackage(
    output: ComplianceOutput
  ): Promise<{ summary: string; controlEvidence: string[] }> {
    const framework = FRAMEWORKS[output.framework];

    const evidence: string[] = [];

    for (const control of output.coverage.filter((c) => c.covered)) {
      const evidenceEntry = [
        `Control: ${control.controlId} - ${control.controlName}`,
        `Status: ${control.status}`,
        `Tests: ${control.testIds.join(", ") || "Manual assessment"}`,
        `Evidence: ${control.evidence.join(", ") || "None collected"}`,
        `Notes: ${control.notes}`,
        "---",
      ].join("\n");

      evidence.push(evidenceEntry);
    }

    return {
      summary: `Compliance Evidence Package for ${framework.name}\n` +
        `Run Date: ${output.runAt.toISOString()}\n` +
        `Coverage: ${output.coveredControls}/${output.totalControls} controls\n` +
        `Compliance: ${output.compliancePercentage}%\n` +
        `Gaps: ${output.gaps.length} untested controls`,
      controlEvidence: evidence,
    };
  }

  /**
   * Generate suggested tests for uncovered controls
   *
   * @param framework - Framework to generate tests for
   * @param uncoveredControls - Controls that need test coverage
   * @returns Suggested test descriptions
   */
  async suggestTests(
    framework: ComplianceFramework,
    uncoveredControls: string[]
  ): Promise<string[]> {
    const frameworkInfo = FRAMEWORKS[framework];

    const prompt = `Generate test case descriptions for the following compliance controls that currently lack test coverage:

Framework: ${frameworkInfo.name}
Uncovered Controls (${uncoveredControls.length}):
${uncoveredControls.slice(0, 20).join("\n")}

For each control, suggest:
1. What the test should verify
2. What assertions should be made
3. What evidence should be collected
4. How often the test should run

Provide practical, actionable test descriptions.`;

    const response = await this._provider.generate(
      prompt,
      `You are a compliance testing specialist. Generate test descriptions for ${frameworkInfo.name} controls.`
    );

    return response.split("\n").filter((line) => line.trim().length > 0);
  }

  /**
   * Map test results to compliance controls using AI analysis
   */
  private async _mapTestsToControls(
    suiteResults: TestRun,
    framework: FrameworkInfo
  ): Promise<ControlCoverage[]> {
    // Get list of test names/IDs from the run
    const testNames = suiteResults.results.map(
      (result) => result.testId
    );

    const prompt = `Map the following test results to the controls in the ${framework.name} compliance framework.

Framework: ${framework.name} (${framework.region})
Total Controls: ${framework.totalControls}

Test Results (${testNames.length} tests):
${testNames.join(", ")}

For each control in the framework, determine:
1. Is it covered by any of these tests?
2. What is the compliance status?
3. What evidence was collected?

Focus on the most critical controls first.
Return the analysis as valid JSON with the controls array.`;

    const response = await this._provider.generateStructured(
      prompt,
      ComplianceOutputSchema,
      `You are a compliance audit expert. Map test results to ${framework.name} controls. 
Respond with ONLY valid JSON.`
    );

    // Build full coverage array, filling in uncovered controls
    const coverage: ControlCoverage[] = response.controls.map(
      (control) => ({
        controlId: control.controlId,
        controlName: control.controlName,
        covered: control.covered,
        status: control.status,
        testIds: control.testIds ?? [],
        evidence: [],
        notes: control.notes,
      })
    );

    return coverage;
  }
}

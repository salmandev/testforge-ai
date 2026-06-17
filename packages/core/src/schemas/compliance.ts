import { z } from "zod";

/**
 * Compliance control assessment status
 */
export const ControlStatusSchema = z.enum([
  "pass",
  "fail",
  "partial",
  "not_tested",
]);

export type ControlStatus = z.infer<typeof ControlStatusSchema>;

/**
 * Risk rating for compliance findings
 */
export const RiskRatingSchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);

export type RiskRating = z.infer<typeof RiskRatingSchema>;

/**
 * Evidence from test execution supporting a control assessment
 */
export const ComplianceEvidenceSchema = z.object({
  /** Test name that provides this evidence */
  testName: z.string(),
  /** Test ID */
  testId: z.string().optional(),
  /** Whether the test passed */
  passed: z.boolean(),
  /** Relevant log or assertion message */
  details: z.string().optional(),
  /** When the evidence was collected */
  collectedAt: z.coerce.date().default(() => new Date()),
});

export type ComplianceEvidence = z.infer<typeof ComplianceEvidenceSchema>;

/**
 * A single compliance finding — maps a control to its assessment
 */
export const ComplianceFindingSchema = z.object({
  /** Control identifier (e.g. NCA-ECC-1.1, SAMA-CSF-3.2) */
  controlId: z.string(),
  /** Control name in English */
  controlName: z.string(),
  /** Control name in Arabic (for KSA regulatory reporting) */
  controlName_ar: z.string().optional(),
  /** Framework this control belongs to */
  framework: z.string(),
  /** Assessment status */
  status: ControlStatusSchema,
  /** Risk rating if failed or partial */
  riskRating: RiskRatingSchema.optional(),
  /** Human-readable assessment description */
  assessment: z.string(),
  /** Assessment in Arabic */
  assessment_ar: z.string().optional(),
  /** Remediation steps if failed or partial */
  remediation: z.string().optional(),
  /** Remediation in Arabic */
  remediation_ar: z.string().optional(),
  /** Evidence from test execution */
  evidence: z.array(ComplianceEvidenceSchema).default([]),
  /** AI confidence score (0-1) */
  confidence: z.number().min(0).max(1).default(0),
  /** Whether this was AI-assessed */
  generatedByAi: z.boolean().default(true),
  /** When this finding was assessed */
  assessedAt: z.coerce.date().default(() => new Date()),
});

export type ComplianceFinding = z.infer<typeof ComplianceFindingSchema>;

/**
 * A compliance report aggregating findings across a framework
 */
export const ComplianceReportSchema = z.object({
  /** Framework identifier */
  framework: z.string(),
  /** Framework display name */
  frameworkName: z.string(),
  /** Total controls in the framework */
  totalControls: z.number(),
  /** Number of controls that passed */
  passed: z.number(),
  /** Number of controls that failed */
  failed: z.number(),
  /** Number of controls with partial compliance */
  partial: z.number(),
  /** Number of controls not tested */
  notTested: z.number(),
  /** Coverage percentage (tested controls / total controls * 100) */
  coveragePercent: z.number().min(0).max(100),
  /** All individual findings */
  findings: z.array(ComplianceFindingSchema).default([]),
  /** AI-generated executive summary */
  executiveSummary: z.string().optional(),
  /** Executive summary in Arabic */
  executiveSummary_ar: z.string().optional(),
  /** When the report was generated */
  generatedAt: z.coerce.date().default(() => new Date()),
  /** When the report was generated (Arabic calendar display) */
  generatedAt_ar: z.string().optional(),
});

export type ComplianceReport = z.infer<typeof ComplianceReportSchema>;

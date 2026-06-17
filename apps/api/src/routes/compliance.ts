import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FRAMEWORKS, CompliancePack, type ComplianceFramework } from "@testforge/ai-engine";
import { ProviderFactory } from "@testforge/ai-engine";
import { LicenseManager } from "@testforge/core";
import { getDb } from "../database.js";

/**
 * Register compliance-related routes (EE)
 */
export async function registerComplianceRoutes(app: FastifyInstance): Promise<void> {
  const licenseManager = new LicenseManager();

  // List available compliance frameworks
  app.get("/api/compliance/frameworks", {
    handler: async () => {
      return Object.values(FRAMEWORKS).map((fw) => ({
        id: fw.id,
        name: fw.name,
        description: fw.description,
        region: fw.region,
        totalControls: fw.totalControls,
      }));
    },
  });

  // Get compliance results for a run
  app.get("/api/compliance/runs/:runId", {
    schema: {
      params: z.object({ runId: z.string() }),
    },
    handler: async (request, reply) => {
      const { runId } = request.params as { runId: string };

      const db = getDb();
      if (db) {
        const findings = await db.complianceFinding.findMany({
          where: { runId },
          orderBy: { controlId: "asc" },
        });
        return findings;
      }

      return reply.code(404).send({
        error: "Compliance findings require database",
        message: "Set DATABASE_URL to enable compliance tracking",
      });
    },
  });

  // Run compliance assessment
  app.post("/api/compliance/run", {
    schema: {
      body: z.object({
        framework: z.string(),
        runId: z.string().optional(),
        suiteResults: z.record(z.unknown()).optional(),
      }),
    },
    handler: async (request, reply) => {
      const body = request.body as {
        framework: string;
        runId?: string;
        suiteResults?: Record<string, unknown>;
      };

      // Check EE license
      const licenseKey = process.env.TESTFORGE_LICENSE_KEY;
      if (licenseKey) {
        await licenseManager.verifyLicenseKey(licenseKey);
      }

      if (!licenseManager.check("compliance-nca-ecc" as never)) {
        return reply.code(403).send({
          error: "Compliance features require Enterprise Edition license",
        });
      }

      const frameworkId = body.framework.toUpperCase().replace(/-/g, "_") as ComplianceFramework;
      const framework = FRAMEWORKS[frameworkId];

      if (!framework) {
        return reply.code(400).send({
          error: `Unknown framework: ${body.framework}`,
          availableFrameworks: Object.keys(FRAMEWORKS),
        });
      }

      // Try to use real CompliancePack with AI
      try {
        const provider = await ProviderFactory.create();
        const compliancePack = new CompliancePack(provider, licenseManager);

        const testResults = body.suiteResults ?? {};
        const output = await compliancePack.audit({
          framework: frameworkId,
          testResults: testResults as Record<string, unknown>,
        });

        // Store findings in database if runId provided
        if (body.runId) {
          const db = getDb();
          if (db) {
            for (const control of output.coverage) {
              await db.complianceFinding.create({
                data: {
                  runId: body.runId,
                  controlId: control.controlId,
                  controlName: control.controlName,
                  controlNameAr: control.controlName_ar,
                  framework: frameworkId,
                  status: control.status.toUpperCase(),
                  riskRating: control.riskRating?.toUpperCase(),
                  assessment: control.assessment,
                  assessmentAr: control.assessment_ar,
                  remediation: control.remediation,
                  remediationAr: control.remediation_ar,
                  evidence: control.evidence ?? [],
                  confidence: control.confidence,
                  generatedByAi: true,
                },
              });
            }
          }
        }

        return output;
      } catch (error) {
        // Fallback: return framework info without AI analysis
        return {
          framework: frameworkId,
          frameworkName: framework.name,
          coverage: [],
          compliancePercentage: 0,
          gaps: ["AI provider not available for compliance analysis"],
          aiSummary: "Run tests first to generate compliance evidence",
          totalControls: framework.totalControls,
          coveredControls: 0,
        };
      }
    },
  });
}
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FRAMEWORKS, type ComplianceFramework } from "@testforge/ai-engine";
import { LicenseManager } from "@testforge/core";

/**
 * Register compliance-related routes (EE)
 */
export async function registerComplianceRoutes(app: FastifyInstance): Promise<void> {
  const licenseManager = new LicenseManager();

  // List available compliance frameworks
  app.get("/api/compliance/frameworks", {
    schema: {
      response: {
        200: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string(),
            region: z.string(),
            totalControls: z.number(),
          })
        ),
      },
    },
    handler: async () => {
      return Object.values(FRAMEWORKS).map((fw) => ({
        id: fw.id,
        name: fw.name,
        description: fw.description,
        region: fw.region,
        totalControls: fw.totalControls,
      }));
    },
  });

  // Run compliance pack
  app.post("/api/compliance/run", {
    schema: {
      body: z.object({
        framework: z.string(),
        suiteResults: z.record(z.unknown()),
      }),
    },
    handler: async (request, reply) => {
      const body = request.body as {
        framework: string;
        suiteResults: Record<string, unknown>;
      };

      // Check EE license
      const licenseKey = process.env.TESTFORGE_LICENSE_KEY;
      if (licenseKey) {
        await licenseManager.verifyLicenseKey(licenseKey);
      }

      if (!licenseManager.check("compliance-nca-ecc" as any)) {
        return reply.code(403).send({
          error: "Compliance features require Enterprise Edition license",
        });
      }

      const frameworkId = body.framework.toUpperCase().replace(/-/g, "_") as ComplianceFramework;
      const framework = FRAMEWORKS[frameworkId];

      if (!framework) {
        return reply.code(400).send({
          error: `Unknown framework: ${body.framework}`,
          availableFrameworks: Object.keys(FRAMEWORKS),
        });
      }

      // In production, run actual compliance analysis
      // For now, return a placeholder response
      return {
        framework: frameworkId,
        frameworkName: framework.name,
        coverage: [],
        compliancePercentage: 0,
        gaps: ["Automated compliance mapping requires test execution"],
        aiSummary: "Run tests first to generate compliance evidence",
        totalControls: framework.totalControls,
        coveredControls: 0,
      };
    },
  });
}

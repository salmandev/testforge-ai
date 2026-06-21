import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InMemoryStore, getDb } from "../database.js";
import { NotFoundError } from "../errors.js";
import { ProviderFactory } from "@testforge/ai-engine";
import { AllureReporter, AIReporter, PDFReporter } from "@testforge/reporter";
import type { TestRunData } from "@testforge/reporter";

/**
 * In-memory report storage
 */
const reportStore = new InMemoryStore<{
  id: string;
  runId: string;
  title: string;
  generatedAt: string;
  format: string;
  passRate: number;
  totalTests: number;
  path?: string;
}>();

/**
 * Register report-related routes
 */
export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  // List reports
  app.get("/api/reports", {
    handler: async () => {
      const db = getDb();
      if (db) {
        const runs = await db.run.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            suite: { select: { name: true } },
            _count: { select: { results: true } },
            results: { select: { status: true } },
          },
        });

        return runs.map((r: Record<string, unknown>) => {
          const results = r.results as Array<{ status: string }> | undefined;
          const total = results?.length ?? 0;
          const passed = results?.filter((r) => r.status === "PASSED").length ?? 0;
          return {
            id: r.id,
            runId: r.id,
            title: `${(r.suite as { name: string } | undefined)?.name ?? "Run"} Report`,
            generatedAt: r.createdAt,
            format: "json",
            passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
            totalTests: total,
          };
        });
      }

      return reportStore.findAll();
    },
  });

  // Get report data for a run
  app.get("/api/reports/:runId", {
    schema: {
      params: z.object({ runId: z.string() }),
      querystring: z.object({
        format: z.enum(["json", "allure", "ai-summary"]).default("json"),
      }).optional(),
    },
    handler: async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const query = request.query as { format?: string } | undefined;
      const format = query?.format ?? "json";

      // Fetch run data from database
      const db = getDb();
      let runData: TestRunData;

      if (db) {
        const run = await db.run.findUnique({
          where: { id: runId },
          include: {
            suite: { select: { name: true, projectId: true } },
            results: true,
          },
        });

        if (!run) return reply.code(404).send(new NotFoundError("Run", runId).toJSON());

        runData = {
          runId: run.id,
          suiteId: run.suiteId,
          projectName: (run.suite as { name: string } | undefined)?.name ?? "TestForge",
          status: (run.status as string).toLowerCase() as TestRunData["status"],
          startedAt: run.createdAt ?? new Date(),
          completedAt: run.completedAt,
          duration: run.duration ?? 0,
          results: (run.results as Array<{
            testId: string;
            testName: string;
            status: string;
            duration: number;
            error?: string;
          }>).map((r) => ({
            testId: r.testId,
            testName: r.testName,
            testType: "web",
            status: r.status.toLowerCase() as "passed" | "failed" | "skipped",
            duration: r.duration ?? 0,
            error: r.error,
            steps: [],
            tags: [],
          })),
          triggeredBy: (run.triggeredBy as string).toLowerCase() as TestRunData["triggeredBy"],
        };
      } else {
        runData = {
          runId,
          suiteId: "unknown",
          projectName: "TestForge",
          status: "passed",
          startedAt: new Date(),
          duration: 0,
          results: [],
          triggeredBy: "manual",
        };
      }

      if (format === "json") {
        return { format: "json", data: runData };
      }

      if (format === "ai-summary") {
        try {
          const provider = await ProviderFactory.create();
          const aiReporter = new AIReporter(provider);
          const analysis = await aiReporter.analyze(runData);
          return { format: "ai-summary", analysis };
        } catch {
          return { format: "ai-summary", analysis: null, message: "AI provider not available" };
        }
      }

      if (format === "allure") {
        const reporter = new AllureReporter();
        const files = await reporter.generate(runData);
        return { format: "allure", files };
      }

      return { format, data: runData };
    },
  });

  // Export report as PDF
  app.post("/api/reports/:runId/export", {
    schema: {
      params: z.object({ runId: z.string() }),
      body: z.object({
        format: z.enum(["pdf", "allure", "ai-summary", "junit"]).default("pdf"),
        includeAiAnalysis: z.boolean().default(true),
      }).optional(),
    },
    handler: async (request) => {
      const { runId } = request.params as { runId: string };
      const body = request.body as { format?: string; includeAiAnalysis?: boolean } | undefined;

      const format = body?.format ?? "pdf";
      const includeAi = body?.includeAiAnalysis ?? true;

      // Build run data
      const db = getDb();
      let runData: TestRunData;

      if (db) {
        const run = await db.run.findUnique({
          where: { id: runId },
          include: { suite: { select: { name: true } }, results: true },
        });

        if (run) {
          runData = {
            runId: run.id,
            suiteId: run.suiteId,
            projectName: (run.suite as { name: string })?.name ?? "TestForge",
            status: (run.status as string).toLowerCase() as TestRunData["status"],
            startedAt: run.createdAt ?? new Date(),
            duration: run.duration ?? 0,
            results: (run.results as Array<{ testId: string; testName: string; status: string; duration: number; error?: string }>).map((r) => ({
              testId: r.testId,
              testName: r.testName,
              testType: "web",
              status: r.status.toLowerCase() as "passed" | "failed",
              duration: r.duration ?? 0,
              error: r.error,
              steps: [],
              tags: [],
            })),
            triggeredBy: "manual",
          };
        } else {
          runData = { runId, suiteId: "unknown", projectName: "TestForge", status: "passed", startedAt: new Date(), duration: 0, results: [], triggeredBy: "manual" };
        }
      } else {
        runData = { runId, suiteId: "unknown", projectName: "TestForge", status: "passed", startedAt: new Date(), duration: 0, results: [], triggeredBy: "manual" };
      }

      let analysis;
      if (includeAi) {
        try {
          const provider = await ProviderFactory.create();
          const aiReporter = new AIReporter(provider);
          analysis = await aiReporter.analyze(runData);
        } catch {
          // AI analysis optional
        }
      }

      if (format === "pdf") {
        const reporter = new PDFReporter();
        const pdfPath = await reporter.generate(runData, analysis);
        return { format: "pdf", path: pdfPath };
      }

      if (format === "allure") {
        const reporter = new AllureReporter();
        const files = await reporter.generate(runData);
        return { format: "allure", files };
      }

      return { format, data: runData };
    },
  });

  // Generate report for a run
  app.post("/api/reports/:runId/generate", {
    schema: {
      params: z.object({ runId: z.string() }),
    },
    handler: async (request) => {
      const { runId } = request.params as { runId: string };
      const id = `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();

      return reportStore.create({
        id,
        runId,
        title: `Run Report ${runId}`,
        generatedAt: now,
        format: "json",
        passRate: 0,
        totalTests: 0,
      });
    },
  });
}
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ProviderFactory } from "@testforge/ai-engine";
import { AllureReporter, AIReporter, PDFReporter } from "@testforge/reporter";
import type { TestRunData } from "@testforge/reporter";

/**
 * Register report-related routes
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { InMemoryStore, getDb } from "../database.js";
import { NotFoundError } from "../errors.js";

/**
 * In-memory run storage
 */
const runStore = new InMemoryStore<{
  id: string;
  suiteId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  duration: number;
  triggeredBy: string;
  environment?: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  results: Array<Record<string, unknown>>;
}>();

/**
 * Register run-related routes
 */
export async function registerRunRoutes(app: FastifyInstance): Promise<void> {
  // List runs
  app.get("/api/runs", {
    schema: {
      querystring: z.object({
        suiteId: z.string().optional(),
        status: z.string().optional(),
        limit: z.coerce.number().default(20),
      }).optional(),
    },
    handler: async (request) => {
      const query = request.query as { suiteId?: string; status?: string; limit?: number } | undefined;

      const db = getDb();
      if (db) {
        const where: Record<string, unknown> = {};
        if (query?.suiteId) where.suiteId = query.suiteId;
        if (query?.status) where.status = query.status.toUpperCase();

        const runs = await db.run.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: query?.limit ?? 20,
          include: {
            suite: { select: { name: true } },
            _count: { select: { results: true } },
            results: {
              select: { status: true },
            },
          },
        });

        return runs.map((r: Record<string, unknown>) => {
          const results = r.results as Array<{ status: string }> | undefined;
          return {
            id: r.id,
            suiteId: r.suiteId,
            suiteName: (r.suite as { name: string } | undefined)?.name ?? "Unknown",
            status: (r.status as string).toLowerCase(),
            totalTests: (r._count as { results: number } | undefined)?.results ?? 0,
            passedTests: results?.filter((r) => r.status === "PASSED").length ?? 0,
            failedTests: results?.filter((r) => r.status === "FAILED").length ?? 0,
            skippedTests: results?.filter((r) => r.status === "SKIPPED").length ?? 0,
            startedAt: r.createdAt,
            completedAt: r.completedAt,
            duration: r.duration,
          };
        });
      }

      let runs = runStore.findAll();
      if (query?.suiteId) runs = runs.filter((r) => r.suiteId === query.suiteId);
      if (query?.status) runs = runs.filter((r) => r.status === query.status);
      return runs.slice(0, query?.limit ?? 20);
    },
  });

  // Get run details
  app.get("/api/runs/:id", {
    schema: {
      params: z.object({ id: z.string() }),
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      const db = getDb();
      if (db) {
        const run = await db.run.findUnique({
          where: { id },
          include: {
            suite: { select: { name: true } },
            results: {
              orderBy: { id: "asc" },
            },
          },
        });

        if (!run) return reply.code(404).send(new NotFoundError("Run", id).toJSON());

        return {
          ...run,
          suiteName: (run.suite as { name: string } | undefined)?.name,
          steps: run.results,
        };
      }

      const run = runStore.findById(id);
      if (!run) return reply.code(404).send(new NotFoundError("Run", id).toJSON());
      return run;
    },
  });

  // SSE stream for live run results
  app.get("/api/runs/:id/stream", {
    schema: {
      params: z.object({ id: z.string() }),
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      // Set up SSE
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      reply.raw.write(`data: ${JSON.stringify({ event: "connected", runId: id })}\n\n`);

      // Keep connection alive with heartbeat every 15s
      const heartbeat = setInterval(() => {
        reply.raw.write(`: heartbeat\n\n`);
      }, 15000);

      // Close on client disconnect
      request.raw.on("close", () => {
        clearInterval(heartbeat);
      });
    },
  });

  // Get run results
  app.get("/api/runs/:id/results", {
    schema: {
      params: z.object({ id: z.string() }),
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      const db = getDb();
      if (db) {
        const results = await db.runResult.findMany({
          where: { runId: id },
          orderBy: { id: "asc" },
        });
        return results;
      }

      const run = runStore.findById(id);
      if (!run) return reply.code(404).send(new NotFoundError("Run", id).toJSON());
      return run.results;
    },
  });
}
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

/**
 * In-memory run storage
 */
const runs = new Map<string, Record<string, unknown>>();

/**
 * Register run-related routes
 */

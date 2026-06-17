import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InMemoryStore, getDb } from "../database.js";
import { NotFoundError } from "../errors.js";
import { broadcastToRun } from "../websocket/index.js";

/**
 * In-memory suite storage
 */
const suiteStore = new InMemoryStore<{
  id: string;
  name: string;
  projectId: string;
  parallelism: number;
  tags: string[];
  testCases: unknown[];
  createdAt: string;
  updatedAt: string;
}>();

/**
 * Register suite-related routes
 */
export async function registerSuiteRoutes(app: FastifyInstance): Promise<void> {
  // Create suite
  app.post("/api/projects/:projectId/suites", {
    schema: {
      params: z.object({ projectId: z.string() }),
      body: z.object({
        name: z.string().min(1).max(200),
        parallelism: z.number().min(1).max(10).default(1),
        tags: z.array(z.string()).default([]),
        testCases: z.array(z.unknown()).optional(),
      }),
    },
    handler: async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const body = request.body as {
        name: string;
        parallelism?: number;
        tags?: string[];
        testCases?: unknown[];
      };

      const db = getDb();
      if (db) {
        const suite = await db.suite.create({
          data: {
            name: body.name,
            projectId,
            parallelism: body.parallelism ?? 1,
            tags: body.tags ?? [],
            testCases: body.testCases ?? [],
          },
        });
        return reply.code(201).send(suite);
      }

      const id = `suite-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();

      const suite = suiteStore.create({
        id,
        name: body.name,
        projectId,
        parallelism: body.parallelism ?? 1,
        tags: body.tags ?? [],
        testCases: body.testCases ?? [],
        createdAt: now,
        updatedAt: now,
      });

      return reply.code(201).send(suite);
    },
  });

  // List all suites
  app.get("/api/suites", {
    handler: async () => {
      const db = getDb();
      if (db) {
        const suites = await db.suite.findMany({
          orderBy: { createdAt: "desc" },
          include: { runs: { take: 1, orderBy: { createdAt: "desc" } } },
        });
        return suites.map((s: Record<string, unknown>) => ({
          ...s,
          testCount: Array.isArray(s.testCases) ? s.testCases.length : 0,
          lastRunStatus: Array.isArray(s.runs) && s.runs.length > 0
            ? (s.runs as Array<{ status: string }>)[0]?.status?.toLowerCase()
            : undefined,
          lastRunAt: Array.isArray(s.runs) && s.runs.length > 0
            ? (s.runs as Array<{ createdAt: Date }>)[0]?.createdAt
            : undefined,
        }));
      }
      return suiteStore.findAll().map((s) => ({
        ...s,
        testCount: s.testCases.length,
      }));
    },
  });

  // Get suite
  app.get("/api/suites/:id", {
    schema: {
      params: z.object({ id: z.string() }),
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      const db = getDb();
      if (db) {
        const suite = await db.suite.findUnique({ where: { id } });
        if (!suite) return reply.code(404).send(new NotFoundError("Suite", id).toJSON());
        return suite;
      }

      const suite = suiteStore.findById(id);
      if (!suite) return reply.code(404).send(new NotFoundError("Suite", id).toJSON());
      return suite;
    },
  });

  // Update suite
  app.patch("/api/suites/:id", {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        name: z.string().optional(),
        parallelism: z.number().optional(),
        tags: z.array(z.string()).optional(),
        testCases: z.array(z.unknown()).optional(),
      }),
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;

      const db = getDb();
      if (db) {
        return db.suite.update({ where: { id }, data: body });
      }

      const updated = suiteStore.update(id, { ...body, updatedAt: new Date().toISOString() });
      if (!updated) return reply.code(404).send(new NotFoundError("Suite", id).toJSON());
      return updated;
    },
  });

  // Delete suite
  app.delete("/api/suites/:id", {
    schema: {
      params: z.object({ id: z.string() }),
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      const db = getDb();
      if (db) {
        await db.suite.delete({ where: { id } });
        return reply.code(204).send();
      }

      const deleted = suiteStore.delete(id);
      if (!deleted) return reply.code(404).send(new NotFoundError("Suite", id).toJSON());
      return reply.code(204).send();
    },
  });

  // Run suite — creates a run record and broadcasts via WebSocket
  app.post("/api/suites/:id/run", {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        environment: z.string().optional(),
        parallel: z.number().optional(),
        aiHeal: z.boolean().optional(),
        record: z.boolean().optional(),
      }).optional(),
    },
    handler: async (request, reply) => {
      const { id: suiteId } = request.params as { id: string };
      const body = request.body as { environment?: string; parallel?: number } | undefined;

      const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();

      const db = getDb();
      if (db) {
        const suite = await db.suite.findUnique({ where: { id: suiteId } });
        if (!suite) return reply.code(404).send(new NotFoundError("Suite", suiteId).toJSON());

        const run = await db.run.create({
          data: {
            id: runId,
            suiteId,
            projectId: suite.projectId,
            status: "PENDING",
            triggeredBy: "MANUAL",
            environment: body?.environment,
          },
        });

        // Broadcast run creation to WebSocket subscribers
        broadcastToRun(runId, {
          type: "run:created",
          runId,
          suiteId,
          status: "pending",
          startedAt: now,
        });

        return reply.code(202).send(run);
      }

      const run = {
        runId,
        suiteId,
        status: "pending",
        environment: body?.environment,
        startedAt: now,
      };

      broadcastToRun(runId, { type: "run:created", ...run });
      return reply.code(202).send(run);
    },
  });
}
import type { FastifyInstance } from "fastify";
import { z } from "zod";

/**
 * In-memory suite storage
 */
const suites = new Map<string, Record<string, unknown>>();

/**
 * Register suite-related routes
 */
export async function registerSuiteRoutes(app: FastifyInstance): Promise<void> {
  // Create suite
  app.post("/api/projects/:projectId/suites", {
    schema: {
      params: z.object({ projectId: z.string() }),
      body: z.object({
        name: z.string(),
        parallelism: z.number().min(1).max(10).default(1),
        tags: z.array(z.string()).default([]),
      }),
      response: {
        201: z.object({
          id: z.string(),
          name: z.string(),
          projectId: z.string(),
          parallelism: z.number(),
        }),
      },
    },
    handler: async (request, reply) => {
      const params = request.params as { projectId: string };
      const body = request.body as { name: string; parallelism?: number; tags?: string[] };
      const id = `suite-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const suite = {
        id,
        name: body.name,
        projectId: params.projectId,
        parallelism: body.parallelism ?? 1,
        tags: body.tags ?? [],
        createdAt: new Date().toISOString(),
      };

      suites.set(id, suite);
      return reply.code(201).send(suite);
    },
  });

  // Get suite
  app.get("/api/suites/:id", {
    schema: {
      params: z.object({ id: z.string() }),
    },
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const suite = suites.get(params.id);

      if (!suite) {
        return reply.code(404).send({ error: "Suite not found" });
      }

      return suite;
    },
  });

  // Run suite
  app.post("/api/suites/:id/run", {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        environment: z.string().optional(),
        parallel: z.number().optional(),
        aiHeal: z.boolean().optional(),
        record: z.boolean().optional(),
      }).optional(),
      response: {
        202: z.object({
          runId: z.string(),
          suiteId: z.string(),
          status: z.string(),
          startedAt: z.string(),
        }),
      },
    },
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      return reply.code(202).send({
        runId,
        suiteId: params.id,
        status: "pending",
        startedAt: new Date().toISOString(),
      });
    },
  });
}

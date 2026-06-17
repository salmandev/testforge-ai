import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InMemoryStore, getDb } from "../database.js";
import { authenticate } from "../auth.js";
import { NotFoundError } from "../errors.js";

/**
 * In-memory project storage (auto-fallback when DATABASE_URL is not set)
 */
const projectStore = new InMemoryStore<{
  id: string;
  name: string;
  baseUrl: string;
  environments: Record<string, string>;
  integrations: Record<string, unknown>;
  licenseFeatures: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}>();

/**
 * Register project-related routes
 */
export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  // Create project
  app.post("/api/projects", {
    schema: {
      body: z.object({
        name: z.string().min(1).max(100),
        baseUrl: z.string().url(),
        environments: z.record(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
    handler: async (request, reply) => {
      const body = request.body as {
        name: string;
        baseUrl: string;
        environments?: Record<string, string>;
        tags?: string[];
      };

      // Try Prisma first, fall back to in-memory
      const db = getDb();
      if (db) {
        const project = await db.project.create({
          data: {
            name: body.name,
            baseUrl: body.baseUrl,
            environments: body.environments ?? {},
            tags: body.tags ?? [],
            orgId: "default", // TODO: from JWT user.orgId
          },
        });
        return reply.code(201).send(project);
      }

      const id = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();

      const project = projectStore.create({
        id,
        name: body.name,
        baseUrl: body.baseUrl,
        environments: body.environments ?? {},
        integrations: {},
        licenseFeatures: [],
        tags: body.tags ?? [],
        createdAt: now,
        updatedAt: now,
      });

      return reply.code(201).send(project);
    },
  });

  // List projects
  app.get("/api/projects", {
    handler: async () => {
      const db = getDb();
      if (db) {
        return db.project.findMany({ orderBy: { createdAt: "desc" } });
      }
      return projectStore.findAll();
    },
  });

  // Get project by ID
  app.get("/api/projects/:id", {
    schema: {
      params: z.object({ id: z.string() }),
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      const db = getDb();
      if (db) {
        const project = await db.project.findUnique({ where: { id } });
        if (!project) {
          return reply.code(404).send(new NotFoundError("Project", id).toJSON());
        }
        return project;
      }

      const project = projectStore.findById(id);
      if (!project) {
        return reply.code(404).send(new NotFoundError("Project", id).toJSON());
      }
      return project;
    },
  });

  // Update project
  app.patch("/api/projects/:id", {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        name: z.string().optional(),
        baseUrl: z.string().url().optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { name?: string; baseUrl?: string; tags?: string[] };

      const db = getDb();
      if (db) {
        const project = await db.project.update({ where: { id }, data: body });
        return project;
      }

      const updated = projectStore.update(id, { ...body, updatedAt: new Date().toISOString() });
      if (!updated) {
        return reply.code(404).send(new NotFoundError("Project", id).toJSON());
      }
      return updated;
    },
  });

  // Delete project
  app.delete("/api/projects/:id", {
    schema: {
      params: z.object({ id: z.string() }),
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      const db = getDb();
      if (db) {
        await db.project.delete({ where: { id } });
        return reply.code(204).send();
      }

      const deleted = projectStore.delete(id);
      if (!deleted) {
        return reply.code(404).send(new NotFoundError("Project", id).toJSON());
      }
      return reply.code(204).send();
    },
  });

  // Get project suites
  app.get("/api/projects/:id/suites", {
    schema: {
      params: z.object({ id: z.string() }),
    },
    handler: async (request) => {
      const { id } = request.params as { id: string };

      const db = getDb();
      if (db) {
        return db.suite.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } });
      }
      return [];
    },
  });

  // Dashboard stats
  app.get("/api/runs/stats", {
    handler: async () => {
      const db = getDb();
      if (db) {
        const [totalRuns, passedRuns, activeSuites] = await Promise.all([
          db.run.count(),
          db.run.count({ where: { status: "PASSED" } }),
          db.suite.count(),
        ]);
        return {
          totalRuns,
          passRate: totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0,
          avgDuration: 0, // TODO: aggregate from runs
          activeSuites,
        };
      }
      return { totalRuns: 0, passRate: 0, avgDuration: 0, activeSuites: 0 };
    },
  });
}
import type { FastifyInstance } from "fastify";
import { z } from "zod";

/**
 * In-memory project storage (replace with Drizzle ORM + PostgreSQL in production)
 */
const projects = new Map<string, Record<string, unknown>>();

/**
 * Register project-related routes
 */
export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  // Create project
  app.post("/api/projects", {
    schema: {
      body: z.object({
        name: z.string(),
        baseUrl: z.string().url(),
        environments: z.record(z.string()).optional(),
      }),
      response: {
        201: z.object({
          id: z.string(),
          name: z.string(),
          baseUrl: z.string(),
          createdAt: z.string(),
        }),
      },
    },
    handler: async (request, reply) => {
      const body = request.body as { name: string; baseUrl: string; environments?: Record<string, string> };
      const id = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const project = {
        id,
        name: body.name,
        baseUrl: body.baseUrl,
        environments: body.environments ?? {},
        createdAt: new Date().toISOString(),
      };

      projects.set(id, project);
      return reply.code(201).send(project);
    },
  });

  // List projects
  app.get("/api/projects", {
    schema: {
      response: {
        200: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            baseUrl: z.string(),
            createdAt: z.string(),
          })
        ),
      },
    },
    handler: async () => {
      return Array.from(projects.values());
    },
  });

  // Get project
  app.get("/api/projects/:id", {
    schema: {
      params: z.object({ id: z.string() }),
      response: {
        200: z.object({
          id: z.string(),
          name: z.string(),
          baseUrl: z.string(),
          environments: z.record(z.string()),
          createdAt: z.string(),
        }),
        404: z.object({ error: z.string() }),
      },
    },
    handler: async (request, reply) => {
      const params = request.params as { id: string };
      const project = projects.get(params.id);

      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      return project;
    },
  });

  // Get project suites
  app.get("/api/projects/:id/suites", {
    schema: {
      params: z.object({ id: z.string() }),
      response: {
        200: z.array(z.object({ id: z.string(), name: z.string() })),
      },
    },
    handler: async (request) => {
      // Placeholder — suites would be stored separately
      return [];
    },
  });
}

import type { FastifyInstance } from "fastify";
import type { ApiServerConfig } from "../server.js";
import { z } from "zod";
import { GridManager, LocalProvider } from "@testforge/device-cloud";

/**
 * Register device-related routes
 */
export async function registerDeviceRoutes(
  app: FastifyInstance,
  config: ApiServerConfig
): Promise<void> {
  // Initialize grid manager with local provider
  let gridManager: GridManager | null = null;

  try {
    gridManager = new GridManager({
      providers: [{ provider: new LocalProvider(), priority: 1 }],
    });
  } catch {
    // Grid manager may fail to init if ADB isn't available
  }

  // List available devices
  app.get("/api/devices", {
    schema: {
      response: {
        200: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            platform: z.string(),
            platformVersion: z.string(),
            model: z.string(),
            available: z.boolean(),
            providerId: z.string(),
          })
        ),
      },
    },
    handler: async () => {
      if (!gridManager) {
        return [];
      }

      const devices = await gridManager.getAllDevices();
      return devices.map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        platformVersion: d.platformVersion,
        model: d.model,
        available: d.available,
        providerId: d.providerId,
      }));
    },
  });

  // Launch device session
  app.post("/api/devices/:id/session", {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        capabilities: z.record(z.unknown()),
      }),
    },
    handler: async (request, reply) => {
      if (!gridManager) {
        return reply.code(503).send({ error: "Device grid not available" });
      }

      const params = request.params as { id: string };
      const body = request.body as { capabilities: Record<string, unknown> };

      try {
        const { session } = await gridManager.launchSession(
          params.id,
          body.capabilities as any
        );

        return reply.code(201).send({
          sessionId: session.sessionId,
          remoteUrl: session.remoteUrl,
          videoStreamUrl: session.videoStreamUrl,
          expiresAt: session.expiresAt.toISOString(),
        });
      } catch (error) {
        return reply
          .code(500)
          .send({ error: error instanceof Error ? error.message : "Session launch failed" });
      }
    },
  });
}

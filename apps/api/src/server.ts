import fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import jwt from "@fastify/jwt";
import { registerRoutes } from "./routes/index.js";
import { registerWebSocket } from "./websocket/index.js";
import { registerAuth } from "./auth.js";
import debug from "debug";

const log = debug("testforge:api:server");

/**
 * API server configuration options
 */
export interface ApiServerConfig {
  /** Server port (default: 3000) */
  port?: number;
  /** Server host (default: 0.0.0.0) */
  host?: string;
  /** CORS origins (default: *) */
  corsOrigin?: string | string[] | boolean;
  /** JWT secret for authentication */
  jwtSecret?: string;
  /** Rate limit (default: 100 requests per minute) */
  rateLimitMax?: number;
  /** Rate limit window in ms (default: 60000) */
  rateLimitWindow?: number;
  /** Redis URL for BullMQ queues */
  redisUrl?: string;
  /** Enable Swagger UI at /docs */
  enableSwagger?: boolean;
  /** Log level (default: info) */
  logLevel?: string;
}

/**
 * Create and configure the Fastify API server
 */
export async function createServer(config: ApiServerConfig = {}) {
  const port = config.port ?? 3000;
  const host = config.host ?? "0.0.0.0";

  const app = fastify({
    logger: { level: config.logLevel ?? "info" },
  });

  // Register plugins
  await app.register(cors, {
    origin: config.corsOrigin ?? true,
  });

  await app.register(sensible);

  await app.register(rateLimit, {
    max: config.rateLimitMax ?? 100,
    timeWindow: config.rateLimitWindow ?? 60000,
  });

  if (config.jwtSecret) {
    await app.register(jwt, {
      secret: config.jwtSecret,
    });
  }

  if (config.enableSwagger !== false) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "TestForge AI API",
          description: "REST + GraphQL API for AI-powered test automation",
          version: "0.1.0",
        },
        servers: [{ url: `http://localhost:${port}` }],
      },
    });

    await app.register(swaggerUi, {
      routePrefix: "/docs",
      uiConfig: { docExpansion: "list" },
    });
  }

  // Register WebSocket support
  await app.register(websocket);
  registerWebSocket(app);

  // Register auth hooks and global error handler
  if (config.jwtSecret) {
    registerAuth(app);
  }

  // Register REST routes
  await registerRoutes(app, config);

  // Health check
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    uptime: Math.floor(process.uptime()),
  }));

  return { app, port, host };
}

/**
 * Start the API server
 */
export async function startServer(config: ApiServerConfig = {}) {
  const { app, port, host } = await createServer(config);

  try {
    await app.listen({ port, host });
    log(`TestForge AI API server listening on http://${host}:${port}`);
    log(`Swagger UI available at http://${host}:${port}/docs`);
    return app;
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

// Start server if run directly
if (process.argv[1]?.includes("server")) {
  startServer({
    jwtSecret: process.env.JWT_SECRET,
    redisUrl: process.env.REDIS_URL,
    enableSwagger: true,
  });
}

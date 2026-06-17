import type { FastifyInstance } from "fastify";
import type { ApiServerConfig } from "../server.js";
import { registerProjectRoutes } from "./projects.js";
import { registerSuiteRoutes } from "./suites.js";
import { registerRunRoutes } from "./runs.js";
import { registerAiRoutes } from "./ai.js";
import { registerDeviceRoutes } from "./devices.js";
import { registerComplianceRoutes } from "./compliance.js";
import { registerReportRoutes } from "./reports.js";

/**
 * Register all REST API routes
 */
export async function registerRoutes(
  app: FastifyInstance,
  config: ApiServerConfig
): Promise<void> {
  // Projects
  await registerProjectRoutes(app);

  // Suites
  await registerSuiteRoutes(app);

  // Runs
  await registerRunRoutes(app);

  // AI endpoints
  await registerAiRoutes(app, config);

  // Devices
  await registerDeviceRoutes(app, config);

  // Compliance (EE)
  await registerComplianceRoutes(app);

  // Reports
  await registerReportRoutes(app);
}

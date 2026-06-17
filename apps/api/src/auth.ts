import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { UnauthorizedError, TestForgeError } from "./errors.js";
import debug from "debug";

const log = debug("testforge:api:auth");

/**
 * JWT payload structure
 */
export interface JwtPayload {
  /** User ID */
  sub: string;
  /** User email */
  email: string;
  /** User role */
  role: string;
  /** Organization ID */
  orgId?: string;
}

/**
 * Register JWT authentication hooks and error handler
 *
 * Call this after JWT plugin is registered. Adds:
 * - `authenticate` preHandler for protected routes
 * - Global error handler for TestForgeError
 */
export function registerAuth(app: FastifyInstance): void {
  // Decorate request with authenticated user
  app.decorateRequest("user", null as JwtPayload | null);

  // Global error handler for TestForgeError
  app.setErrorHandler((error: Error & { validation?: unknown; code?: string; statusCode?: number }, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof TestForgeError) {
      return reply.code(error.statusCode).send(error.toJSON());
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: error.message,
      });
    }

    // JWT verification errors
    if (error.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" || error.statusCode === 401) {
      return reply.code(401).send({
        error: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // Default error
    log("Unhandled error: %O", error);
    return reply.code(error.statusCode ?? 500).send({
      error: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  });
}

/**
 * Create an authenticate preHandler hook
 *
 * Use on routes that require JWT authentication:
 * ```ts
 * app.get("/api/projects", { preHandler: [authenticate] }, handler);
 * ```
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as JwtPayload;
    (request as FastifyRequest & { user: JwtPayload | null }).user = payload;
    log("Authenticated user: %s (%s)", payload.email, payload.sub);
  } catch {
    throw new UnauthorizedError();
  }
}

/**
 * Create a role-based authorization preHandler
 *
 * @param roles - Allowed roles (e.g. ["ADMIN", "USER"])
 */
export function authorize(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as FastifyRequest & { user: JwtPayload | null }).user;
    if (!user) {
      throw new UnauthorizedError();
    }
    if (!roles.includes(user.role)) {
      throw new UnauthorizedError(`Role '${user.role}' is not authorized. Required: ${roles.join(", ")}`);
    }
  };
}

/**
 * Generate a JWT token for a user
 */
export function signToken(
  app: FastifyInstance,
  payload: { sub: string; email: string; role: string; orgId?: string }
): string {
  return app.jwt.sign(payload, { expiresIn: "7d" });
}

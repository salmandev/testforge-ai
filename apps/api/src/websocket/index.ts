import type { FastifyInstance } from "fastify";
import debug from "debug";

const log = debug("testforge:api:websocket");

/**
 * WebSocket handler for live test execution streaming
 */
interface LiveSession {
  runId: string;
  clientId: string;
  socket: WebSocketSession;
  connectedAt: Date;
}

/**
 * WebSocket session abstraction
 */
interface WebSocketSession {
  send(data: string): void;
  readonly readyState: number;
}

/**
 * Active WebSocket sessions indexed by clientId
 */
const sessions = new Map<string, LiveSession>();

/**
 * Run-to-clients index for fast lookups
 */
const runSubscribers = new Map<string, Set<string>>();

/**
 * Register WebSocket routes for live streaming
 *
 * Endpoints:
 * - /ws — main WebSocket endpoint for live test execution streaming
 */
export function registerWebSocket(app: FastifyInstance): void {
  app.get("/ws", { websocket: true }, async (socket, req) => {
    log("WebSocket client connected from %s", req.headers["x-forwarded-for"] ?? req.socket.remoteAddress);

    const clientId = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Send welcome message
    socket.send(
      JSON.stringify({
        type: "connected",
        clientId,
        timestamp: new Date().toISOString(),
      })
    );

    // Handle incoming messages
    socket.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString()) as {
          type: string;
          runId?: string;
        };

        switch (message.type) {
          case "subscribe": {
            const runId = message.runId;
            if (!runId) {
              socket.send(JSON.stringify({ type: "error", message: "Missing runId" }));
              break;
            }

            sessions.set(clientId, {
              runId,
              clientId,
              socket: socket as unknown as WebSocketSession,
              connectedAt: new Date(),
            });

            // Add to run subscribers index
            if (!runSubscribers.has(runId)) {
              runSubscribers.set(runId, new Set());
            }
            runSubscribers.get(runId)!.add(clientId);

            log("Client %s subscribed to run %s", clientId, runId);
            socket.send(
              JSON.stringify({
                type: "subscribed",
                runId,
                message: "Subscribed to live updates",
              })
            );
            break;
          }

          case "unsubscribe": {
            const session = sessions.get(clientId);
            if (session) {
              const subs = runSubscribers.get(session.runId);
              subs?.delete(clientId);
              if (subs?.size === 0) runSubscribers.delete(session.runId);
            }
            sessions.delete(clientId);
            log("Client %s unsubscribed", clientId);
            socket.send(
              JSON.stringify({
                type: "unsubscribed",
                message: "Unsubscribed from live updates",
              })
            );
            break;
          }

          case "ping": {
            socket.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
            break;
          }

          default:
            socket.send(
              JSON.stringify({
                type: "error",
                message: `Unknown message type: ${message.type}`,
              })
            );
        }
      } catch (error) {
        log("WebSocket message error: %O", error);
        socket.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message format",
          })
        );
      }
    });

    // Handle disconnect
    socket.on("close", () => {
      const session = sessions.get(clientId);
      if (session) {
        const subs = runSubscribers.get(session.runId);
        subs?.delete(clientId);
        if (subs?.size === 0) runSubscribers.delete(session.runId);
      }
      sessions.delete(clientId);
      log("WebSocket client %s disconnected", clientId);
    });

    socket.on("error", (error: Error) => {
      log("WebSocket error for client %s: %O", clientId, error);
    });
  });
}

/**
 * Broadcast a message to all clients subscribed to a specific run
 *
 * Iterates through active WebSocket connections subscribed to
 * the given runId and sends the data as JSON.
 */
export function broadcastToRun(runId: string, data: Record<string, unknown>): void {
  const subscriberIds = runSubscribers.get(runId);
  if (!subscriberIds || subscriberIds.size === 0) {
    log("No subscribers for run %s", runId);
    return;
  }

  const payload = JSON.stringify(data);
  let sent = 0;

  for (const clientId of subscriberIds) {
    const session = sessions.get(clientId);
    if (session && session.socket.readyState === 1 /* OPEN */) {
      try {
        session.socket.send(payload);
        sent++;
      } catch (error) {
        log("Failed to send to client %s: %O", clientId, error);
        // Clean up dead connection
        subscriberIds.delete(clientId);
        sessions.delete(clientId);
      }
    } else {
      // Clean up stale session
      subscriberIds.delete(clientId);
      sessions.delete(clientId);
    }
  }

  log("Broadcast to run %s: sent to %d/%d clients", runId, sent, subscriberIds.size);
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcastAll(data: Record<string, unknown>): void {
  const payload = JSON.stringify(data);
  let sent = 0;

  for (const [clientId, session] of sessions) {
    if (session.socket.readyState === 1) {
      try {
        session.socket.send(payload);
        sent++;
      } catch {
        sessions.delete(clientId);
      }
    }
  }

  log("Broadcast all: sent to %d clients", sent);
}

/**
 * Broadcast AI chat response to a specific client
 */
export function broadcastAiChat(clientId: string, data: Record<string, unknown>): void {
  const session = sessions.get(clientId);
  if (!session || session.socket.readyState !== 1) {
    log("AI chat: client %s not connected", clientId);
    return;
  }

  try {
    session.socket.send(JSON.stringify(data));
    log("AI chat response to %s", clientId);
  } catch (error) {
    log("Failed to send AI chat to %s: %O", clientId, error);
  }
}

/**
 * Get current connection stats
 */
export function getConnectionStats(): {
  totalConnections: number;
  activeRuns: number;
  subscriptionsByRun: Record<string, number>;
} {
  const subscriptionsByRun: Record<string, number> = {};
  for (const [runId, subs] of runSubscribers) {
    subscriptionsByRun[runId] = subs.size;
  }

  return {
    totalConnections: sessions.size,
    activeRuns: runSubscribers.size,
    subscriptionsByRun,
  };
}
import type { FastifyInstance } from "fastify";
import debug from "debug";

const log = debug("testforge:api:websocket");

/**
 * WebSocket handler for live test execution streaming
 */
interface LiveSession {
  runId: string;
  clientId: string;
  connectedAt: Date;
}

/**
 * Active WebSocket sessions
 */
const sessions = new Map<string, LiveSession>();

/**
 * Register WebSocket routes for live streaming
 *
 * Endpoints:
 * - /ws — main WebSocket endpoint for live test execution streaming
 * - Device session video stream
 * - AI chat streaming
 */
export function registerWebSocket(app: FastifyInstance): void {
  app.get("/ws", { websocket: true }, async (socket, req) => {
    log("WebSocket client connected from %s", req.headers["x-forwarded-for"] ?? req.socket.remoteAddress);

    const clientId = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Send welcome message
    socket.send(
      JSON.stringify({
        type: "connected",
        clientId,
        timestamp: new Date().toISOString(),
      })
    );

    // Handle incoming messages
    socket.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "subscribe":
            // Subscribe to a test run's live updates
            const runId = message.runId as string;
            sessions.set(clientId, {
              runId,
              clientId,
              connectedAt: new Date(),
            });
            log("Client %s subscribed to run %s", clientId, runId);

            socket.send(
              JSON.stringify({
                type: "subscribed",
                runId,
                message: "Subscribed to live updates",
              })
            );
            break;

          case "unsubscribe":
            sessions.delete(clientId);
            log("Client %s unsubscribed", clientId);
            socket.send(
              JSON.stringify({
                type: "unsubscribed",
                message: "Unsubscribed from live updates",
              })
            );
            break;

          default:
            socket.send(
              JSON.stringify({
                type: "error",
                message: `Unknown message type: ${message.type}`,
              })
            );
        }
      } catch (error) {
        log("WebSocket message error: %O", error);
        socket.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message format",
          })
        );
      }
    });

    // Handle disconnect
    socket.on("close", () => {
      sessions.delete(clientId);
      log("WebSocket client %s disconnected", clientId);
    });

    socket.on("error", (error) => {
      log("WebSocket error for client %s: %O", clientId, error);
    });
  });
}

/**
 * Broadcast a message to all clients subscribed to a specific run
 */
export function broadcastToRun(runId: string, data: Record<string, unknown>): void {
  // In production, this would iterate through active WebSocket connections
  // and send the data to subscribed clients
  log("Broadcasting to run %s: %O", runId, data);
}

/**
 * Broadcast AI chat response to a client
 */
export function broadcastAiChat(clientId: string, data: Record<string, unknown>): void {
  log("AI chat response to %s: %O", clientId, data);
}

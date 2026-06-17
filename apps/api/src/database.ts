import debug from "debug";

const log = debug("testforge:api:database");

/**
 * Prisma client singleton
 *
 * Lazy-initialized to avoid requiring Prisma client at import time
 * (allows running without DB in development/testing).
 */
let _prisma: PrismaClientLike | null = null;

// Minimal PrismaClient type (avoids requiring @prisma/client at type level)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClientLike = any;

/**
 * Get the Prisma client singleton
 *
 * Creates the client on first call. Throws if DATABASE_URL is not set.
 */
export function getDb(): PrismaClientLike {
  if (_prisma) return _prisma;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log("DATABASE_URL not set — database operations will not be available");
    return null;
  }

  try {
    // Dynamic import to avoid hard dependency on @prisma/client
    // In production, install @prisma/client and run `npx prisma generate`
    const { PrismaClient } = require("@prisma/client") as {
      PrismaClient: new (opts: { datasources?: { db: { url: string } }; log: string[] }) => PrismaClientLike;
    };

    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });

    log("Prisma client initialized");
    return _prisma;
  } catch {
    log("@prisma/client not installed or not generated. Install it and run: npx prisma generate");
    return null;
  }
}

/**
 * Disconnect the Prisma client (for graceful shutdown)
 */
export async function disconnectDb(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
    log("Database disconnected");
  }
}

/**
 * In-memory fallback store for development without database
 */
export class InMemoryStore<T extends { id: string }> {
  private _data = new Map<string, T>();

  create(item: T): T {
    this._data.set(item.id, item);
    return item;
  }

  findById(id: string): T | undefined {
    return this._data.get(id);
  }

  findAll(filter?: Partial<T>): T[] {
    let items = Array.from(this._data.values());
    if (filter) {
      items = items.filter((item) => {
        for (const [key, value] of Object.entries(filter)) {
          if (item[key as keyof T] !== value) return false;
        }
        return true;
      });
    }
    return items;
  }

  update(id: string, updates: Partial<T>): T | undefined {
    const existing = this._data.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this._data.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this._data.delete(id);
  }

  count(): number {
    return this._data.size;
  }

  clear(): void {
    this._data.clear();
  }
}

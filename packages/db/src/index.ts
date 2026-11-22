import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// ---------------------------------------------------------------
// Environment-aware database client (lazily initialized at runtime)
// ---------------------------------------------------------------

export function isNeonDatabaseUrl(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    return (
      hostname.endsWith(".neon.tech") ||
      hostname.endsWith(".neon.build") ||
      hostname.endsWith(".neon.database")
    );
  } catch {
    return false;
  }
}

export function createDb(databaseUrl = process.env.DATABASE_URL, nodeEnv = process.env.NODE_ENV) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (nodeEnv === "production" && isNeonDatabaseUrl(databaseUrl)) {
    // Let drizzle-orm/neon-serverless instantiate Pool directly so
    // NeonSession's `this.client instanceof Pool` check uses the exact
    // same ESM Pool class (avoids CJS/ESM dual-package mismatch).
    const neonDb = drizzleNeon({
      connection: {
        connectionString: databaseUrl,
        max: 5,
        idleTimeoutMillis: 20_000,
        connectionTimeoutMillis: 15_000,
        allowExitOnIdle: true,
      },
      schema,
    });
    neonDb.$client.on("error", (err: unknown) => {
      console.error("[db] Unexpected idle Neon pool client error:", err);
    });
    return neonDb;
  }

  const postgres = require("postgres") as typeof import("postgres");
  const client =
    nodeEnv === "production"
      ? postgres(databaseUrl, {
          prepare: false,
          max: 5,
          idle_timeout: 20,
          connect_timeout: 15,
        })
      : postgres(databaseUrl);
  return drizzlePostgres(client, { schema });
}

type DbClient = ReturnType<typeof createDb>;

let cachedDb: DbClient | undefined;

export function getDb(): DbClient {
  if (!cachedDb) {
    cachedDb = createDb();
  }
  return cachedDb;
}

export const db: DbClient = new Proxy({} as DbClient, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_target, prop) {
    return Reflect.has(getDb(), prop);
  },
  ownKeys() {
    return Reflect.ownKeys(getDb());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getDb(), prop);
  },
});

export * from "./formula-codec";
export * from "./org-initializer";
export * from "./permissions-registry";
// ---------------------------------------------------------------
// Schema re-exports
// ---------------------------------------------------------------
export * from "./schema";
export * from "./seed-agency-templates";

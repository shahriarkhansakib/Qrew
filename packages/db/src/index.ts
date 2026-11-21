import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// ---------------------------------------------------------------
// Environment-aware database client (lazily initialized at runtime)
// ---------------------------------------------------------------

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (process.env.NODE_ENV === "production") {
    const { neon } = require("@neondatabase/serverless");
    const sql = neon(databaseUrl);
    return drizzleNeon(sql, { schema });
  }

  const postgres = require("postgres");
  const client = postgres(databaseUrl);
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

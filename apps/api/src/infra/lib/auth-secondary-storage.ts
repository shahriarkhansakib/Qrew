import type { SecondaryStorage } from "better-auth";

export interface SecondaryStorageRedisClient {
  get: (key: string) => Promise<string | null>;
  set: (key: string, val: string, ex?: "EX", ttl?: number) => Promise<unknown>;
  del: (key: string) => Promise<number>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, ttl: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
}

/**
 * Builds Better Auth's SecondaryStorage adapter on top of our Redis client.
 * Properly interprets `increment(key, ttl)`'s second parameter as TTL (seconds),
 * sets expiration on window creation, and self-heals stuck keys missing a TTL.
 */
export function createSecondaryStorage(client: SecondaryStorageRedisClient): SecondaryStorage {
  return {
    get: async (key) => {
      const value = await client.get(key);
      return value ?? null;
    },
    set: async (key, value, ttl) => {
      if (ttl !== undefined && ttl > 0) {
        await client.set(key, value, "EX", ttl);
      } else {
        await client.set(key, value);
      }
    },
    delete: async (key) => {
      await client.del(key);
    },
    getAndDelete: async (key) => {
      const value = await client.get(key);
      if (value !== null && value !== undefined) {
        await client.del(key);
      }
      return value ?? null;
    },
    increment: async (key, ttl) => {
      const count = await client.incr(key);
      if (ttl > 0) {
        if (count === 1) {
          await client.expire(key, ttl);
        } else if ((await client.ttl(key)) === -1) {
          // Self-heal keys created without TTL by the previous incrby bug
          await client.set(key, "1", "EX", ttl);
          return 1;
        }
      }
      return count;
    },
  };
}

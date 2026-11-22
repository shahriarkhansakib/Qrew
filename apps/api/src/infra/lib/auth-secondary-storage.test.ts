import { describe, expect, it, vi } from "vitest";
import { createSecondaryStorage, type SecondaryStorageRedisClient } from "./auth-secondary-storage";

function createInMemoryRedisStub() {
  const store = new Map<string, { value: string; ttlSeconds: number }>();

  const client: SecondaryStorageRedisClient = {
    get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
    set: vi.fn(async (key: string, val: string, ex?: "EX", ttl?: number) => {
      store.set(key, { value: val, ttlSeconds: ex === "EX" && ttl ? ttl : -1 });
      return "OK";
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    incr: vi.fn(async (key: string) => {
      const existing = store.get(key);
      const next = (existing ? Number.parseInt(existing.value, 10) || 0 : 0) + 1;
      store.set(key, { value: String(next), ttlSeconds: existing ? existing.ttlSeconds : -1 });
      return next;
    }),
    expire: vi.fn(async (key: string, ttl: number) => {
      const existing = store.get(key);
      if (!existing) return 0;
      existing.ttlSeconds = ttl;
      return 1;
    }),
    ttl: vi.fn(async (key: string) => {
      const existing = store.get(key);
      return existing ? existing.ttlSeconds : -2;
    }),
  };

  return { store, client };
}

describe("auth-secondary-storage", () => {
  it("increments by 1 on first hit, sets expire(key, ttl), and returns 1", async () => {
    const { store, client } = createInMemoryRedisStub();
    const storage = createSecondaryStorage(client);

    const count = await storage.increment("ratelimit:ip|/sign-in/social", 10);

    expect(count).toBe(1);
    expect(client.incr).toHaveBeenCalledWith("ratelimit:ip|/sign-in/social");
    expect(client.expire).toHaveBeenCalledWith("ratelimit:ip|/sign-in/social", 10);
    expect(store.get("ratelimit:ip|/sign-in/social")?.ttlSeconds).toBe(10);
  });

  it("increments sequentially within the window without extending TTL", async () => {
    const { store, client } = createInMemoryRedisStub();
    const storage = createSecondaryStorage(client);

    expect(await storage.increment("ratelimit:ip|/sign-in/social", 10)).toBe(1);
    expect(await storage.increment("ratelimit:ip|/sign-in/social", 10)).toBe(2);
    expect(await storage.increment("ratelimit:ip|/sign-in/social", 10)).toBe(3);

    expect(client.expire).toHaveBeenCalledTimes(1);
    expect(store.get("ratelimit:ip|/sign-in/social")?.ttlSeconds).toBe(10);
  });

  it("self-heals keys left with no expiration (ttl === -1) from the prior incrby bug", async () => {
    const { store, client } = createInMemoryRedisStub();
    store.set("ratelimit:ip|/sign-in/social", { value: "10", ttlSeconds: -1 });
    const storage = createSecondaryStorage(client);

    const count = await storage.increment("ratelimit:ip|/sign-in/social", 10);

    expect(count).toBe(1);
    expect(client.set).toHaveBeenCalledWith("ratelimit:ip|/sign-in/social", "1", "EX", 10);
    expect(store.get("ratelimit:ip|/sign-in/social")).toEqual({ value: "1", ttlSeconds: 10 });
  });

  it("handles get, set (with and without TTL), delete, and getAndDelete preserving string values", async () => {
    const { client } = createInMemoryRedisStub();
    const storage = createSecondaryStorage(client);

    await storage.set("otp:user-1", "012345", 300);
    expect(client.set).toHaveBeenCalledWith("otp:user-1", "012345", "EX", 300);
    expect(await storage.get("otp:user-1")).toBe("012345");

    expect(await storage.getAndDelete("otp:user-1")).toBe("012345");
    expect(await storage.get("otp:user-1")).toBeNull();

    await storage.set("session:abc", '{"token":"xyz"}');
    expect(client.set).toHaveBeenCalledWith("session:abc", '{"token":"xyz"}');
    expect(await storage.get("session:abc")).toBe('{"token":"xyz"}');

    await storage.delete("session:abc");
    expect(await storage.get("session:abc")).toBeNull();
  });
});

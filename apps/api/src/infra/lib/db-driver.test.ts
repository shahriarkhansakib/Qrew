import { createDb, isNeonDatabaseUrl } from "@starter/db";
import { describe, expect, it } from "vitest";

describe("packages/db environment driver selection", () => {
  it("identifies pooled and direct Neon hostnames while excluding non-Neon and invalid URLs", () => {
    expect(
      isNeonDatabaseUrl(
        "postgresql://user:pass@ep-cool-123-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
      ),
    ).toBe(true);
    expect(
      isNeonDatabaseUrl("postgresql://user:pass@ep-cool-123.us-east-1.aws.neon.tech/neondb"),
    ).toBe(true);
    expect(isNeonDatabaseUrl("postgresql://user:pass@db.region.neon.build/neondb")).toBe(true);
    expect(isNeonDatabaseUrl("postgresql://user:pass@db.region.neon.database/neondb")).toBe(true);

    expect(isNeonDatabaseUrl("postgresql://user:pass@localhost:5432/starter_db")).toBe(false);
    expect(isNeonDatabaseUrl("postgresql://user:pass@db.supabase.co:5432/postgres")).toBe(false);
    expect(isNeonDatabaseUrl("not-a-valid-url")).toBe(false);
  });

  it("throws DATABASE_URL is not set when url is missing or empty", () => {
    const previousUrl = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      expect(() => createDb(undefined, "production")).toThrow("DATABASE_URL is not set.");
      expect(() => createDb("", "production")).toThrow("DATABASE_URL is not set.");
    } finally {
      if (previousUrl !== undefined) {
        process.env.DATABASE_URL = previousUrl;
      }
    }
  });

  it("uses transaction-capable neon-serverless Pool in production for Neon URLs", async () => {
    const client = createDb(
      "postgresql://user:pass@ep-cool-123-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
      "production",
    );

    try {
      expect(typeof (client.$client as { connect?: unknown }).connect).toBe("function");
      expect(typeof (client.$client as { on?: unknown }).on).toBe("function");
      expect(
        (client.$client as { listenerCount: (event: string) => number }).listenerCount("error"),
      ).toBeGreaterThanOrEqual(1);

      const session = (
        client as unknown as {
          _: { session: { constructor: { name: string }; transaction: () => unknown } };
        }
      )._.session;
      expect(session.constructor.name).toBe("NeonSession");
      expect(session.transaction.toString()).not.toContain("No transactions support");
    } finally {
      await (client.$client as { end: () => Promise<void> }).end();
    }
  });

  it("uses postgres-js for non-Neon URLs in production", async () => {
    const client = createDb("postgresql://user:pass@localhost:5432/db", "production");

    try {
      const session = (
        client as unknown as {
          _: { session: { constructor: { name: string } } };
        }
      )._.session;
      expect(session.constructor.name).toBe("PostgresJsSession");
      expect(session.constructor.name).not.toBe("NeonSession");
    } finally {
      await (client.$client as { end: (options?: { timeout?: number }) => Promise<void> }).end({
        timeout: 0,
      });
    }
  });
});

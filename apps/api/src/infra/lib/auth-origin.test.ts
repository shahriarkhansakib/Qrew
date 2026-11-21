import { resolveDynamicBaseURL } from "better-auth";
import { describe, expect, it } from "vitest";
import {
  buildAuthOriginConfig,
  extractHost,
  isLocalhostOrigin,
  normalizeOrigin,
  resolveAppOrigin,
} from "./auth-origin";

describe("auth-origin", () => {
  describe("helpers", () => {
    it("normalizes URLs and bare Vercel hostnames", () => {
      expect(normalizeOrigin('"https://qrew-six.vercel.app/"')).toBe("https://qrew-six.vercel.app");
      expect(normalizeOrigin("qrew-six.vercel.app")).toBe("https://qrew-six.vercel.app");
      expect(normalizeOrigin("http://localhost:5002/api/auth")).toBe("http://localhost:5002");
      expect(normalizeOrigin("")).toBeUndefined();
    });

    it("detects localhost and loopback origins", () => {
      expect(isLocalhostOrigin("http://localhost:3000")).toBe(true);
      expect(isLocalhostOrigin("http://localhost:5002")).toBe(true);
      expect(isLocalhostOrigin("http://127.0.0.1:5002")).toBe(true);
      expect(isLocalhostOrigin("http://[::1]:5002")).toBe(true);
      expect(isLocalhostOrigin("https://qrew-six.vercel.app")).toBe(false);
    });

    it("extracts hosts and wildcard patterns", () => {
      expect(extractHost("https://qrew-six.vercel.app/api/auth")).toBe("qrew-six.vercel.app");
      expect(extractHost("qrew-*.vercel.app")).toBe("qrew-*.vercel.app");
      expect(extractHost("localhost:*")).toBe("localhost:*");
    });
  });

  describe("Vercel Production environment", () => {
    it("ignores poisoned localhost env vars and resolves to Vercel production URL", () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "qrew-six.vercel.app",
        VERCEL_URL: "qrew-abc123-shahriar-khan-sakibs-projects.vercel.app",
        BETTER_AUTH_URL: "http://localhost:3000",
        NEXT_PUBLIC_APP_URL: "http://localhost:5002",
        BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3001,https://custom.qrew.app/",
      };

      const config = buildAuthOriginConfig(env);

      expect(config.isVercel).toBe(true);
      expect(config.fallbackOrigin).toBe("https://qrew-six.vercel.app");
      expect(resolveAppOrigin(env)).toBe("https://qrew-six.vercel.app");

      expect(config.allowedHosts).toContain("qrew-six.vercel.app");
      expect(config.allowedHosts).toContain("qrew-*.vercel.app");
      expect(config.allowedHosts).toContain("custom.qrew.app");
      expect(config.allowedHosts).not.toContain("localhost");
      expect(config.allowedHosts).not.toContain("localhost:*");
      expect(config.allowedHosts).not.toContain("localhost:3000");

      expect(config.trustedOrigins).toContain("https://qrew-six.vercel.app");
      expect(config.trustedOrigins).toContain("https://qrew-*.vercel.app");
      expect(config.trustedOrigins).toContain("https://custom.qrew.app");
      expect(config.trustedOrigins).not.toContain("http://localhost:3000");
      expect(config.trustedOrigins).not.toContain("http://localhost:5002");
      expect(config.trustedOrigins).not.toContain("http://localhost:3001");
    });
  });

  describe("Vercel Preview environment", () => {
    it("uses VERCEL_URL as fallback and allows preview wildcard hosts", () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "qrew-abc123.vercel.app",
        VERCEL_BRANCH_URL: "qrew-git-feature-shahriar.vercel.app",
      };

      const config = buildAuthOriginConfig(env);

      expect(config.isVercel).toBe(true);
      expect(config.fallbackOrigin).toBe("https://qrew-abc123.vercel.app");
      expect(config.allowedHosts).toContain("qrew-abc123.vercel.app");
      expect(config.allowedHosts).toContain("qrew-git-feature-shahriar.vercel.app");
      expect(config.allowedHosts).toContain("qrew-*.vercel.app");
      expect(config.trustedOrigins).toContain("https://qrew-abc123.vercel.app");
      expect(config.trustedOrigins).toContain("https://qrew-*.vercel.app");
    });
  });

  describe("Local development environment", () => {
    it("uses configured localhost URL and allows loopback hosts", () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: "development",
        BETTER_AUTH_URL: "http://localhost:5002",
        NEXT_PUBLIC_APP_URL: "http://localhost:5002",
      };

      const config = buildAuthOriginConfig(env);

      expect(config.isVercel).toBe(false);
      expect(config.fallbackOrigin).toBe("http://localhost:5002");
      expect(config.allowedHosts).toContain("localhost:5002");
      expect(config.allowedHosts).toContain("localhost");
      expect(config.allowedHosts).toContain("localhost:*");
      expect(config.trustedOrigins).toContain("http://localhost:5002");
    });
  });

  describe("Better Auth resolveDynamicBaseURL integration", () => {
    const prodConfig = buildAuthOriginConfig({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "qrew-six.vercel.app",
      BETTER_AUTH_URL: "http://localhost:3000",
    });

    const baseURLConfig = {
      allowedHosts: prodConfig.allowedHosts,
      fallback: prodConfig.fallbackOrigin,
      protocol: "https" as const,
    };

    it("resolves forwarded Vercel production host to https://qrew-six.vercel.app/api/auth", () => {
      const req = new Request("http://internal/api/auth/sign-in/social", {
        headers: {
          "x-forwarded-host": "qrew-six.vercel.app",
          "x-forwarded-proto": "https",
        },
      });

      const resolved = resolveDynamicBaseURL(baseURLConfig, req, "/api/auth", true);
      expect(resolved).toBe("https://qrew-six.vercel.app/api/auth");
    });

    it("rejects spoofed localhost x-forwarded-host and falls back to Vercel production URL", () => {
      const req = new Request("http://internal/api/auth/sign-in/social", {
        headers: {
          "x-forwarded-host": "localhost:3000",
          "x-forwarded-proto": "http",
        },
      });

      const resolved = resolveDynamicBaseURL(baseURLConfig, req, "/api/auth", true);
      expect(resolved).toBe("https://qrew-six.vercel.app/api/auth");
    });
  });
});

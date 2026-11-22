import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacesController } from "./workspaces.controller";

const {
  mockGetSession,
  mockOwnedCountSelect,
  mockTransaction,
  mockTxSlugLookup,
  mockTxInsertValues,
  mockSeedOrganizationDefaults,
} = vi.hoisted(() => {
  const mockGetSession = vi.fn();
  const mockOwnedCountSelect = vi.fn();
  const mockTransaction = vi.fn();
  const mockTxSlugLookup = vi.fn();
  const mockTxInsertValues = vi.fn();
  const mockSeedOrganizationDefaults = vi.fn();

  return {
    mockGetSession,
    mockOwnedCountSelect,
    mockTransaction,
    mockTxSlugLookup,
    mockTxInsertValues,
    mockSeedOrganizationDefaults,
  };
});

vi.mock("../../infra/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock("@starter/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => mockOwnedCountSelect(),
      }),
    }),
    transaction: mockTransaction,
  },
  organizations: { id: "id", name: "name", slug: "slug", createdAt: "createdAt" },
  members: {
    id: "id",
    organizationId: "organizationId",
    userId: "userId",
    role: "role",
    createdAt: "createdAt",
  },
  orgMemberRoles: { id: "id" },
  orgRoles: { id: "id" },
  users: { id: "id" },
  seedOrganizationDefaults: mockSeedOrganizationDefaults,
}));

function createMockContext(body: Record<string, unknown>) {
  return {
    req: {
      raw: { headers: new Headers() },
      json: async () => body,
    },
    json: (data: unknown, status = 200) => ({ data, status }),
  } as unknown as Parameters<typeof WorkspacesController.createWorkspace>[0];
}

describe("WorkspacesController.createWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetSession.mockResolvedValue({
      session: { id: "sess-1" },
      user: { id: "user-1", role: "user" },
    });
    mockOwnedCountSelect.mockResolvedValue([{ ownedCount: 0 }]);
    mockTxSlugLookup.mockResolvedValue([]);
    mockTxInsertValues.mockResolvedValue(undefined);
    mockSeedOrganizationDefaults.mockResolvedValue(undefined);

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => mockTxSlugLookup(),
            }),
          }),
        }),
        insert: (table: unknown) => ({
          values: (vals: unknown) => mockTxInsertValues(table, vals),
        }),
      };
      return await callback(tx);
    });
  });

  it("rejects missing or whitespace-only workspace name with 400", async () => {
    const emptyRes = (await WorkspacesController.createWorkspace(
      createMockContext({}),
    )) as unknown as {
      data: { error: string };
      status: number;
    };
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.data.error).toBe("Organization name is required");

    const whitespaceRes = (await WorkspacesController.createWorkspace(
      createMockContext({ name: "   \t\n  " }),
    )) as unknown as {
      data: { error: string };
      status: number;
    };
    expect(whitespaceRes.status).toBe(400);
    expect(whitespaceRes.data.error).toBe("Organization name is required");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("creates org with trimmed name and baseSlug when no slug collision exists, adds owner, and seeds defaults", async () => {
    mockTxSlugLookup.mockResolvedValueOnce([]);

    const res = (await WorkspacesController.createWorkspace(
      createMockContext({ name: "  org23  " }),
    )) as unknown as {
      data: { success: boolean; organizationId: string };
      status: number;
    };

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    const orgId = res.data.organizationId;
    expect(orgId).toMatch(/^[0-9a-f-]{36}$/);

    expect(mockTxInsertValues).toHaveBeenCalledTimes(2);
    expect(mockTxInsertValues.mock.calls[0]?.[1]).toMatchObject({
      id: orgId,
      name: "org23",
      slug: "org23",
    });
    expect(mockTxInsertValues.mock.calls[1]?.[1]).toMatchObject({
      organizationId: orgId,
      userId: "user-1",
      role: "owner",
    });
    expect(mockSeedOrganizationDefaults).toHaveBeenCalledTimes(1);
    expect(mockSeedOrganizationDefaults.mock.calls[0]?.[1]).toBe(orgId);
    expect(mockSeedOrganizationDefaults.mock.calls[0]?.[2]).toBe("user-1");
  });

  it("appends short orgId suffix when baseSlug already exists in organizations", async () => {
    mockTxSlugLookup.mockResolvedValueOnce([{ id: "existing-org-id" }]);

    const res = (await WorkspacesController.createWorkspace(
      createMockContext({ name: "org23" }),
    )) as unknown as {
      data: { success: boolean; organizationId: string };
      status: number;
    };

    expect(res.status).toBe(201);
    const orgId = res.data.organizationId;
    expect(mockTxInsertValues.mock.calls[0]?.[1]).toMatchObject({
      id: orgId,
      name: "org23",
      slug: `org23-${orgId.slice(0, 8)}`,
    });
  });

  it("falls back to workspace slug when name contains only non-alphanumeric characters", async () => {
    mockTxSlugLookup.mockResolvedValueOnce([]);

    const res = (await WorkspacesController.createWorkspace(
      createMockContext({ name: "!!!" }),
    )) as unknown as {
      data: { success: boolean; organizationId: string };
      status: number;
    };

    expect(res.status).toBe(201);
    expect(mockTxInsertValues.mock.calls[0]?.[1]).toMatchObject({
      name: "!!!",
      slug: "workspace",
    });
  });
});

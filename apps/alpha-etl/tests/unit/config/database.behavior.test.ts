import { describe, it, expect, vi } from "vitest";

describe("database configuration behaviors", () => {
  it("enables SSL when running in production", async () => {
    vi.resetModules();
    const PoolMock = vi.fn(() => {
      return { on: vi.fn(), connect: vi.fn(), end: vi.fn() };
    });

    vi.doMock("pg", () => ({ Pool: PoolMock }));
    vi.doMock("../../../src/config/environment.js", () => ({
      env: {
        DATABASE_URL: "postgres://test",
        NODE_ENV: "production",
        DB_SCHEMA: "public",
      },
    }));

    const db = await import("../../../src/config/database.js");
    db.createDbPool();

    expect(PoolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: { rejectUnauthorized: false },
      }),
    );

    vi.resetModules();
  });

  it("returns false when initial database check fails", async () => {
    vi.resetModules();
    const client = { query: vi.fn(), release: vi.fn() };
    vi.doMock("pg", () => ({
      Pool: vi.fn(() => {
        return {
          on: vi.fn(),
          connect: vi.fn().mockResolvedValue(client),
          end: vi.fn(),
        };
      }),
    }));
    vi.doMock("../../../src/config/environment.js", () => ({
      env: {
        DATABASE_URL: "postgres://test",
        NODE_ENV: "test",
        DB_SCHEMA: "public",
      },
    }));

    const db = await import("../../../src/config/database.js");
    client.query.mockRejectedValueOnce(new Error("query broke"));

    const ok = await db.testDatabaseConnection();
    expect(ok).toBe(false);

    vi.resetModules();
  });

  it("returns false when pingDatabase fails to connect", async () => {
    vi.resetModules();
    const client = { query: vi.fn(), release: vi.fn() };
    vi.doMock("pg", () => ({
      Pool: vi.fn(() => {
        return {
          on: vi.fn(),
          connect: vi.fn().mockResolvedValue(client),
          end: vi.fn(),
        };
      }),
    }));
    vi.doMock("../../../src/config/environment.js", () => ({
      env: {
        DATABASE_URL: "postgres://test",
        NODE_ENV: "test",
        DB_SCHEMA: "public",
      },
    }));

    const db = await import("../../../src/config/database.js");
    client.query.mockRejectedValueOnce(new Error("ping fail"));

    const ok = await db.pingDatabase();
    expect(ok).toBe(false);

    vi.resetModules();
  });
});

import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireDataLock } from "../scripts/backup-lib.js";

export interface Database {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function initDb(
  directory = process.env.DATA_DIR || "data/training",
): Promise<Database> {
  let db: Database;
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    db = {
      query: async <T = any>(sql: string, p: any[] = []) => ({
        rows: (await pool.query(sql, p)).rows as T[],
      }),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const tx: Database = {
            query: async <T = any>(s: string, p: any[] = []) => ({
              rows: (await c.query(s, p)).rows as T[],
            }),
            transaction: async (f) => f(tx),
            close: async () => {},
          };
          const r = await fn(tx);
          await c.query("COMMIT");
          return r;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
      close: async () => pool.end(),
    };
  } else {
    if (directory !== ":memory:") await mkdir(directory, { recursive: true });
    const release =
      directory === ":memory:" ? () => {} : acquireDataLock(directory);
    const p = new PGlite(directory === ":memory:" ? undefined : directory);
    try {
      await p.waitReady;
    } catch (error) {
      release();
      throw error;
    }
    db = {
      query: async (s, args = []) => p.query(s, args),
      transaction: async (fn) =>
        p.transaction(async (t) => {
          const tx: Database = {
            query: async (s, args = []) => t.query(s, args),
            transaction: async (f) => f(tx),
            close: async () => {},
          };
          return fn(tx);
        }),
      close: async () => {
        try {
          await p.close();
        } finally {
          release();
        }
      },
    };
  }
  const migrations = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "migrations",
  );
  try {
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz DEFAULT now())",
    );
    for (const file of (await readdir(migrations))
      .filter((n) => /^\d+.*\.sql$/.test(n))
      .sort()) {
      const version = Number(file.split("_")[0]);
      if (
        (
          await db.query(
            "SELECT version FROM schema_migrations WHERE version=$1",
            [version],
          )
        ).rows.length
      )
        continue;
      // Release migrations are immutable: the signed updater compares their bytes.
      // The historical 016 included a one-time data wipe, which must never run on
      // an existing installation. Apply only its schema changes through this
      // explicit replacement while retaining the original release file.
      const schemaPath = file === "016_live_empty_system.sql"
        ? path.join(migrations, "../migration-overrides/016_preserve_existing_data.sql")
        : path.join(migrations, file);
      const schema = await readFile(schemaPath, "utf8");
      await db.transaction(async (tx) => {
        for (const statement of schema
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean))
          await tx.query(statement);
        await tx.query(
          "INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING",
          [version],
        );
      });
    }
  } catch (error) {
    await db.close();
    throw error;
  }
  return db;
}
export async function one(
  db: Database,
  sql: string,
  args: any[] = [],
): Promise<any> {
  return (await db.query(sql, args)).rows[0];
}
export async function all(
  db: Database,
  sql: string,
  args: any[] = [],
): Promise<any[]> {
  return (await db.query(sql, args)).rows;
}

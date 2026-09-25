import { Client } from 'pg';

/** Server-level connection used to create/drop test databases. */
export function adminDatabaseUrl(): string {
  return (
    process.env.E2E_DATABASE_ADMIN_URL ?? 'postgresql://evcar:evcar_dev_pw@localhost:5432/postgres'
  );
}

export function databaseUrlFor(dbName: string): string {
  const url = new URL(adminDatabaseUrl());
  url.pathname = `/${dbName}`;
  return url.toString();
}

const SAFE_NAME = /^evcar_test_[a-z0-9_]+$/;

export async function withAdminClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: adminDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function createDatabase(dbName: string, template?: string): Promise<void> {
  if (!SAFE_NAME.test(dbName) || (template && !SAFE_NAME.test(template))) {
    throw new Error(`Refusing unsafe test database name ${dbName}`);
  }
  await withAdminClient(async (client) => {
    for (let attempt = 1; ; attempt++) {
      try {
        await client.query(
          `CREATE DATABASE "${dbName}"${template ? ` TEMPLATE "${template}"` : ''}`,
        );
        return;
      } catch (err) {
        // Concurrent clones of one template can transiently collide.
        if (attempt >= 10 || !/being accessed by other users/.test((err as Error).message))
          throw err;
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  });
}

export async function dropDatabase(dbName: string): Promise<void> {
  if (!SAFE_NAME.test(dbName)) throw new Error(`Refusing unsafe test database name ${dbName}`);
  await withAdminClient((client) =>
    client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`),
  );
}

export async function dropDatabasesWithPrefix(prefix: string): Promise<string[]> {
  if (!SAFE_NAME.test(prefix)) throw new Error(`Refusing unsafe prefix ${prefix}`);
  return withAdminClient(async (client) => {
    const { rows } = await client.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE datname LIKE $1',
      [`${prefix}%`],
    );
    for (const { datname } of rows) {
      await client
        .query(`ALTER DATABASE "${datname}" WITH ALLOW_CONNECTIONS true`)
        .catch(() => undefined);
      await client.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
    }
    return rows.map((r) => r.datname);
  });
}

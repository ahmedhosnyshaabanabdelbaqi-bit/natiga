// Entry points used by the Electron shell. The web build keeps using
// server/index.ts; this file only exposes the same pieces (database, setup,
// Express app) so the desktop process can start, stop and back them up safely.
import express from "express";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { initDb, one } from "./db.js";
import type { Database } from "./db.js";
import { createApp } from "./app.js";
import { setupSystem } from "./setup.js";

export { initDb, setupSystem };
export { backupDatabase, restoreDatabase } from "../scripts/backup-lib.js";
export type { Database };

export async function hasUsers(db: Database): Promise<boolean> {
  return Boolean(await one(db, "SELECT id FROM users LIMIT 1"));
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

export async function serve(
  db: Database,
  options: { staticDir: string; port: number; host?: string },
): Promise<RunningServer> {
  const app = await createApp(db);
  app.use(express.static(options.staticDir));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(options.staticDir, "index.html")),
  );
  const host = options.host || "127.0.0.1";
  // Try the preferred port first, then the next few, so a second program using
  // 4310 never stops the hospital system from opening.
  let server: Server | undefined;
  let port = options.port;
  for (let attempt = 0; attempt < 20 && !server; attempt++, port++) {
    server = await new Promise<Server | undefined>((resolve) => {
      // Not app.listen(): Express 5 also calls its callback on listen errors.
      const s = createServer(app);
      s.once("error", () => resolve(undefined));
      s.listen(port, host, () => resolve(s));
    });
  }
  if (!server) throw new Error("No free local port was found.");
  const running = server;
  return {
    port: port - 1,
    close: () =>
      new Promise<void>((resolve) => {
        running.close(() => resolve());
        running.closeAllConnections?.();
      }),
  };
}

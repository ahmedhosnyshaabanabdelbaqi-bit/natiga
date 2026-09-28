import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { initDb } from "./db.js";
import { createApp } from "./app.js";
import { seedDatabase } from "./seed.js";
const db = await initDb();
// Demo fixtures are opt-in. Restarts must never recreate deleted sample data.
if (process.env.SEED_DEMO_DATA === "true") await seedDatabase(db);
const app = await createApp(db);
if (
  process.env.NODE_ENV === "production" ||
  (existsSync("dist/index.html") && process.env.DEV_VITE !== "1")
) {
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 4310),
  host = process.env.HOST || "127.0.0.1";
const server = app.listen(port, host, () =>
  console.log(`مستشفى قصر المعادي — نظام التشغيل http://${host}:${port}`),
);
server.on("error", async (error) => {
  console.error(error);
  await db.close();
  process.exit(1);
});
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    server.close(() => {
      void db.close().then(() => process.exit(0));
    });
  });

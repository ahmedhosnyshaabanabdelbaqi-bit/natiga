import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { backupDatabase } from "./backup-lib.js";
if (process.env.DATABASE_URL)
  throw new Error(
    "External PostgreSQL requires pg_dump and the documented encrypted backup procedure.",
  );
const target = resolve(
  process.argv[2] ||
    `backups/nicu-${new Date().toISOString().replace(/[:.]/g, "-")}.enc`,
);
const passphrase = process.env.BACKUP_PASSPHRASE || "";
const result = await backupDatabase(
  resolve(process.env.DATA_DIR || "./data/training"),
  target,
  passphrase,
);
writeFileSync(
  `${target}.manifest.json`,
  JSON.stringify(
    { ...result, engine: "PGlite", encryption: "AES-256-GCM", format: 1 },
    null,
    2,
  ),
);
console.log(JSON.stringify(result, null, 2));

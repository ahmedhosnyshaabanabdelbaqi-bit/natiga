import { resolve } from "node:path";
import { restoreDatabase } from "./backup-lib.js";
if (!process.argv[2] || !process.argv[3])
  throw new Error(
    "Usage: npm run restore -- <backup.enc> <new-data-directory>",
  );
console.log(
  JSON.stringify(
    await restoreDatabase(
      resolve(process.argv[2]),
      resolve(process.argv[3]),
      process.env.BACKUP_PASSPHRASE || "",
    ),
    null,
    2,
  ),
);

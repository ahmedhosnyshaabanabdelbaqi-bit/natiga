import { initDb } from "../server/db.js";
import { setupSystem } from "../server/setup.js";

const password = process.env.INITIAL_ADMIN_PASSWORD;
if (!password || !process.env.HOSPITAL_NAME) {
  throw new Error("Set INITIAL_ADMIN_PASSWORD and HOSPITAL_NAME, then run npm run setup with the server stopped. INITIAL_ADMIN_USERNAME defaults to admin.");
}
const db = await initDb();
try {
  const result = await setupSystem(db, {
    username: process.env.INITIAL_ADMIN_USERNAME || "admin",
    password,
    hospitalName: process.env.HOSPITAL_NAME,
  });
  console.log(`Setup complete for ${result.hospital}. Administrator: ${result.username}. No demo records were created.`);
} finally {
  await db.close();
}

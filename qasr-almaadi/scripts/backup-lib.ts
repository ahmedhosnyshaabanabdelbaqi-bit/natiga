import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  lstatSync,
  type Stats,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { hostname } from "node:os";
import { PGlite } from "@electric-sql/pglite";

const magic = Buffer.from("QASRNICU1");
export function encryptBackup(data: Buffer, passphrase: string): Buffer {
  if (passphrase.length < 16)
    throw new Error("Backup passphrase must have at least 16 characters.");
  const salt = randomBytes(32),
    iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    scryptSync(passphrase, salt, 32),
    iv,
  );
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), ciphertext]);
}
export function decryptBackup(data: Buffer, passphrase: string): Buffer {
  if (!data.subarray(0, 9).equals(magic) || data.length < 70)
    throw new Error("Invalid backup format.");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    scryptSync(passphrase, data.subarray(9, 41), 32),
    data.subarray(41, 53),
  );
  cipher.setAuthTag(data.subarray(53, 69));
  return Buffer.concat([cipher.update(data.subarray(69)), cipher.final()]);
}
type LockSnapshot = { bytes: Buffer; stat: Stats };
function sameLockFile(a: Stats, b: Stats) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
    a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.birthtimeMs === b.birthtimeMs;
}
function lockSnapshot(path: string): LockSnapshot {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > 1024)
    throw new Error("Unrecognized database lock.");
  const bytes = readFileSync(path);
  const after = lstatSync(path);
  if (!sameLockFile(before, after)) throw new Error("Database lock changed.");
  return { bytes, stat: after };
}
function sameLock(a: LockSnapshot, b: LockSnapshot) {
  return sameLockFile(a.stat, b.stat) && a.bytes.equals(b.bytes);
}
type RecordedOwner = { pid: number; bootId?: string; startedTicks?: string };
function linuxProcessStart(pid: number): string {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  const end = stat.lastIndexOf(")");
  if (end < 0 || !stat.startsWith(`${pid} (`)) throw new Error("Invalid process identity.");
  const fields = stat.slice(end + 1).trim().split(/\s+/);
  const ticks = fields[19]; // starttime is field 22; fields[0] is state (field 3).
  if (!ticks || !/^[1-9][0-9]*$/.test(ticks)) throw new Error("Invalid process start time.");
  return ticks;
}
function linuxBootId(): string {
  const id = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  if (!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/.test(id)) throw new Error("Invalid boot identity.");
  return id;
}
function recordedOwner(bytes: Buffer): RecordedOwner | null {
  const text = bytes.toString("utf8").trim();
  let pid: unknown, bootId: string | undefined, startedTicks: string | undefined;
  if (/^[1-9][0-9]*$/.test(text)) pid = Number(text); // Existing releases wrote only the PID.
  else {
    try {
      const record = JSON.parse(text);
      if (![1, 2].includes(record.version) || record.host !== hostname() || !/^[a-f0-9]{32}$/.test(record.token)) return null;
      pid = record.pid;
      if (record.version === 2) {
        if (typeof record.bootId !== "string" || !/^[a-f0-9]{8}-[a-f0-9-]{27,}$/.test(record.bootId) || typeof record.startedTicks !== "string" || !/^[1-9][0-9]*$/.test(record.startedTicks)) return null;
        bootId = record.bootId;
        startedTicks = record.startedTicks;
      }
    } catch { return null; }
  }
  return typeof pid === "number" && Number.isInteger(pid) && pid > 0 && pid <= 2147483647 ? { pid, bootId, startedTicks } : null;
}
function definitelyStopped(owner: RecordedOwner) {
  try { process.kill(owner.pid, 0); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
  if (process.platform !== "linux" || !owner.bootId || !owner.startedTicks) return false;
  try {
    return linuxBootId() !== owner.bootId || linuxProcessStart(owner.pid) !== owner.startedTicks;
  } catch { return false; } // An inaccessible or changing process remains protected.
}
function removeOwnedLock(path: string, owned: LockSnapshot) {
  try {
    if (sameLock(owned, lockSnapshot(path))) unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
export function acquireDataLock(directory: string): () => void {
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, ".server-lock");
  const guardPath = resolve(directory, ".server-lock-recovery");
  const owner = JSON.stringify(process.platform === "linux"
    ? { version: 2, pid: process.pid, host: hostname(), token: randomBytes(16).toString("hex"), bootId: linuxBootId(), startedTicks: linuxProcessStart(process.pid) }
    : { version: 1, pid: process.pid, host: hostname(), token: randomBytes(16).toString("hex") });
  let guard: LockSnapshot | undefined;
  try {
    // Synchronous and exclusive: cooperating contenders cannot both reclaim the
    // same stale lock. An abandoned guard is intentionally never auto-removed.
    const guardFd = openSync(guardPath, "wx");
    try { writeFileSync(guardFd, owner); } finally { closeSync(guardFd); }
    guard = lockSnapshot(guardPath);
    if (existsSync(path)) {
      const previous = lockSnapshot(path);
      const previousOwner = recordedOwner(previous.bytes);
      if (previousOwner === null || !definitelyStopped(previousOwner)) throw new Error("Database owner may still be running.");
      const rechecked = lockSnapshot(path);
      if (!sameLock(previous, rechecked) || !definitelyStopped(previousOwner)) throw new Error("Database lock changed during recovery.");
      unlinkSync(path);
    }
    // Retain wx even under the guard: an older release or external contender
    // does not know about the guard and may have created its own lock meanwhile.
    const fd = openSync(path, "wx");
    try { writeFileSync(fd, owner); } finally { closeSync(fd); }
    const owned = lockSnapshot(path);
    if (!owned.bytes.equals(Buffer.from(owner))) throw new Error("Database lock ownership changed.");
    return () => removeOwnedLock(path, owned);
  } catch {
    throw new Error(
      "Database is locked. Stop its server before backup/restore. Live, inaccessible, invalid or changing locks require manual verification; only a verified stopped owner can be recovered automatically.",
    );
  } finally {
    if (guard) removeOwnedLock(guardPath, guard);
  }
}
export async function backupDatabase(
  dataDir: string,
  destination: string,
  passphrase: string,
) {
  if (
    !existsSync(resolve(dataDir, "PG_VERSION")) &&
    !existsSync(resolve(dataDir, "base"))
  )
    throw new Error("Existing database directory required.");
  if (existsSync(destination))
    throw new Error(
      "Backup destination already exists; choose a new filename.",
    );
  const release = acquireDataLock(dataDir);
  let db: PGlite | undefined;
  try {
    db = await PGlite.create(dataDir);
    const blob = await db.dumpDataDir("gzip");
    const encrypted = encryptBackup(
      Buffer.from(await blob.arrayBuffer()),
      passphrase,
    );
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, encrypted, { flag: "wx", mode: 0o600 });
    return {
      path: resolve(destination),
      bytes: encrypted.length,
      created_at: new Date().toISOString(),
    };
  } finally {
    await db?.close();
    release();
  }
}
export async function restoreDatabase(
  source: string,
  destination: string,
  passphrase: string,
) {
  if (existsSync(destination))
    throw new Error(
      "Restore destination must be a NEW directory. Existing databases are never overwritten.",
    );
  const plaintext = decryptBackup(readFileSync(source), passphrase);
  mkdirSync(dirname(destination), { recursive: true });
  // Claim this NEW destination before loading, so a concurrent restore cannot
  // initialize or overwrite the same directory after the existence check.
  mkdirSync(destination, { mode: 0o700 });
  const db = await PGlite.create({
    dataDir: destination,
    loadDataDir: new Blob([new Uint8Array(plaintext)]),
  });
  let restored = false;
  try {
    const tables = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'",
    );
    restored = true;
    return {
      path: resolve(destination),
      tables: tables.rows.map((r) => r.tablename),
      restored_at: new Date().toISOString(),
    };
  } finally {
    await db.close();
    // dumpDataDir includes the source backup process's .server-lock. It does
    // not represent a running server in this freshly restored directory.
    // Remove it only after validation succeeds and PGlite has fully closed.
    const inheritedLock = resolve(destination, ".server-lock");
    if (restored && existsSync(inheritedLock)) unlinkSync(inheritedLock);
  }
}

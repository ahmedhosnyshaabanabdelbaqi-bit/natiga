import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { acquireDataLock } from "../scripts/backup-lib.js";

const directory = () => mkdtempSync(join(tmpdir(), "hospital-lock-test-"));
async function exitedChildPid() {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { windowsHide: true, stdio: "ignore" });
  const pid = child.pid!;
  await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("close", code => code === 0 ? resolve() : reject(new Error(`Child exited ${code}`))); });
  assert.throws(() => process.kill(pid, 0), (error: any) => error.code === "ESRCH");
  return pid;
}

test("a verified exited legacy owner is recovered and the new lock has unique ownership", async () => {
  const folder = directory(), lock = join(folder, ".server-lock");
  writeFileSync(lock, String(await exitedChildPid()));
  const release = acquireDataLock(folder);
  const owner = JSON.parse(readFileSync(lock, "utf8"));
  assert.equal(owner.pid, process.pid);
  assert.match(owner.token, /^[a-f0-9]{32}$/);
  assert.equal(existsSync(join(folder, ".server-lock-recovery")), false);
  release();
  assert.equal(existsSync(lock), false);
});

test("live PID locks, uncertain PID access, invalid records and existing recovery guards are never removed", t => {
  const folder = directory(), lock = join(folder, ".server-lock"), guard = join(folder, ".server-lock-recovery");
  for (const content of [String(process.pid), "", "0", "-1", "not-a-pid", "{}", "2147483648", JSON.stringify({ version: 1, pid: 1, host: "another-host", token: "a".repeat(32) })]) {
    writeFileSync(lock, content);
    assert.throws(() => acquireDataLock(folder), /locked/);
    assert.equal(readFileSync(lock, "utf8"), content);
    assert.equal(existsSync(guard), false);
  }
  const mocked = t.mock.method(process, "kill", () => { const error = new Error("Access denied") as NodeJS.ErrnoException; error.code = "EPERM"; throw error; });
  writeFileSync(lock, "12345");
  assert.throws(() => acquireDataLock(folder), /locked/);
  assert.equal(readFileSync(lock, "utf8"), "12345");
  mocked.mock.restore();
  writeFileSync(guard, "an existing guard requires manual verification");
  assert.throws(() => acquireDataLock(folder), /locked/);
  assert.equal(readFileSync(lock, "utf8"), "12345");
  assert.equal(readFileSync(guard, "utf8"), "an existing guard requires manual verification");
});

test("a changed lock during PID verification is preserved", async t => {
  const folder = directory(), lock = join(folder, ".server-lock");
  const dead = await exitedChildPid();
  writeFileSync(lock, String(dead));
  const mocked = t.mock.method(process, "kill", () => {
    writeFileSync(lock, String(process.pid));
    const error = new Error("Process exited") as NodeJS.ErrnoException;
    error.code = "ESRCH";
    throw error;
  });
  assert.throws(() => acquireDataLock(folder), /locked/);
  assert.equal(readFileSync(lock, "utf8"), String(process.pid));
  assert.equal(existsSync(join(folder, ".server-lock-recovery")), false);
  mocked.mock.restore();
});

test("an old release callback cannot delete a later lock owned by the same process", () => {
  const folder = directory(), lock = join(folder, ".server-lock");
  const oldRelease = acquireDataLock(folder);
  const previous = readFileSync(lock, "utf8");
  renameSync(lock, join(folder, "saved-old-lock"));
  const newRelease = acquireDataLock(folder);
  const current = readFileSync(lock, "utf8");
  assert.notEqual(current, previous);
  oldRelease();
  assert.equal(readFileSync(lock, "utf8"), current);
  newRelease();
  assert.equal(existsSync(lock), false);
});

test("a Linux lock distinguishes a recycled PID by process start identity", { skip: process.platform !== "linux" }, () => {
  const folder = directory(), lock = join(folder, ".server-lock");
  const oldRelease = acquireDataLock(folder);
  const live = JSON.parse(readFileSync(lock, "utf8"));
  assert.equal(live.version, 2);
  assert.match(live.bootId, /^[a-f0-9-]+$/);
  assert.match(live.startedTicks, /^[1-9][0-9]*$/);
  assert.throws(() => acquireDataLock(folder), /locked/);
  const recycled = { ...live, startedTicks: live.startedTicks === "1" ? "2" : "1" };
  writeFileSync(lock, JSON.stringify(recycled));
  const newRelease = acquireDataLock(folder);
  assert.equal(JSON.parse(readFileSync(lock, "utf8")).pid, process.pid);
  oldRelease();
  assert.equal(existsSync(lock), true);
  newRelease();
  assert.equal(existsSync(lock), false);
});

test("a malformed process identity never clears a database lock", () => {
  const folder = directory(), lock = join(folder, ".server-lock");
  const malformed = JSON.stringify({ version: 2, pid: process.pid, host: "different-host", token: "a".repeat(32), bootId: "unknown", startedTicks: "0" });
  writeFileSync(lock, malformed);
  assert.throws(() => acquireDataLock(folder), /locked/);
  assert.equal(readFileSync(lock, "utf8"), malformed);
});

test("concurrent processes recover a dead lock with exactly one owner", { timeout: 30000 }, async t => {
  const folder = directory(), lock = join(folder, ".server-lock");
  writeFileSync(lock, String(await exitedChildPid()));
  const source = `import { acquireDataLock } from ${JSON.stringify(new URL("../scripts/backup-lib.ts", import.meta.url).href)};
    process.send({ready:true});
    process.once('message', () => {
      try {
        const release = acquireDataLock(process.argv[1]);
        process.send({acquired:true});
        process.once('message', () => { release(); process.exit(0); });
      } catch { process.send({acquired:false}); process.exit(0); }
    });`;
  const children: ChildProcess[] = [];
  t.after(() => { for (const child of children) if (child.exitCode === null) child.kill(); });
  const attempts = Array.from({ length: 4 }, () => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", source, folder], { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    children.push(child);
    let stderr = "";
    child.stderr?.on("data", bytes => { stderr += String(bytes); });
    const ready = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.on("message", (message: any) => { if (message.ready) resolve(); });
      child.once("exit", code => { if (code !== 0) reject(new Error(stderr || `Child exited ${code}`)); });
    });
    const result = new Promise<boolean>((resolve, reject) => {
      child.on("message", (message: any) => { if (typeof message.acquired === "boolean") resolve(message.acquired); });
      child.once("error", reject);
      child.once("exit", code => { if (code !== 0) reject(new Error(stderr || `Child exited ${code}`)); });
    });
    const exited = new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("close", code => code === 0 ? resolve() : reject(new Error(stderr || `Child exited ${code}`))); });
    return { child, ready, result, exited };
  });
  await Promise.all(attempts.map(attempt => attempt.ready));
  for (const attempt of attempts) attempt.child.send("acquire");
  const outcomes = await Promise.all(attempts.map(attempt => attempt.result));
  assert.equal(outcomes.filter(Boolean).length, 1);
  const winner = attempts[outcomes.findIndex(Boolean)];
  assert.equal(JSON.parse(readFileSync(lock, "utf8")).pid, winner.child.pid);
  winner.child.send("release");
  await Promise.all(attempts.map(attempt => attempt.exited));
  assert.equal(existsSync(lock), false);
  assert.equal(existsSync(join(folder, ".server-lock-recovery")), false);
});

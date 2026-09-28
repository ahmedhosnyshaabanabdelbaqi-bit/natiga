import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash";
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const template = readFileSync(new URL("../scripts/install-update-service.sh", import.meta.url), "utf8");
const original = template.match(/<<'COORDINATOR'\r?\n([\s\S]*?)\r?\nCOORDINATOR\r?\n/)?.[1];
assert.ok(original, "The installed coordinator must be extracted from the actual installer template");

function exercise(scenario: string) {
  const project = mkdtempSync(join(tmpdir(), "hospital-coordinator-test-"));
  const shellProject = project.replaceAll("\\", "/");
  writeFileSync(join(project, "install-request.json"), "{}");
  const globals = "PROJECT=/srv/projects/child.egsystem.net; APP=$PROJECT/app; ROOT=$PROJECT/updates";
  const entry = "[[ -f $ROOT/install-request.json ]] || exit 0";
  assert.ok(original!.includes(globals));
  assert.ok(original!.includes(entry));
  // Only orchestration is under test. Functions override every external service
  // or worker call before the actual coordinator entry point is reached.
  const stubs = `
SCENARIO=${quote(scenario)}
ROLLED_BACK=0
STARTS=0
run_phase(){
  printf 'phase:%s\\n' "$1" >> "$PROJECT/trace"
  case "$1" in
    apply) [[ $SCENARIO != apply-failure ]] ;;
    rollback) ROLLED_BACK=1 ;;
    verify-new) [[ $SCENARIO != health-failure ]] ;;
    verify-previous) [[ $SCENARIO != previous-health-failure ]] ;;
    *) return 0 ;;
  esac
}
systemctl(){
  printf 'service:%s\\n' "$1" >> "$PROJECT/trace"
  if [[ $1 == start ]]; then
    STARTS=$((STARTS+1))
    if [[ $SCENARIO == start-failure && $STARTS == 1 ]]; then return 1; fi
    if [[ $SCENARIO == previous-start-failure ]]; then return 1; fi
  fi
  return 0
}
sleep(){ :; }
`;
  const script = original!.replace(globals, `PROJECT=${quote(shellProject)}; APP=$PROJECT/app; ROOT=$PROJECT`).replace(entry, stubs + "\n" + entry);
  const result = spawnSync(bash, ["-s"], { input: script, encoding: "utf8", windowsHide: true, timeout: 15000 });
  if (result.error) throw result.error;
  return { status: result.status, trace: readFileSync(join(project, "trace"), "utf8").trim().split(/\r?\n/), stderr: result.stderr };
}

test("coordinator restores and verifies the previous release when systemctl start itself fails", { skip: !existsSync(bash) && "Bash is required to execute the real coordinator flow" }, () => {
  const result = exercise("start-failure");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.trace, ["phase:begin", "service:stop", "phase:apply", "service:start", "phase:health-failed", "service:stop", "phase:rollback", "service:start", "phase:verify-previous", "phase:recovered"]);
});

test("coordinator recovers from exhausted health checks and only marks a healthy new release successful", { skip: !existsSync(bash) && "Bash is required to execute the real coordinator flow" }, () => {
  const unhealthy = exercise("health-failure");
  assert.equal(unhealthy.status, 0, unhealthy.stderr);
  assert.equal(unhealthy.trace.filter(line => line === "phase:verify-new").length, 45);
  assert.ok(unhealthy.trace.includes("phase:rollback"));
  assert.equal(unhealthy.trace.at(-1), "phase:recovered");
  assert.equal(unhealthy.trace.includes("phase:success"), false);
  const success = exercise("success");
  assert.equal(success.status, 0, success.stderr);
  assert.equal(success.trace.at(-1), "phase:success");
  assert.equal(success.trace.includes("phase:rollback"), false);
});

test("coordinator does not report recovery if the previous service cannot start", { skip: !existsSync(bash) && "Bash is required to execute the real coordinator flow" }, () => {
  const result = exercise("previous-start-failure");
  assert.notEqual(result.status, 0);
  assert.ok(result.trace.includes("phase:rollback"));
  assert.equal(result.trace.includes("phase:recovered"), false);
});

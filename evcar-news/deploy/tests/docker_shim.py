#!/usr/bin/env python3
"""Test double for the `docker` CLI used by deploy/tests/local-e2e.sh.

It lets deploy/evcar.sh run its REAL code paths (backup, restore, restore-test,
create-owner, health, monitor...) on a machine without a Docker daemon:

  docker compose ... exec -T postgres <cmd>   → <cmd> on the host, with the
                                                container env mapped to the
                                                local PostgreSQL (TCP + .pgpass)
  docker compose ... exec -T api <cmd>        → <cmd> in backend/ with the API env
  docker compose ... run ... --entrypoint tar api ...
                                              → host tar on the test storage dir
  docker compose ... run ... api true         → emulates the image entrypoint
                                                (migrate deploy + reference seed)
  docker compose ... up/stop/restart/down     → starts/stops `node dist/main.js`
  docker compose ... run ... --entrypoint du api -sb /app/storage
                                              → host du on the test storage dir
  docker compose ... build                    → records localhost/evcar-*:$EVCAR_RELEASE
  docker compose ... config                   → the real docker compose CLI
  docker volume inspect evcar_storage         → the test storage dir (Mountpoint)
  docker image inspect/ls/rm                  → the recorded image list
  docker ps / inspect / info / rm             → answers from the shim state
SHIM_FAIL_MEDIA_EXTRACT=1 makes `run --entrypoint tar ... -x` fail (restore tests);
SHIM_TAR_CREATE_EXIT=N makes the archive step (`tar -cf`) exit with N.

Never use it outside tests. Redis FLUSHDB requests are refused (shared dev Redis).
"""
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request

REAL_DOCKER = os.environ.get("SHIM_REAL_DOCKER", "/usr/bin/docker")
STATE = os.environ["SHIM_STATE"]
BACKEND = os.environ["SHIM_BACKEND_DIR"]
PORT = os.environ.get("SHIM_API_PORT", "13000")
STORAGE = os.environ["SHIM_STORAGE"]
PG_HOST = os.environ.get("SHIM_PG_HOST", "localhost")
PG_PORT = os.environ.get("SHIM_PG_PORT", "5432")
PG_SUPER = os.environ["SHIM_PG_SUPERUSER"]
SERVICES = ("postgres", "redis", "api", "worker", "admin", "caddy", "mailpit")


def log(msg):
    with open(os.path.join(STATE, "calls.log"), "a") as f:
        f.write(msg + "\n")


def running_file(svc):
    return os.path.join(STATE, f"{svc}.running")


def pid_file():
    return os.path.join(STATE, "api.pid")


def api_alive():
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/v1/health/live", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def compose_config(global_args):
    out = subprocess.run([REAL_DOCKER, "compose", *global_args, "config", "--format", "json"],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def api_env(global_args, overrides=None):
    cfg = compose_config(global_args)
    env = {k: ("" if v is None else str(v)) for k, v in cfg["services"]["api"]["environment"].items()}
    src = cfg["services"]["postgres"]["environment"]
    env.update({
        "HOST": "127.0.0.1",
        "PORT": PORT,
        "DATABASE_URL": f"postgresql://{src['APP_DB_USER']}:{src['APP_DB_PASSWORD']}@{PG_HOST}:{PG_PORT}/{src['POSTGRES_DB']}",
        "REDIS_URL": os.environ.get("SHIM_REDIS_URL", "redis://localhost:6379/0"),
        "REDIS_KEY_PREFIX": os.environ.get("SHIM_REDIS_PREFIX", "deploytest:"),
        "BULLMQ_PREFIX": os.environ.get("SHIM_BULL_PREFIX", "deploytest-bull"),
        "STORAGE_LOCAL_ROOT": STORAGE,
        "JOBS_ENABLED": "false",
    })
    env.pop("NODE_OPTIONS", None)
    if overrides:
        env.update(overrides)
    base = {k: os.environ[k] for k in ("PATH", "HOME", "LANG") if k in os.environ}
    base.update(env)
    return base


def pg_env(global_args):
    cfg = compose_config(global_args)
    src = cfg["services"]["postgres"]["environment"]
    env = dict(os.environ)
    env.update({
        "POSTGRES_USER": PG_SUPER,
        "POSTGRES_DB": src["POSTGRES_DB"],
        "APP_DB_USER": src["APP_DB_USER"],
        "APP_DB_PASSWORD": src["APP_DB_PASSWORD"],
        "PGHOST": PG_HOST,
        "PGPORT": PG_PORT,
        "PGPASSFILE": os.path.join(STATE, "pgpass"),
    })
    env.pop("PGPASSWORD", None)
    env.pop("PGUSER", None)
    return env


def rewrite_port(args):
    return [a.replace("127.0.0.1:3000", f"127.0.0.1:{PORT}") for a in args]


def start_api(global_args):
    if api_alive():
        return
    env = api_env(global_args)
    # Emulate the image entrypoint of the api service (RUN_MIGRATIONS / RUN_REFERENCE_SEED=true).
    entrypoint(env, {"RUN_MIGRATIONS": "true", "RUN_REFERENCE_SEED": "true"})
    logf = open(os.path.join(STATE, "api.log"), "a")
    p = subprocess.Popen(["node", "dist/main.js"], cwd=BACKEND, env=env, stdout=logf, stderr=logf,
                         start_new_session=True)
    with open(pid_file(), "w") as f:
        f.write(str(p.pid))
    for _ in range(120):
        if api_alive():
            break
        if p.poll() is not None:
            break
        time.sleep(0.5)


def stop_api():
    try:
        pid = int(open(pid_file()).read().strip())
        os.killpg(pid, signal.SIGTERM)
        for _ in range(60):
            try:
                os.kill(pid, 0)
                time.sleep(0.25)
            except OSError:
                break
    except (FileNotFoundError, ValueError, ProcessLookupError, PermissionError):
        pass
    for f in (pid_file(), running_file("api")):
        if os.path.exists(f):
            os.remove(f)


def entrypoint(env, extra):
    e = dict(env)
    e.update(extra)
    if e.get("RUN_MIGRATIONS") == "true":
        subprocess.run(["node", "node_modules/prisma/build/index.js", "migrate", "deploy"], cwd=BACKEND,
                       env=e, check=True, stdout=sys.stderr)
    if e.get("RUN_REFERENCE_SEED") == "true":
        subprocess.run(["node", "dist/cli/seed.js"], cwd=BACKEND, env=e, check=True, stdout=sys.stderr)


def images_file():
    return os.path.join(STATE, "images.txt")


def images():
    try:
        return [l.strip() for l in open(images_file()) if l.strip()]
    except FileNotFoundError:
        return []


def save_images(lst):
    with open(images_file(), "w") as f:
        f.write("".join(i + "\n" for i in dict.fromkeys(lst)))


def mark(svc, on=True):
    f = running_file(svc)
    if on:
        open(f, "w").close()
    elif os.path.exists(f):
        os.remove(f)


def compose(argv):
    global_args = []
    i = 0
    while i < len(argv) and argv[i].startswith("-"):
        if argv[i] in ("--project-name", "-p", "--env-file", "-f", "--profile"):
            global_args += argv[i:i + 2]
            i += 2
        else:
            global_args.append(argv[i])
            i += 1
    sub, rest = argv[i], argv[i + 1:]
    log(f"compose {sub} {' '.join(rest)}")

    if sub == "config":
        os.execv(REAL_DOCKER, [REAL_DOCKER, "compose", *global_args, "config", *rest])

    if sub == "exec":
        rest = [a for a in rest if a != "-T"]
        svc, cmd = rest[0], rest[1:]
        if svc == "postgres":
            return subprocess.run(cmd, env=pg_env(global_args)).returncode
        if svc == "api":
            return subprocess.run(rewrite_port(cmd), cwd=BACKEND, env=api_env(global_args)).returncode
        if svc == "redis":
            print("[docker-shim] redis command NOT executed (shared dev Redis): " + " ".join(cmd), file=sys.stderr)
            return 0
        print(f"[docker-shim] exec on {svc} not supported", file=sys.stderr)
        return 1

    if sub == "run":
        env_over, entry, j = {}, None, 0
        while j < len(rest):
            a = rest[j]
            if a in ("--rm", "--no-deps", "-T"):
                j += 1
            elif a == "-e":
                k, _, v = rest[j + 1].partition("=")
                env_over[k] = v
                j += 2
            elif a == "--entrypoint":
                entry = rest[j + 1]
                j += 2
            else:
                break
        svc, args = rest[j], rest[j + 1:]
        if entry == "tar":
            args = [a.replace("/app/storage", STORAGE) for a in args]
            os.makedirs(STORAGE, exist_ok=True)
            if os.environ.get("SHIM_FAIL_MEDIA_EXTRACT") == "1" and "-xf" in args:
                sys.stdin.read()
                print("tar: simulated failure (SHIM_FAIL_MEDIA_EXTRACT)", file=sys.stderr)
                return 2
            rc = subprocess.run(["tar", *args]).returncode
            # SHIM_TAR_CREATE_EXIT=N: pretend the archive step ended with N
            # (1 = GNU tar "file changed as we read it", 2 = real failure).
            if rc == 0 and "-cf" in args and os.environ.get("SHIM_TAR_CREATE_EXIT"):
                return int(os.environ["SHIM_TAR_CREATE_EXIT"])
            return rc
        if entry == "du":
            args = [a.replace("/app/storage", STORAGE) for a in args]
            return subprocess.run(["du", *args]).returncode
        if svc == "api" and entry is None:
            env = api_env(global_args)
            entrypoint(env, env_over)
            return subprocess.run(args, cwd=BACKEND, env=env).returncode
        print(f"[docker-shim] run {rest} not supported", file=sys.stderr)
        return 1

    if sub == "up":
        svcs = [a for a in rest if not a.startswith("-")] or list(SERVICES)
        for s in svcs:
            if s != "api":
                mark(s)
        if "api" in svcs:
            start_api(global_args)
            mark("api", api_alive())
        return 0

    if sub in ("stop", "down"):
        svcs = [a for a in rest if not a.startswith("-")] or list(SERVICES)
        if "api" in svcs:
            stop_api()
        for s in svcs:
            if s not in ("postgres", "redis") or sub == "down":
                mark(s, False)
        return 0

    if sub == "restart":
        stop_api()
        start_api(global_args)
        mark("api", api_alive())
        return 0

    if sub == "build":
        svcs = [a for a in rest if not a.startswith("-")] or ["api", "admin"]
        rel = os.environ.get("EVCAR_RELEASE", "local")
        names = {"api": "localhost/evcar-backend", "admin": "localhost/evcar-admin"}
        save_images(images() + [f"{names[s]}:{rel}" for s in svcs if s in names])
        return 0
    if sub == "pull":
        return 0
    if sub == "ps":
        for s in SERVICES:
            print(f"{s}\t{'running' if os.path.exists(running_file(s)) else '-'}")
        return 0
    if sub == "logs":
        try:
            sys.stdout.write(open(os.path.join(STATE, "api.log")).read()[-4000:])
        except FileNotFoundError:
            pass
        return 0
    print(f"[docker-shim] compose {sub} not supported", file=sys.stderr)
    return 1


def main(argv):
    log("docker " + " ".join(argv))
    if not argv:
        return 1
    cmd = argv[0]
    if cmd == "compose":
        if argv[1:2] == ["version"]:
            print("2.40.0" if "--short" in argv else "Docker Compose version v2.40.0")
            return 0
        return compose(argv[1:])
    if cmd == "ps":
        svc = None
        for a in argv:
            if a.startswith("label=com.docker.compose.service="):
                svc = a.split("=", 2)[2]
        if svc is None:
            return 0
        if svc == "api":
            if api_alive():
                print("shim-api")
        elif os.path.exists(running_file(svc)):
            print(f"shim-{svc}")
        return 0
    if cmd == "inspect":
        fmt = argv[argv.index("-f") + 1] if "-f" in argv else ""
        cid = argv[-1]
        svc = cid.replace("shim-", "")
        up = api_alive() if svc == "api" else os.path.exists(running_file(svc))
        if ".State.Status" in fmt:
            print(f"{'running' if up else 'exited'} 0 false {'healthy' if up else 'unhealthy'}")
        elif "Health" in fmt:
            print(f"{'true' if up else 'false'} {'healthy' if up else 'unhealthy'}")
        else:
            print("true" if up else "false")
        return 0
    if cmd == "info":
        print(STATE)
        return 0
    if cmd == "volume":
        if len(argv) > 1 and argv[1] == "inspect":
            if argv[-1].endswith("_storage"):
                print(STORAGE)
                return 0
            return 1
        return 0
    if cmd == "image":
        op = argv[1] if len(argv) > 1 else ""
        if op == "inspect":
            return 0 if argv[-1] in images() else 1
        if op == "ls":
            for i in images():
                print(i)
            return 0
        if op == "rm":
            save_images([i for i in images() if i not in argv[2:]])
            return 0
        return 0
    if cmd in ("rm", "builder"):
        return 0
    if cmd == "version":
        print("shim")
        return 0
    print(f"[docker-shim] unsupported: {argv}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";

test(
  "attachments persist bytes, enforce case scope and accept late documents",
  { timeout: 120000 },
  async () => {
    delete process.env.DATABASE_URL;
    const db = await initDb(":memory:");
    const server = (await createApp(db, { seed: true })).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const cookies: Record<string, string> = {};
    async function request(
      role: string,
      method: string,
      path: string,
      body?: unknown,
    ) {
      return fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: base,
          ...(cookies[role] ? { Cookie: cookies[role] } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
    try {
      for (const role of ["doctor", "nurse", "reception"]) {
        const response = await request(role, "POST", "/api/login", {
          username: role,
          password: "Training@2026",
        });
        assert.equal(response.status, 200);
        cookies[role] = response.headers.get("set-cookie")!.split(";")[0];
      }
      const path = "/api/admissions/admission-1/attachments";
      const content = Buffer.from(
        "%PDF-1.4\n% SYNTHETIC TEST DOCUMENT\n%%EOF\n",
      );
      const body = {
        name: "تقرير مصطنع.pdf",
        mime: "application/pdf",
        content: content.toString("base64"),
        idempotency_key: "test-attachment-1",
      };
      const upload = await request("doctor", "POST", path, body);
      assert.equal(upload.status, 201);
      const metadata = await upload.json();
      assert.equal(metadata.size, content.length);
      assert.equal(metadata.actor_id, "doctor");
      assert.ok(!("content" in metadata));
      const replay = await request("doctor", "POST", path, body);
      assert.equal(replay.status, 201);
      assert.equal((await replay.json()).id, metadata.id);
      const list = await request("nurse", "GET", path);
      assert.equal(list.status, 200);
      assert.equal((await list.json()).length, 1);
      const downloadPath = `/api/attachments/${metadata.id}/download`;
      const download = await request("nurse", "GET", downloadPath);
      assert.equal(download.status, 200);
      assert.match(
        download.headers.get("content-disposition") || "",
        /^attachment;/,
      );
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), content);
      assert.equal(
        (
          await request("nurse", "POST", path, {
            ...body,
            idempotency_key: "nurse-forbidden",
          })
        ).status,
        403,
      );
      assert.equal((await request("reception", "GET", path)).status, 403);
      assert.equal(
        (await request("reception", "GET", downloadPath)).status,
        403,
      );
      assert.equal(
        (
          await request("doctor", "POST", path, {
            ...body,
            mime: "image/png",
            idempotency_key: "mismatched-signature",
          })
        ).status,
        400,
      );
      await db.query(
        "UPDATE admissions SET status='discharged',discharged_at=now() WHERE id='admission-1'",
      );
      const late = await request("doctor", "POST", path, {
        ...body,
        name: "مستند متأخر.pdf",
        idempotency_key: "late-document",
      });
      assert.equal(late.status, 201);
      await db.query(
        "UPDATE admissions SET doctor_id='manager',nurse_id='head_nurse' WHERE id='admission-1'",
      );
      assert.equal((await request("doctor", "GET", path)).status, 404);
      assert.equal((await request("nurse", "GET", downloadPath)).status, 404);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await db.close();
    }
  },
);

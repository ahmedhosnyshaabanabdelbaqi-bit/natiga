import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../server/db.js";
import { seedDatabase } from "../server/seed.js";
import { createApp } from "../server/app.js";
test(
  "print templates enforce scope and retired additional verification stays disabled",
  { timeout: 60000 },
  async (t) => {
    const db = await initDb(":memory:");
    await seedDatabase(db);
    const app = await createApp(db);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const address = server.address() as { port: number };
    const origin = `http://127.0.0.1:${address.port}`;
    let cookie = "";
    async function call(path: string, body?: unknown, expected = 200) {
      const r = await fetch(origin + "/api" + path, {
        method: body ? "POST" : "GET",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie")!.split(";")[0];
      assert.equal(r.status, expected, await r.clone().text());
      return r;
    }
    try {
      await call("/login", { username: "manager", password: "Training@2026" });
      await t.test(
        "Arabic identity print contains real barcode and matching admission",
        async () => {
          const html = await (
            await call("/print/wristband?admission_id=admission-1")
          ).text();
          assert.match(html, /<svg/);
          assert.match(html, /QM-2026-00101/);
          assert.match(html, /data-code="00001"/);
          assert.match(html, /dir="rtl"/);
          assert.match(html, /size:50mm 30mm/);
          assert.doesNotMatch(html, /بيانات مصطنعة|training/i);
          const bedLabel = await (await call("/print/bed-label?bed_id=bed-1")).text();
          assert.match(bedLabel, /data-code="00001"/);
          assert.match(bedLabel, /size:50mm 30mm/);
          const codes = await db.query("SELECT barcode_no FROM patients ORDER BY barcode_no LIMIT 3");
          assert.deepEqual(codes.rows.map((row: any) => row.barcode_no), [1, 2, 3]);
          const font = await call("/print-font");
          assert.ok(Number(font.headers.get("content-length")) > 1000);
          await call(
            "/print/sample?admission_id=admission-1&id=lab-2",
            undefined,
            404,
          );
          const sample = await (
            await call("/print/sample?admission_id=admission-1&id=lab-1")
          ).text();
          assert.match(sample, /<svg/);
          await call("/login", {
            username: "reception",
            password: "Training@2026",
          });
          await call("/print/nursing?admission_id=admission-1", undefined, 403);
          await call("/print/invoice?admission_id=admission-1", undefined, 403);
          await call("/print/wristband?admission_id=admission-1");
        },
      );
      await t.test(
        "attachments persist exact bytes and enforce clinical permissions and file signatures",
        async () => {
          await call("/login", {
            username: "doctor",
            password: "Training@2026",
          });
          const content = Buffer.from(
            "%PDF-1.4\n% Synthetic test attachment\n%%EOF",
          );
          const payload = {
            name: "وثيقة تدريب.pdf",
            mime: "application/pdf",
            content: content.toString("base64"),
            idempotency_key: "test-document-upload",
          };
          const first = await (
            await call("/admissions/admission-1/attachments", payload, 201)
          ).json();
          const replay = await (
            await call("/admissions/admission-1/attachments", payload, 201)
          ).json();
          assert.equal(first.id, replay.id);
          assert.equal(first.content, undefined);
          const downloaded = await call(
            "/attachments/" + first.id + "/download",
          );
          assert.match(
            downloaded.headers.get("content-disposition") || "",
            /^attachment;/,
          );
          assert.deepEqual(
            Buffer.from(await downloaded.arrayBuffer()),
            content,
          );
          await call(
            "/admissions/admission-1/attachments",
            {
              ...payload,
              content: Buffer.from("<script>bad</script>").toString("base64"),
              idempotency_key: "invalid-upload",
            },
            400,
          );
          await call("/login", {
            username: "reception",
            password: "Training@2026",
          });
          await call("/attachments/" + first.id + "/download", undefined, 403);
        },
      );
      await t.test(
        "additional verification endpoints are retired and sessions can still be revoked",
        async () => {
          await call("/login", {
            username: "admin",
            password: "Training@2026",
          });
          await call("/security/mfa/setup", { password: "Training@2026" }, 404);
          const security = await (await call("/security")).json();
          assert.equal(security.additional_verification, false);
          await call("/security/revoke-sessions", {});
          await call("/security", undefined, 401);
        },
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await db.close();
    }
  },
);

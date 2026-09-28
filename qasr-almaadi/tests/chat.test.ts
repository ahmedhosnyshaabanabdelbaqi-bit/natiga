import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, one } from "../server/db.js";
import { seedDatabase } from "../server/seed.js";
import { createApp } from "../server/app.js";

test(
  "department chat enforces sender identity, DM membership and read-only manager review",
  { timeout: 90000 },
  async (t) => {
    delete process.env.DATABASE_URL;
    const db = await initDb(":memory:");
    await seedDatabase(db);
    const server = (await createApp(db)).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const cookies: Record<string, string> = {};
    const key = () => randomUUID();
    async function req(
      role: string,
      method: string,
      path: string,
      body?: any,
      status = 200,
    ) {
      if (role !== "anonymous" && !cookies[role]) {
        const login = await fetch(origin + "/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ username: role, password: "Training@2026" }),
        });
        assert.equal(login.status, 200);
        cookies[role] = login.headers.get("set-cookie")!.split(";")[0];
      }
      const response = await fetch(origin + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(cookies[role] ? { Cookie: cookies[role] } : {}),
          "Accept-Language": "en",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      return result;
    }
    let dm: any;
    let lastBody: any;
    let lastMessage: any;
    try {
      await t.test(
        "authentication, safe colleagues and initially empty department group",
        async () => {
          await req("anonymous", "GET", "/api/chat", undefined, 401);
          const chat = await req("nurse", "GET", "/api/chat");
          assert.equal(chat.current_user_id, "nurse");
          assert.equal(chat.can_review, false);
          assert.equal(chat.conversations.length, 1);
          assert.equal(chat.conversations[0].id, "department");
          assert.equal(chat.conversations[0].message_count, 0);
          assert.equal(chat.conversations[0].can_send, true);
          assert.ok(
            chat.colleagues.every(
              (c: any) => Object.keys(c).sort().join(",") === "id,name,role",
            ),
          );
          assert.ok(!chat.colleagues.some((c: any) => c.id === "nurse"));
        },
      );
      await t.test(
        "direct pair is unique across repeated and reciprocal opens",
        async () => {
          const body = { recipient_id: "doctor", idempotency_key: key() };
          dm = await req("nurse", "POST", "/api/chat/conversations", body, 201);
          assert.equal(dm.kind, "direct");
          assert.equal(dm.can_send, true);
          assert.deepEqual(dm.participants.map((p: any) => p.id).sort(), [
            "doctor",
            "nurse",
          ]);
          const again = await req(
            "nurse",
            "POST",
            "/api/chat/conversations",
            body,
            201,
          );
          const reciprocal = await req(
            "doctor",
            "POST",
            "/api/chat/conversations",
            { recipient_id: "nurse", idempotency_key: key() },
            201,
          );
          assert.equal(again.id, dm.id);
          assert.equal(reciprocal.id, dm.id);
          await req(
            "nurse",
            "POST",
            "/api/chat/conversations",
            { recipient_id: "nurse", idempotency_key: key() },
            400,
          );
        },
      );
      await t.test(
        "all sender, role and actor spoof fields are rejected for create/send",
        async () => {
          for (const field of [
            "sender_id",
            "user_id",
            "actor",
            "role",
            "spoof_sender",
          ]) {
            await req(
              "manager",
              "POST",
              "/api/chat/conversations",
              {
                recipient_id: "nurse",
                idempotency_key: key(),
                [field]: "doctor",
              },
              400,
            );
            const error = await req(
              "manager",
              "POST",
              "/api/chat/conversations/department/messages",
              { text: "invalid", idempotency_key: key(), [field]: "doctor" },
              400,
            );
            assert.equal(error.code, "CHAT_FIELDS");
            assert.ok(!/[\u0600-\u06ff]/.test(error.error));
          }
          const group = await req(
            "manager",
            "POST",
            "/api/chat/conversations/department/messages",
            { text: "رسالة اختبار صريحة من المدير", idempotency_key: key() },
            201,
          );
          assert.equal(group.sender_id, "manager");
          assert.equal(group.sender_role, "manager");
        },
      );
      await t.test(
        "only own direct participants can send; managers review other DMs without reply",
        async () => {
          lastBody = { text: "ملاحظة زميل اختبار", idempotency_key: key() };
          lastMessage = await req(
            "nurse",
            "POST",
            `/api/chat/conversations/${dm.id}/messages`,
            lastBody,
            201,
          );
          assert.equal(lastMessage.sender_id, "nurse");
          for (const reviewer of ["manager", "admin"]) {
            const view = await req(
              reviewer,
              "GET",
              `/api/chat/conversations/${dm.id}/messages`,
            );
            assert.equal(view.conversation.can_send, false);
            assert.equal(view.conversation.is_participant, false);
            assert.equal(view.messages[0].sender_id, "nurse");
            const denied = await req(
              reviewer,
              "POST",
              `/api/chat/conversations/${dm.id}/messages`,
              lastBody,
              403,
            );
            assert.equal(denied.code, "CHAT_REVIEW_ONLY");
            await req(
              reviewer,
              "POST",
              `/api/chat/conversations/${dm.id}/messages`,
              { text: "رد غير مصرح", idempotency_key: key() },
              403,
            );
          }
          await req(
            "stock",
            "GET",
            `/api/chat/conversations/${dm.id}/messages`,
            undefined,
            404,
          );
          await req(
            "stock",
            "POST",
            `/api/chat/conversations/${dm.id}/messages`,
            { text: "غير مصرح", idempotency_key: key() },
            404,
          );
          const outsider = await req("stock", "GET", "/api/chat");
          assert.ok(!outsider.conversations.some((c: any) => c.id === dm.id));
          const own = await req(
            "manager",
            "POST",
            "/api/chat/conversations",
            { recipient_id: "nurse", idempotency_key: key() },
            201,
          );
          assert.equal(own.can_send, true);
          const sent = await req(
            "manager",
            "POST",
            `/api/chat/conversations/${own.id}/messages`,
            { text: "رسالة المدير في محادثته", idempotency_key: key() },
            201,
          );
          assert.equal(sent.sender_id, "manager");
        },
      );
      await t.test(
        "retries remain one message and recheck authorization before cached response",
        async () => {
          const duplicate = await req(
            "nurse",
            "POST",
            `/api/chat/conversations/${dm.id}/messages`,
            lastBody,
            201,
          );
          assert.equal(duplicate.id, lastMessage.id);
          await req(
            "nurse",
            "POST",
            `/api/chat/conversations/${dm.id}/messages`,
            { ...lastBody, text: "نص مختلف" },
            409,
          );
          await db.query(
            "UPDATE chat_conversations SET user_b='stock' WHERE id=$1",
            [dm.id],
          );
          await req(
            "nurse",
            "POST",
            `/api/chat/conversations/${dm.id}/messages`,
            lastBody,
            404,
          );
          await db.query(
            "UPDATE chat_conversations SET user_b='nurse' WHERE id=$1",
            [dm.id],
          );
          assert.equal(
            (await one(
              db,
              "SELECT count(*)::int n FROM chat_messages WHERE conversation_id=$1",
              [dm.id],
            ))!.n,
            1,
          );
        },
      );
      await t.test(
        "cursor pagination returns ascending windows without duplicates at equal timestamps",
        async () => {
          for (let i = 0; i < 5; i++)
            await req(
              "doctor",
              "POST",
              `/api/chat/conversations/${dm.id}/messages`,
              { text: `test-${i}`, idempotency_key: key() },
              201,
            );
          await db.query(
            "UPDATE chat_messages SET created_at='2026-09-01T12:00:00.123456Z' WHERE conversation_id=$1",
            [dm.id],
          );
          const newest = await req(
            "nurse",
            "GET",
            `/api/chat/conversations/${dm.id}/messages?limit=2`,
          );
          assert.equal(newest.has_more, true);
          assert.equal(newest.messages.length, 2);
          const middle = await req(
            "nurse",
            "GET",
            `/api/chat/conversations/${dm.id}/messages?limit=2&before=${newest.next_before}`,
          );
          const oldest = await req(
            "nurse",
            "GET",
            `/api/chat/conversations/${dm.id}/messages?limit=2&before=${middle.next_before}`,
          );
          assert.equal(oldest.has_more, false);
          assert.equal(oldest.next_before, null);
          const ids = [
            ...oldest.messages,
            ...middle.messages,
            ...newest.messages,
          ].map((m: any) => m.id);
          assert.equal(new Set(ids).size, 6);
          assert.deepEqual(ids, [...ids].sort());
          await req(
            "nurse",
            "GET",
            `/api/chat/conversations/${dm.id}/messages?limit=101`,
            undefined,
            400,
          );
          await req(
            "nurse",
            "GET",
            `/api/chat/conversations/${dm.id}/messages?before=invalid`,
            undefined,
            400,
          );
          await req(
            "nurse",
            "GET",
            `/api/chat/conversations/department/messages?before=${newest.next_before}`,
            undefined,
            400,
          );
        },
      );
      await t.test(
        "inactive colleagues and deactivated accounts cannot send; message content is not in audit details",
        async () => {
          await db.query("UPDATE users SET active=false WHERE id='doctor'");
          await req(
            "nurse",
            "POST",
            `/api/chat/conversations/${dm.id}/messages`,
            lastBody,
            409,
          );
          await req(
            "nurse",
            "POST",
            "/api/chat/conversations",
            { recipient_id: "doctor", idempotency_key: key() },
            404,
          );
          await req("doctor", "GET", "/api/chat", undefined, 401);
          const info = await req("nurse", "GET", "/api/chat");
          assert.ok(!info.colleagues.some((c: any) => c.id === "doctor"));
          assert.equal(
            info.conversations.find((c: any) => c.id === dm.id).can_send,
            false,
          );
          const audit = await one(
            db,
            "SELECT count(*)::int n FROM audit WHERE details::text LIKE '%ملاحظة زميل اختبار%'",
          );
          assert.equal(audit!.n, 0);
          await req(
            "nurse",
            "POST",
            "/api/chat/conversations/department/messages",
            { text: "   ", idempotency_key: key() },
            400,
          );
          await req(
            "nurse",
            "POST",
            "/api/chat/conversations/department/messages",
            { text: "x".repeat(4001), idempotency_key: key() },
            400,
          );
          await req(
            "nurse",
            "PATCH",
            `/api/chat/conversations/${dm.id}/messages`,
            { text: "edit" },
            404,
          );
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

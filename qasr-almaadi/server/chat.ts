import { all, one, type Database } from "./db.js";
import {
  audit,
  mutate,
  requireKey,
  uid,
  wrap,
  type Req,
  type RouteContext,
} from "./context.js";
import { ApiError, required } from "./security.js";
import { insert } from "./seed.js";

function validateBody(r: Req, allowed: string[]) {
  if (
    !r.body ||
    typeof r.body !== "object" ||
    Array.isArray(r.body) ||
    Object.keys(r.body).some((k) => !allowed.includes(k))
  )
    throw new ApiError(
      400,
      "حقول المحادثة غير مسموحة؛ هوية المرسل تحدد من الجلسة",
      "CHAT_FIELDS",
    );
  requireKey(r);
}
async function activeUser(db: Database, r: Req) {
  const user = await one(
    db,
    "SELECT id,name,role FROM users WHERE id=$1 AND active=true",
    [r.user.id],
  );
  if (!user) throw new ApiError(401, "يرجى تسجيل الدخول");
  return user;
}
const canReview = (user: any) => ["manager", "admin"].includes(user.role);
async function describe(db: Database, conversation: any, user: any) {
  const participants = await all(
    db,
    conversation.kind === "group"
      ? "SELECT id,name,role,active FROM users WHERE active=true ORDER BY name,id"
      : "SELECT id,name,role,active FROM users WHERE id=ANY($1::text[]) ORDER BY name,id",
    conversation.kind === "group"
      ? []
      : [[conversation.user_a, conversation.user_b]],
  );
  const participant =
    conversation.kind === "group" ||
    [conversation.user_a, conversation.user_b].includes(user.id);
  const counts = await one(
    db,
    "SELECT count(*)::int AS message_count,max(created_at) AS last_message_at FROM chat_messages WHERE conversation_id=$1",
    [conversation.id],
  );
  return {
    id: conversation.id,
    kind: conversation.kind,
    title:
      conversation.kind === "group"
        ? "محادثة القسم"
        : participants
            .filter((p) => p.id !== user.id)
            .map((p) => p.name)
            .join(" · "),
    participants,
    ...counts,
    is_participant: participant,
    can_send: participant && participants.every((p) => p.active),
    created_at: conversation.created_at,
  };
}
async function access(
  db: Database,
  r: Req,
  id: string,
  write = false,
  lock = false,
) {
  const user = await activeUser(db, r);
  const c = await one(
    db,
    "SELECT * FROM chat_conversations WHERE id=$1" +
      (lock ? " FOR UPDATE" : ""),
    [id],
  );
  if (!c) throw new ApiError(404, "المحادثة غير موجودة أو خارج صلاحياتك");
  const participant =
    c.kind === "group" || [c.user_a, c.user_b].includes(user.id);
  if (!participant && !canReview(user))
    throw new ApiError(404, "المحادثة غير موجودة أو خارج صلاحياتك");
  if (write && !participant)
    throw new ApiError(
      403,
      "صلاحية مراجعة المحادثة للقراءة فقط؛ لا يمكنك الإرسال باسم الآخرين",
      "CHAT_REVIEW_ONLY",
    );
  if (
    write &&
    c.kind === "direct" &&
    !(await one(db, "SELECT id FROM users WHERE id=$1 AND active=true", [
      c.user_a === user.id ? c.user_b : c.user_a,
    ]))
  )
    throw new ApiError(409, "الزميل غير نشط؛ لا يمكن إرسال رسالة جديدة");
  return { c, user };
}
function message(row: any) {
  const { cursor_time, ...safe } = row;
  return safe;
}
function cursor(row: any, conversation: string) {
  return Buffer.from(
    JSON.stringify({ conversation, at: row.cursor_time, id: row.id }),
  ).toString("base64url");
}
function parseCursor(raw: any, conversation: string) {
  if (raw === undefined) return null;
  try {
    if (
      typeof raw !== "string" ||
      raw.length > 800 ||
      !/^[A-Za-z0-9_-]+$/.test(raw)
    )
      throw 0;
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      value.conversation !== conversation ||
      typeof value.id !== "string" ||
      value.id.length > 100 ||
      typeof value.at !== "string" ||
      !Number.isFinite(Date.parse(value.at))
    )
      throw 0;
    return value;
  } catch {
    throw new ApiError(400, "مؤشر رسائل المحادثة غير صالح");
  }
}
export function chatRoutes({ app, db }: RouteContext) {
  app.get(
    "/api/chat",
    wrap(async (r, s) => {
      const user = await activeUser(db, r),
        review = canReview(user);
      const colleagues = await all(
        db,
        "SELECT id,name,role FROM users WHERE active=true AND id<>$1 ORDER BY name,id",
        [user.id],
      );
      const rows = await all(
        db,
        `SELECT c.* FROM chat_conversations c WHERE c.kind='group' OR $2::boolean OR c.user_a=$1 OR c.user_b=$1 ORDER BY (c.kind='group') DESC,(SELECT max(created_at) FROM chat_messages m WHERE m.conversation_id=c.id) DESC NULLS LAST,c.created_at DESC`,
        [user.id, review],
      );
      const conversations = [];
      for (const c of rows) conversations.push(await describe(db, c, user));
      s.json({
        current_user_id: user.id,
        can_review: review,
        colleagues,
        conversations,
      });
    }),
  );
  app.post(
    "/api/chat/conversations",
    wrap(async (r, s) => {
      validateBody(r, ["recipient_id", "idempotency_key"]);
      s.status(201).json(
        await db.transaction(async (tx) => {
          // Serialize creation/retries for this actor before checking the replay cache.
          await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
            r.user.id,
          ]);
          const user = await activeUser(tx, r),
            recipient = required(r.body.recipient_id, "الزميل");
          if (recipient === user.id)
            throw new ApiError(400, "اختر زميلًا آخر للمحادثة");
          if (
            !(await one(
              tx,
              "SELECT id FROM users WHERE id=$1 AND active=true",
              [recipient],
            ))
          )
            throw new ApiError(404, "الزميل غير موجود أو غير نشط");
          return mutate(tx, r, "chat_conversations", async (inner) => {
            const pair = [user.id, recipient].sort();
            await inner.query(
              "INSERT INTO chat_conversations(id,kind,user_a,user_b) VALUES($1,'direct',$2,$3) ON CONFLICT(user_a,user_b) DO NOTHING",
              [uid(), ...pair],
            );
            const c = await one(
              inner,
              "SELECT * FROM chat_conversations WHERE user_a=$1 AND user_b=$2",
              pair,
            );
            return describe(inner, c, user);
          });
        }),
      );
    }),
  );
  app.get(
    "/api/chat/conversations/:id/messages",
    wrap(async (r, s) => {
      const id = String(r.params.id),
        { c, user } = await access(db, r, id);
      const before = parseCursor(r.query.before, id);
      const raw = r.query.limit ?? "50";
      if (
        typeof raw !== "string" ||
        !/^\d+$/.test(raw) ||
        Number(raw) < 1 ||
        Number(raw) > 100
      )
        throw new ApiError(400, "عدد رسائل الصفحة يجب أن يكون بين 1 و100");
      const limit = Number(raw),
        args: any[] = [id, limit + 1];
      if (before) args.push(before.at, before.id);
      const rows = await all(
        db,
        `SELECT m.*,m.created_at::text AS cursor_time,u.name AS sender_name,u.role AS sender_role FROM chat_messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=$1 ${before ? "AND (m.created_at,m.id)<($3::timestamptz,$4::text)" : ""} ORDER BY m.created_at DESC,m.id DESC LIMIT $2`,
        args,
      );
      const more = rows.length > limit,
        window = rows.slice(0, limit).reverse();
      await audit(
        db,
        r,
        canReview(user) &&
          c.kind === "direct" &&
          ![c.user_a, c.user_b].includes(user.id)
          ? "review"
          : "read",
        "chat_conversations",
        id,
      );
      s.json({
        conversation: await describe(db, c, user),
        messages: window.map(message),
        has_more: more,
        next_before: more && window.length ? cursor(window[0], id) : null,
      });
    }),
  );
  app.post(
    "/api/chat/conversations/:id/messages",
    wrap(async (r, s) => {
      validateBody(r, ["text", "idempotency_key"]);
      const text = required(r.body.text, "نص الرسالة");
      if (text.length > 4000)
        throw new ApiError(400, "الرسالة تتجاوز 4000 حرف");
      s.status(201).json(
        await db.transaction(async (tx) => {
          const { c, user } = await access(
            tx,
            r,
            String(r.params.id),
            true,
            true,
          );
          // Authorization is deliberately before mutate: cached results cannot grant review-only users send access.
          return mutate(tx, r, "chat_messages", async (inner) => {
            const row = await insert(inner, "chat_messages", {
              id: uid(),
              conversation_id: c.id,
              sender_id: user.id,
              text,
            });
            return { ...row, sender_name: user.name, sender_role: user.role };
          });
        }),
      );
    }),
  );
}

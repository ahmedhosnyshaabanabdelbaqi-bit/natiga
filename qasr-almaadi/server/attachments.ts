import { all, one } from "./db.js";
import {
  audit,
  wrap,
  permit,
  admission,
  mutate,
  uid,
  requireKey,
  type RouteContext,
} from "./context.js";
import { ApiError, required } from "./security.js";
import { insert } from "./seed.js";

const allowed: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": (b) => b.subarray(0, 5).toString() === "%PDF-",
  "image/png": (b) =>
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  "image/jpeg": (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
};
export function attachmentRoutes({ app, db }: RouteContext) {
  app.get(
    "/api/admissions/:id/attachments",
    wrap(async (r, s) => {
      permit(r, "clinical.read");
      const a = await admission(db, r, String(r.params.id), false);
      s.json(
        await all(
          db,
          "SELECT id,admission_id,name,mime,size,actor_id,created_at FROM attachments WHERE admission_id=$1 ORDER BY created_at DESC",
          [a.id],
        ),
      );
    }),
  );
  app.post(
    "/api/admissions/:id/attachments",
    wrap(async (r, s) => {
      permit(r, "clinical.write");
      requireKey(r);
      s.status(201).json(
        await mutate(db, r, "attachments", async (tx) => {
          const a = await admission(tx, r, String(r.params.id), false),
            name = required(r.body.name, "اسم الملف"),
            mime = required(r.body.mime, "نوع الملف");
          if (!Object.hasOwn(allowed, mime))
            throw new ApiError(400, "الأنواع المدعومة PDF وPNG وJPEG فقط");
          const base64 = required(r.body.content, "محتوى الملف");
          if (
            base64.length > 7_000_000 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
          )
            throw new ApiError(400, "محتوى الملف غير صالح");
          const content = Buffer.from(base64, "base64");
          if (
            !content.length ||
            content.length > 5 * 1024 * 1024 ||
            !allowed[mime](content)
          )
            throw new ApiError(
              400,
              "محتوى الملف لا يطابق نوعه أو يتجاوز 5 ميجابايت",
            );
          const row = await insert(tx, "attachments", {
            id: uid(),
            admission_id: a.id,
            name: name.replace(/[\r\n\\/]/g, "_").slice(0, 160),
            mime,
            size: content.length,
            content,
            actor_id: r.user.id,
          });
          await audit(
            tx,
            r,
            "upload",
            "attachments",
            row.id,
            { name: row.name, size: row.size },
            a.patient_id,
          );
          const { content: _, ...metadata } = row;
          return metadata;
        }),
      );
    }),
  );
  app.get(
    "/api/attachments/:id/download",
    wrap(async (r, s) => {
      permit(r, "clinical.read");
      const row = await one(db, "SELECT * FROM attachments WHERE id=$1", [
        r.params.id,
      ]);
      if (!row) throw new ApiError(404, "المرفق غير موجود");
      const a = await admission(db, r, row.admission_id, false);
      await audit(
        db,
        r,
        "download",
        "attachments",
        row.id,
        { name: row.name },
        a.patient_id,
      );
      s.setHeader("Content-Type", row.mime);
      s.setHeader(
        "Content-Disposition",
        `attachment; filename="document.${row.mime === "application/pdf" ? "pdf" : row.mime === "image/png" ? "png" : "jpg"}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      );
      s.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      s.send(Buffer.from(row.content));
    }),
  );
}

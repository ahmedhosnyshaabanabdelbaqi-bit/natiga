# EV Car News — evcar.news

منصة للسيارات الكهربائية: أخبار، دليل سيارات ومواصفات، مقارنات، جولات داخلية 360°، ومحطات شحن.
تتكون من خادم **NestJS** وقاعدة **PostgreSQL + PostGIS**، ولوحة إدارة **React**، وتطبيق **Flutter** (Android وiOS).

An electric-vehicle platform: news, car catalog and specs, comparisons, 360° interior tours and charging stations — a **NestJS** API on **PostgreSQL + PostGIS**, a **React** admin panel and a **Flutter** app (Android + iOS).

> **الحالة / Status (2026-09-25):** المرحلة الأولى فقط مكتملة ومختبرة (الأساس، الحسابات، الصلاحيات، سجل التدقيق، الإعدادات، الأسواق، الترجمات، حالة النظام، هيكل التطبيق). بقية الميزات لم تبدأ بعد وتظهر كأقسام «قيد التنفيذ» دون بيانات.
> Only Phase 1 is done and tested (foundation, accounts, roles, audit log, settings, markets, translations, system status, app shell). Everything else is not started and shows as an honest "under construction" section with no data.
> See / راجع: [`docs/REQUIREMENTS_TRACKER.md`](docs/REQUIREMENTS_TRACKER.md).

| Folder | Content | Docs |
|---|---|---|
| `backend/` | NestJS 12 + Prisma 7 API (`/api/v1`, OpenAPI at `/api/docs`) | [`backend/README.md`](backend/README.md) |
| `admin/` | React 19 + Vite + Mantine admin panel (ar RTL / en LTR) | [`admin/README.md`](admin/README.md) |
| `mobile/` | Flutter 3.47 app (`news.evcar.app`) | [`mobile/README.md`](mobile/README.md) |
| `docs/` | Requirements (ar), architecture contract, decisions, tracker, screenshots | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |

---

## العربية — تشغيل سريع

### المتطلبات
- Node.js **22.22 أو أحدث** مع npm.
- PostgreSQL **16** مع PostGIS **3** (يُنشئ الترحيل الإضافات `postgis` و`pg_trgm` و`unaccent`؛ يلزم مستخدم يملك صلاحية إنشائها).
- Redis **7**.
- للتطبيق: Flutter **3.47** / Dart **3.13**، ومعهما Android SDK أو Xcode لتشغيله على جهاز أو محاكي.
- اختياري: Docker مع Docker Compose لتشغيل كل الخدمات (الملف `docker-compose.yml`؛ لم يُختبر في بيئة التطوير الحالية لعدم توفر Docker).

### ١. الإعداد
```sh
cp .env.example backend/.env
```
عدّل `backend/.env`: ضع `DATABASE_URL` و`REDIS_URL`، واملأ `JWT_ACCESS_SECRET` و`IP_HASH_SALT` بقيم عشوائية طويلة (مثل `openssl rand -base64 48`).
إذا تُركت فارغة في التطوير يولّد الخادم قيمًا مؤقتة، فتنتهي الجلسات عند كل إعادة تشغيل. في الإنتاج هي إلزامية.
المفاتيح الخارجية (Open Charge Map، المسارات، الإشعارات، Google/Apple…) اختيارية: إن غابت يعرض النظام حالة «غير مُهيأ» ولا يدّعي أنها تعمل.

### ٢. قاعدة البيانات
```sh
cd backend
npm ci
npm run prisma:deploy      # تطبيق الترحيلات
npm run db:seed            # البيانات المرجعية: الأسواق والعملات والأدوار والصلاحيات والإعدادات وأنواع الموصلات
# اختياري للتطوير فقط: npm run db:seed:demo   (بيانات تجريبية موسومة is_demo، ممنوعة في الإنتاج)
```

### ٣. إنشاء أول مالك (دون كلمة مرور ثابتة)
```sh
npm run create-owner -- --email you@example.com --name "اسمك"
```
يطبع الأمر رابطًا لمرة واحدة صالحًا 24 ساعة: `ADMIN_BASE_URL/setup-password?token=…`. افتحه في لوحة الإدارة واختر كلمة المرور.

### ٤. التشغيل
```sh
# الخادم (المنفذ 3000)
cd backend && npm run start:dev          # الواجهة: http://localhost:3000/api/v1 — التوثيق: http://localhost:3000/api/docs

# لوحة الإدارة (المنفذ 5173، توجّه /api إلى الخادم)
cd admin && npm ci && npm run dev        # http://localhost:5173

# التطبيق
cd mobile && flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1    # محاكي Android
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1   # محاكي iOS
```
أو عبر Docker: `docker compose up` (قاعدة البيانات وRedis وMinIO وMailpit والخادم ولوحة الإدارة).

### ٥. الاختبارات
```sh
cd backend && npm run lint && npm run build && npm test && npm run test:e2e   # e2e ينشئ قواعد بيانات مؤقتة خاصة به ثم يحذفها
cd admin   && npm run typecheck && npm run lint && npm test && npm run build
cd mobile  && flutter analyze && flutter test
```
بعد تغيير واجهات الخادم: `cd backend && npm run openapi:export` ثم `cd admin && npm run api:types`.

---

## English — quick start

### Prerequisites
- Node.js **≥ 22.22** with npm.
- PostgreSQL **16** + PostGIS **3** (the migration creates `postgis`, `pg_trgm`, `unaccent`; the DB role must be allowed to).
- Redis **7**.
- Mobile: Flutter **3.47** / Dart **3.13**, plus the Android SDK or Xcode to run on a device/emulator.
- Optional: Docker + Compose for the whole stack (`docker-compose.yml`; not run in this dev container, which has no Docker daemon).

### 1. Configure
```sh
cp .env.example backend/.env
```
Edit `backend/.env`: set `DATABASE_URL` and `REDIS_URL`, and fill `JWT_ACCESS_SECRET` and `IP_HASH_SALT` with long random values (e.g. `openssl rand -base64 48`).
If they stay empty in development the server generates ephemeral values and every restart signs everyone out; production refuses to start without them.
Every external key (Open Charge Map, routing, push, Google/Apple sign-in, S3, SMTP…) is optional: without it the feature reports "not configured" and never pretends to work. Every variable is documented in `.env.example`.

### 2. Database
```sh
cd backend
npm ci
npm run prisma:deploy      # apply migrations
npm run db:seed            # reference data: markets, currencies, roles/permissions, settings, connector types
# optional, development only: npm run db:seed:demo   (sample rows flagged is_demo; refused in production)
```

### 3. First owner (no hard-coded password)
```sh
npm run create-owner -- --email you@example.com --name "Your Name"
```
It prints a one-time link valid for 24 h: `ADMIN_BASE_URL/setup-password?token=…`. Open it in the admin panel and choose a password.

### 4. Run
```sh
# API (port 3000)
cd backend && npm run start:dev          # http://localhost:3000/api/v1 — Swagger UI: http://localhost:3000/api/docs

# Admin (port 5173, proxies /api to the API)
cd admin && npm ci && npm run dev        # http://localhost:5173

# Mobile app
cd mobile && flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1    # Android emulator
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1   # iOS simulator
```
Or with Docker: `docker compose up` (PostGIS, Redis, MinIO, Mailpit, API, admin).

### 5. Tests
```sh
cd backend && npm run lint && npm run build && npm test && npm run test:e2e   # e2e creates and drops its own databases
cd admin   && npm run typecheck && npm run lint && npm test && npm run build
cd mobile  && flutter analyze && flutter test
```
After changing API routes: `cd backend && npm run openapi:export`, then `cd admin && npm run api:types`.

Optional live contract check of the mobile networking code against a running API:
```sh
cd mobile && EVCAR_LIVE_API=http://localhost:3000/api/v1 \
  EVCAR_LIVE_EMAIL=you@example.com EVCAR_LIVE_PASSWORD='…' flutter test test/live
```

### Useful links
- API contract and conventions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (§4.3, §4.4.1)
- Product requirements (Arabic): [`docs/REQUIREMENTS_AR.md`](docs/REQUIREMENTS_AR.md)
- Version choices and design decisions: [`docs/decisions/`](docs/decisions/)
- Admin screenshots against the real API (ar/en): [`docs/screenshots/phase1/`](docs/screenshots/phase1/)

### Not available yet
No APK/AAB/IPA and no Docker image has been built in the development environment (no Android SDK, Xcode or Docker daemon). The deployment, admin and panorama guides listed in `docs/ARCHITECTURE.md` §9 are not written yet.

إرشادات العمل على هذا المستودع موجودة في [`CLAUDE.md`](CLAUDE.md).

باختصار قبل أي تعديل:

- **لا `float` في أي حساب مالي** — استخدم `App\Support\Money` و`Quantity`.
- **لا تغيّر رصيد مخزون أو خزنة مباشرة** — مرّ عبر `InventoryService` و`CashService`.
- **كل عملية مالية داخل معاملة واحدة**، والآثار الجانبية في `OutboxService`.
- **الصلاحيات تُطبَّق على الخادم**، لا بإخفاء الأزرار.
- شغّل `php artisan test` (يحتاج PostgreSQL) و`npm run typecheck` قبل التسليم.

للسياق المعماري: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
لحالة كل وحدة بصراحة: [`docs/STATUS.md`](docs/STATUS.md).

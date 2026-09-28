import { all, one, type Database } from './db.js';
import { mutate, permit, requireKey, uid, versioned, wrap, type Req, type RouteContext } from './context.js';
import { ApiError } from './security.js';
import { getLocale } from './i18n.js';
import { insert } from './seed.js';
import { assertMoneyAvailable, lockCashLedger, resolveMoneyAccount, treasuryErrorMessage } from './treasury.js';

const operators = ['admin', 'manager', 'head_nurse', 'maintenance'];
function reject(r: Req, status: number, ar: string, en: string, code = 'MAINTENANCE_ERROR'): never {
  throw new ApiError(status, getLocale(r) === 'en' ? en : ar, code);
}
function canManage(r: Req) { return operators.includes(r.user.role) && ['beds.write', 'operations.write'].some(p => r.user.permissions.includes(p)); }
function canFinance(r: Req, permission: string) { return !['doctor', 'nurse'].includes(r.user.role) && r.user.permissions.includes(permission); }
function manage(r: Req) { if (!canManage(r)) reject(r, 403, 'ليس لديك صلاحية إدارة الصيانة.', 'You do not have permission to manage maintenance.'); }
function finance(r: Req, permission: string) { permit(r, permission); if (!canFinance(r, permission)) reject(r, 403, 'مصروفات الصيانة خارج نطاق صلاحيات الحالات.', 'Maintenance expenses are outside case-scoped permissions.'); }
function fields(r: Req, names: string[]) {
  if (!r.body || typeof r.body !== 'object' || Array.isArray(r.body) || Object.keys(r.body).some(k => !names.includes(k))) reject(r, 400, 'تتضمن البيانات حقولًا غير مسموحة.', 'The request includes unsupported fields.');
  requireKey(r);
}
function text(r: Req, value: unknown, max: number, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) reject(r, 400, 'أكمل الحقول النصية ضمن الطول المسموح.', 'Complete the text fields within the allowed length.');
  return value.trim();
}
function due(r: Req, value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) reject(r, 400, 'موعد الصيانة غير صالح.', 'The maintenance due date is invalid.');
  return new Date(value).toISOString();
}
async function assignee(tx: Database, r: Req, value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const id = text(r, value, 100);
  if (!(await one(tx, 'SELECT id FROM users WHERE id=$1 AND active=true AND role=ANY($2::text[])', [id, operators]))) reject(r, 400, 'اختر مسؤول صيانة نشطًا من القائمة.', 'Choose an active maintenance assignee from the list.');
  return id;
}
async function target(tx: Database, r: Req, job: any) {
  const table = job.equipment_id ? 'equipment' : 'beds', id = job.equipment_id || job.bed_id;
  const row = await one(tx, `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
  if (!row) reject(r, 404, 'الجهاز أو الحضّانة غير موجود.', 'Equipment or bed not found.');
  return { table, row };
}
async function emptyBed(tx: Database, r: Req, bed: any) {
  if (['occupied', 'reserved'].includes(bed.status) || await one(tx, "SELECT id FROM admissions WHERE bed_id=$1 AND status='active'", [bed.id])) reject(r, 409, 'الحضّانة مشغولة أو محجوزة؛ انقل الطفل أو ألغِ الحجز أولًا.', 'The bed is occupied or reserved; transfer the infant or release the reservation first.', 'MAINTENANCE_BED_BUSY');
}
const expenseSelect = `SELECT x.*,m.name AS account_name,u.name AS actor_name,j.title AS job_title FROM maintenance_expenses x JOIN money_accounts m ON m.id=x.money_account_id JOIN users u ON u.id=x.actor_id JOIN maintenance_jobs j ON j.id=x.maintenance_job_id`;
export function maintenanceRoutes({ app, db }: RouteContext) {
  app.get('/api/maintenance', wrap(async (r, s) => {
    if (!canManage(r) && !canFinance(r, 'billing.read')) reject(r, 403, 'ليس لديك صلاحية عرض الصيانة.', 'You do not have permission to view maintenance.');
    const cost = canFinance(r, 'billing.read') ? ',(SELECT COALESCE(sum(x.amount),0) FROM maintenance_expenses x WHERE x.maintenance_job_id=j.id) AS expense_total' : '';
    const jobs = await all(db, `SELECT j.*,e.name AS equipment_name,e.code AS equipment_code,b.name AS bed_name,COALESCE(e.status,b.status) AS target_status,u.name AS assigned_name,c.name AS creator_name ${cost} FROM maintenance_jobs j LEFT JOIN equipment e ON e.id=j.equipment_id LEFT JOIN beds b ON b.id=j.bed_id LEFT JOIN users u ON u.id=j.assigned_to JOIN users c ON c.id=j.created_by ORDER BY (j.status='completed'),j.due_at,j.id LIMIT 1000`);
    s.json({ jobs, assets: await all(db, 'SELECT id,code,name,status,location,version FROM equipment ORDER BY name,code'), beds: await all(db, 'SELECT id,name,room,status,care_level,version FROM beds ORDER BY name'), assignees: await all(db, 'SELECT id,name,role FROM users WHERE active=true AND role=ANY($1::text[]) ORDER BY name', [operators]), can_manage: canManage(r), can_pay: canFinance(r, 'billing.write') });
  }));
  app.get('/api/maintenance/expenses', wrap(async (r, s) => { finance(r, 'billing.read'); s.json(await all(db, expenseSelect + ' ORDER BY x.created_at DESC,x.id DESC LIMIT 1000')); }));
  app.get('/api/maintenance/:id/expenses', wrap(async (r, s) => {
    finance(r, 'billing.read');
    if (!await one(db, 'SELECT id FROM maintenance_jobs WHERE id=$1', [r.params.id])) reject(r, 404, 'أمر الصيانة غير موجود.', 'Maintenance job not found.');
    s.json(await all(db, expenseSelect + ' WHERE x.maintenance_job_id=$1 ORDER BY x.created_at DESC,x.id DESC', [r.params.id]));
  }));
  app.post('/api/maintenance', wrap(async (r, s) => {
    manage(r); fields(r, ['equipment_id', 'bed_id', 'title', 'due_at', 'notes', 'assigned_to', 'idempotency_key']);
    if (!!r.body.equipment_id === !!r.body.bed_id) reject(r, 400, 'اختر جهازًا واحدًا أو حضّانة واحدة.', 'Choose exactly one equipment item or bed.');
    const values = { equipment_id: r.body.equipment_id ? text(r, r.body.equipment_id, 100) : null, bed_id: r.body.bed_id ? text(r, r.body.bed_id, 100) : null, title: text(r, r.body.title, 200), notes: text(r, r.body.notes, 4000, true), due_at: due(r, r.body.due_at) };
    s.status(201).json(await mutate(db, r, 'maintenance_jobs', async tx => {
      await target(tx, r, values);
      return insert(tx, 'maintenance_jobs', { id: uid(), ...values, assigned_to: await assignee(tx, r, r.body.assigned_to), created_by: r.user.id });
    }));
  }));
  app.patch('/api/maintenance/:id', wrap(async (r, s) => {
    manage(r); fields(r, ['version', 'status', 'title', 'due_at', 'notes', 'assigned_to', 'verified_note', 'restore_ready', 'idempotency_key']);
    s.json(await db.transaction(async outer => {
      // Lock the job before the idempotency record so repeated edits serialize on PostgreSQL too.
      const job = await one(outer, 'SELECT * FROM maintenance_jobs WHERE id=$1 FOR UPDATE', [r.params.id]);
      if (!job) reject(r, 404, 'أمر الصيانة غير موجود.', 'Maintenance job not found.');
      return mutate(outer, r, 'maintenance_jobs', async tx => {
        if (job.status === 'completed') reject(r, 409, 'أمر الصيانة مكتمل ولا يقبل التعديل.', 'Completed maintenance jobs cannot be edited.');
        if (!Number.isInteger(r.body.version)) reject(r, 400, 'رقم إصدار السجل مطلوب.', 'The record version is required.');
        if (r.body.version !== job.version) reject(r, 409, 'تغير أمر الصيانة؛ حدّث البيانات.', 'The maintenance job changed; refresh the data.', 'VERSION_CONFLICT');
        const values: Record<string, any> = { updated_at: new Date().toISOString() };
        if (r.body.title !== undefined) values.title = text(r, r.body.title, 200);
        if (r.body.notes !== undefined) values.notes = text(r, r.body.notes, 4000, true);
        if (r.body.due_at !== undefined) values.due_at = due(r, r.body.due_at);
        if (r.body.assigned_to !== undefined) values.assigned_to = await assignee(tx, r, r.body.assigned_to);
        if (r.body.status !== undefined && !['planned', 'in_progress', 'completed'].includes(r.body.status)) reject(r, 400, 'حالة الصيانة غير صالحة.', 'Invalid maintenance status.');
        if (r.body.status && r.body.status !== job.status) {
          const asset = await target(tx, r, job);
          if (asset.table === 'beds') await emptyBed(tx, r, asset.row);
          if (job.status === 'planned' && r.body.status === 'in_progress') {
            const other = await one(tx, "SELECT id FROM maintenance_jobs WHERE status='in_progress' AND (equipment_id=$1 OR bed_id=$2)", [job.equipment_id, job.bed_id]);
            if (other) reject(r, 409, 'يوجد أمر صيانة جارٍ لهذا الأصل.', 'This asset already has maintenance in progress.');
            await versioned(tx, asset.table, asset.row.id, asset.row.version, { status: 'maintenance', reason: job.title });
            values.status = 'in_progress'; values.started_at = new Date().toISOString();
          } else if (job.status === 'in_progress' && r.body.status === 'completed') {
            if (r.body.restore_ready !== true) reject(r, 400, 'أكد فحص صلاحية الأصل قبل إعادته للخدمة.', 'Explicitly confirm the asset was verified ready before returning it to service.');
            const note = text(r, r.body.verified_note, 4000);
            if (asset.row.status !== 'maintenance') reject(r, 409, 'تغيرت حالة الأصل؛ راجع الصيانة قبل الإكمال.', 'The asset status changed; review maintenance before completion.');
            await versioned(tx, asset.table, asset.row.id, asset.row.version, { status: asset.table === 'beds' ? 'available' : 'ready', reason: note });
            values.status = 'completed'; values.verified_note = note; values.completed_at = new Date().toISOString();
          } else reject(r, 409, 'انتقال حالة الصيانة غير مسموح.', 'This maintenance status transition is not allowed.');
        } else if (r.body.restore_ready !== undefined || r.body.verified_note !== undefined) reject(r, 400, 'توثيق الصلاحية متاح عند إكمال الصيانة فقط.', 'Readiness verification is only accepted when completing maintenance.');
        if (Object.keys(values).length === 1) reject(r, 400, 'اختر تعديلًا لأمر الصيانة.', 'Choose a maintenance job change.');
        return versioned(tx, 'maintenance_jobs', job.id, r.body.version, values);
      });
    }));
  }));
  app.post('/api/maintenance/:id/expenses', wrap(async (r, s) => {
    finance(r, 'billing.write'); fields(r, ['amount', 'method', 'money_account_id', 'vendor', 'reference', 'notes', 'idempotency_key']);
    const raw = r.body.amount, amount = Number(raw);
    if (!['string', 'number'].includes(typeof raw) || typeof raw === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(amount) || amount < .01 || amount > 1e12 || Math.abs(amount * 100 - Math.round(amount * 100)) > .00001) reject(r, 400, 'أدخل مبلغًا موجبًا بمنزلتين عشريتين.', 'Enter a positive amount with at most two decimal places.');
    const vendor = text(r, r.body.vendor, 200), reference = text(r, r.body.reference, 160), notes = text(r, r.body.notes, 4000, true);
    try {
      s.status(201).json(await db.transaction(async tx => {
        await lockCashLedger(tx);
        return mutate(tx, r, 'maintenance_expenses', async inner => {
          if (!await one(inner, 'SELECT id FROM maintenance_jobs WHERE id=$1 FOR UPDATE', [r.params.id])) reject(r, 404, 'أمر الصيانة غير موجود.', 'Maintenance job not found.');
          const account = await resolveMoneyAccount(inner, r.body.method, r.body.money_account_id);
          if (!account.money_account_id) reject(r, 400, 'اختر الحساب البنكي الذي دفع المصروف.', 'Choose the bank account that paid the expense.');
          await assertMoneyAvailable(inner, account.money_account_id, amount);
          return insert(inner, 'maintenance_expenses', { id: uid(), maintenance_job_id: r.params.id, ...account, amount, method: r.body.method, vendor, reference, notes, actor_id: r.user.id });
        });
      }));
    } catch (error) {
      if (error instanceof ApiError && error.code && treasuryErrorMessage(error.code, getLocale(r))) throw new ApiError(error.status, treasuryErrorMessage(error.code, getLocale(r))!, error.code);
      throw error;
    }
  }));
}

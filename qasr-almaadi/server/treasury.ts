import { all, one, type Database } from './db.js';
import { permit, wrap, mutate, requireKey, uid, type Req, type RouteContext } from './context.js';
import { insert } from './seed.js';
import { ApiError } from './security.js';
import { getLocale } from './i18n.js';

const messages: Record<string, [string, string]> = {
  TREASURY_SCOPE: ['الحسابات النقدية العامة خارج نطاق صلاحيات الحالات المكلف بها الطبيب أو الممرض.', 'Department money accounts are outside clinician case-scoped permissions.'],
  MONEY_AMOUNT: ['أدخل مبلغًا صالحًا بمنزلتين عشريتين وبالحد المسموح.', 'Enter a valid amount with at most two decimal places within the allowed limit.'],
  MONEY_FIELDS: ['تتضمن البيانات حقولًا غير مسموحة.', 'The request includes unsupported fields.'],
  MONEY_REQUIRED: ['بيانات الحساب أو مرجع الإيداع غير مكتملة أو طويلة جدًا.', 'The account details or deposit reference are missing or too long.'],
  MONEY_ACCOUNT: ['الحساب المالي غير موجود أو غير نشط.', 'The money account does not exist or is inactive.'],
  MONEY_CASH: ['الدفعة النقدية تسجل في الخزنة الرئيسية فقط.', 'Cash payments must use the main cash account.'],
  MONEY_BANK: ['اختر حسابًا بنكيًا نشطًا لهذه المعاملة.', 'Select an active bank account for this transaction.'],
  MONEY_INSUFFICIENT: ['رصيد الحساب لا يكفي لتنفيذ الحركة.', 'The account has insufficient funds for this transaction.'],
  MONEY_TRANSFER: ['الإيداع المدعوم ينقل من الخزنة إلى حساب بنكي فقط.', 'Deposits must move funds from the cash account to a bank account.'],
  MONEY_METHOD: ['طريقة الدفع غير مدعومة.', 'The payment method is not supported.'],
};
function fail(code: string, status = 400, r?: Req): never {
  throw new ApiError(status, messages[code][r && getLocale(r) === 'en' ? 1 : 0], code);
}
// All payment, refund and deposit writers take this lock FIRST, before admission/payment locks.
export async function lockCashLedger(tx: Database): Promise<void> {
  if (!(await one(tx, "SELECT id FROM money_accounts WHERE id='cash' FOR UPDATE"))) fail('MONEY_ACCOUNT', 409);
}
export async function resolveMoneyAccount(tx: Database, method: string, requestedId?: string): Promise<{ money_account_id: string | null }> {
  if (!['cash', 'card', 'transfer', 'instapay', 'wallet'].includes(method)) fail('MONEY_METHOD');
  if (requestedId !== undefined && requestedId !== null && (typeof requestedId !== 'string' || requestedId.length > 100)) fail('MONEY_ACCOUNT');
  if (method === 'cash') {
    if (requestedId && requestedId !== 'cash') fail('MONEY_CASH');
    return { money_account_id: 'cash' };
  }
  if (!requestedId) return { money_account_id: null }; // Legacy/unallocated payment is reported explicitly, never silently assigned.
  const account = await one(tx, 'SELECT id,kind,active FROM money_accounts WHERE id=$1', [requestedId]);
  if (!account?.active) fail('MONEY_ACCOUNT', 404);
  if (account.kind !== 'bank') fail('MONEY_BANK');
  return { money_account_id: account.id };
}
const balanceExpression = `m.opening_balance
 + COALESCE((SELECT sum(p.amount) FROM payments p WHERE COALESCE(p.money_account_id,CASE WHEN p.method='cash' THEN 'cash' END)=m.id),0)
 + COALESCE((SELECT sum(t.amount) FROM money_transfers t WHERE t.to_account_id=m.id),0)
 - COALESCE((SELECT sum(t.amount) FROM money_transfers t WHERE t.from_account_id=m.id),0)
 - COALESCE((SELECT sum(e.amount) FROM maintenance_expenses e WHERE e.money_account_id=m.id),0)
 - COALESCE((SELECT sum(o.total_amount) FROM purchase_orders o WHERE o.money_account_id=m.id AND o.status='received'),0)
 - COALESCE((SELECT sum(sp.amount) FROM supplier_payments sp WHERE sp.money_account_id=m.id),0)
 - COALESCE((SELECT sum(pp.amount) FROM payroll_payments pp WHERE pp.money_account_id=m.id),0)
 + COALESCE((SELECT sum(l.debit-l.credit) FROM manual_journal_lines l JOIN manual_journals j ON j.id=l.journal_id JOIN chart_accounts a ON a.id=l.account_id WHERE l.money_account_id=m.id AND a.system_key='money' AND j.status IN('posted','reversed')),0)`;
export async function moneyBalance(tx: Database, accountId: string) {
  return one(tx, `SELECT m.id,(${balanceExpression}) AS balance FROM money_accounts m WHERE m.id=$1`, [accountId]);
}
export async function assertMoneyAvailable(tx: Database, accountId: string | null, amount: number): Promise<void> {
  if (!accountId) return; // Unallocated legacy electronic payments have no claimed bank balance.
  const row = await one(tx, `SELECT m.id FROM money_accounts m WHERE m.id=$1 AND (${balanceExpression}) >= $2::numeric`, [accountId, amount]);
  if (!row) fail('MONEY_INSUFFICIENT', 409);
}
function departmentScope(r: Req, permission: string) {
  permit(r, permission);
  if (['doctor', 'nurse'].includes(r.user.role)) fail('TREASURY_SCOPE', 403, r);
}
function fields(r: Req, allowed: string[]) {
  if (!r.body || typeof r.body !== 'object' || Array.isArray(r.body) || Object.keys(r.body).some(key => !allowed.includes(key))) fail('MONEY_FIELDS', 400, r);
  requireKey(r);
}
function text(value: unknown, max: number, optional: boolean, r: Req) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('MONEY_REQUIRED', 400, r);
  return value.trim();
}
function amount(value: unknown, minimum: number, r: Req) {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || typeof value === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(value)) fail('MONEY_AMOUNT', 400, r);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > 1e12 || Math.abs(parsed * 100 - Math.round(parsed * 100)) > .00001) fail('MONEY_AMOUNT', 400, r);
  return Math.round(parsed * 100) / 100;
}
// Keep helper errors bilingual when finance/insurance routes use the shared money helpers.
export function treasuryErrorMessage(code: string, locale: string) { return messages[code]?.[locale === 'en' ? 1 : 0]; }
export function treasuryRoutes({ app, db }: RouteContext) {
  app.get('/api/treasury', wrap(async (r, s) => {
    departmentScope(r, 'billing.read');
    const accounts = await all(db, `SELECT m.*,(${balanceExpression}) AS balance FROM money_accounts m ORDER BY (m.kind='cash') DESC,m.name,m.id`);
    const transfers = await all(db, `SELECT t.*,f.name AS from_account_name,b.name AS to_account_name,b.bank_name,u.name AS actor_name FROM money_transfers t JOIN money_accounts f ON f.id=t.from_account_id JOIN money_accounts b ON b.id=t.to_account_id JOIN users u ON u.id=t.actor_id ORDER BY t.created_at DESC,t.id DESC LIMIT 300`);
    const unallocatedByMethod = await all(db, "SELECT method,count(*)::int AS payment_count,COALESCE(sum(amount),0) AS amount FROM payments WHERE money_account_id IS NULL AND method<>'cash' GROUP BY method ORDER BY method");
    const unallocated = await one(db, "SELECT count(*)::int AS payment_count,COALESCE(sum(amount),0) AS total FROM payments WHERE money_account_id IS NULL AND method<>'cash'");
    const manualUnallocated = await one(db, "SELECT count(*)::int line_count,COALESCE(sum(l.debit),0) debit,COALESCE(sum(l.credit),0) credit,COALESCE(sum(l.debit-l.credit),0) total FROM manual_journal_lines l JOIN manual_journals j ON j.id=l.journal_id JOIN chart_accounts a ON a.id=l.account_id WHERE l.money_account_id IS NULL AND a.system_key='money' AND j.status IN('posted','reversed')");
    s.json({ accounts, transfers, cash_balance: accounts.find(row => row.id === 'cash')?.balance || '0', unallocated: { ...unallocated, total: Math.round((Number(unallocated.total)+Number(manualUnallocated.total))*100)/100, by_method: unallocatedByMethod, manual_journals: manualUnallocated }, currency: 'EGP' });
  }));
  app.post('/api/treasury/accounts', wrap(async (r, s) => {
    departmentScope(r, 'billing.write');
    fields(r, ['name', 'bank_name', 'account_number', 'opening_balance', 'idempotency_key']);
    const name = text(r.body.name, 160, false, r), bankName = text(r.body.bank_name, 160, false, r), number = text(r.body.account_number, 80, true, r), opening = amount(r.body.opening_balance ?? 0, 0, r);
    s.status(201).json(await db.transaction(async tx => {
      await lockCashLedger(tx);
      return mutate(tx, r, 'money_accounts', inner => insert(inner, 'money_accounts', { id: uid(), kind: 'bank', name, bank_name: bankName, account_number: number || null, opening_balance: opening, created_by: r.user.id }));
    }));
  }));
  app.post('/api/treasury/transfers', wrap(async (r, s) => {
    departmentScope(r, 'billing.write');
    fields(r, ['from_account_id', 'to_account_id', 'amount', 'reference', 'notes', 'idempotency_key']);
    if (r.body.from_account_id !== 'cash' || r.body.to_account_id === 'cash') fail('MONEY_TRANSFER', 400, r);
    const target = text(r.body.to_account_id, 100, false, r), value = amount(r.body.amount, .01, r), reference = text(r.body.reference, 160, false, r), notes = text(r.body.notes, 2000, true, r);
    try {
      s.status(201).json(await db.transaction(async tx => {
        await lockCashLedger(tx);
        return mutate(tx, r, 'money_transfers', async inner => {
          await resolveMoneyAccount(inner, 'transfer', target);
          await assertMoneyAvailable(inner, 'cash', value);
          return insert(inner, 'money_transfers', { id: uid(), from_account_id: 'cash', to_account_id: target, amount: value, reference, notes, actor_id: r.user.id });
        });
      }));
    } catch (error) {
      if (error instanceof ApiError && error.code && messages[error.code]) fail(error.code, error.status, r);
      throw error;
    }
  }));
}

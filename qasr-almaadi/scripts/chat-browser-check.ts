import { chromium, expect, type Page } from '@playwright/test';
import { createServer } from 'vite';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initDb, one } from '../server/db.js';
import { createApp } from '../server/app.js';

// This script always owns a new local database and browser context. It never connects to a hosted API.
for (const key of ['DATABASE_URL', 'UPDATE_ROOT', 'UPDATE_ENABLED', 'NODE_ENV', 'SESSION_SECURE']) delete process.env[key];
const directory = mkdtempSync(join(tmpdir(), 'nicu-chat-browser-'));
process.env.TRAINING_PASSWORD = 'Isolated-Chat-Check@2026';
process.env.PUBLIC_DEMO_ACCOUNTS = 'false';
const db = await initDb(join(directory, 'database'));
const app = await createApp(db, { seed: true });
const vite = await createServer({ server: { middlewareMode: true, host: '127.0.0.1' }, appType: 'custom', logLevel: 'error' });
app.use(vite.middlewares);
app.use(async (req, res, next) => {
  if (req.method !== 'GET') return next();
  try { res.type('html').send(await vite.transformIndexHtml(req.originalUrl, readFileSync(resolve('index.html'), 'utf8'))); } catch (error) { next(error); }
});
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolveReady => server.once('listening', resolveReady));
const address = server.address();
if (!address || typeof address === 'string') throw Error('Local test server did not start.');
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks: string[] = [], errors: string[] = [];
const contexts = [];
async function login(role: string, language = 'en') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: language === 'ar' ? 'ar-EG' : 'en-GB' });
  contexts.push(context);
  await context.addInitScript(value => localStorage.setItem('nicu-language', value), language);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('input[name=username]').fill(role);
  await page.locator('input[name=password]').fill(process.env.TRAINING_PASSWORD!);
  await page.locator('.login-page form button[type=submit]').click();
  await expect(page.locator('.sidebar nav')).toBeVisible();
  return page;
}
async function api(page: Page, path: string, body?: Record<string, unknown>) {
  return page.request.fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { Origin: base, 'Accept-Language': 'en' }, ...(body ? { data: body } : {}) });
}
try {
  const nurse = await login('nurse');
  const doctor = await login('doctor');
  const manager = await login('manager');
  const admin = await login('admin');
  const directResponse = await api(nurse, '/chat/conversations', { recipient_id: 'doctor', idempotency_key: randomUUID() });
  expect(directResponse.status()).toBe(201);
  const direct = await directResponse.json();
  const other = await (await api(doctor, '/chat/conversations', { recipient_id: 'lab', idempotency_key: randomUUID() })).json();
  expect((await api(nurse, `/chat/conversations/${other.id}/messages`)).status()).toBe(404);
  expect((await api(nurse, `/chat/conversations/${other.id}/messages`, { text: 'forbidden test', idempotency_key: randomUUID() })).status()).toBe(404);
  expect((await api(manager, `/chat/conversations/${direct.id}/messages`, { text: 'forbidden review send', idempotency_key: randomUUID() })).status()).toBe(403);
  expect((await api(admin, `/chat/conversations/${direct.id}/messages`, { text: 'forbidden admin review send', idempotency_key: randomUUID() })).status()).toBe(403);
  expect((await api(nurse, `/chat/conversations/${direct.id}/messages`, { text: 'forged identity test', sender_id: 'manager', idempotency_key: randomUUID() })).status()).toBe(400);
  const index = await (await api(nurse, '/chat')).json();
  expect(index.conversations.some((row: any) => row.id === other.id)).toBe(false);
  expect((await (await api(manager, `/chat/conversations/${direct.id}/messages`)).json()).conversation.can_send).toBe(false);
  checks.push('Real API denies third-party DM reads/writes, oversight replies, forged sender fields and list disclosure.');

  // UI workflow is completed below against this same real database, including an uncertain-response retry.
  await runChatUi({ nurse, doctor, manager, directId: direct.id });
  expect(errors).toEqual([]);
  const result = { status: 'PASS', at: new Date().toISOString(), isolated_database: true, checks };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/chat-browser.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await new Promise<void>(resolveClosed => server.close(() => resolveClosed()));
  await vite.close();
  await db.close();
  const safe = resolve(directory), parent = resolve(tmpdir());
  if (safe.startsWith(parent + (process.platform === 'win32' ? '\\' : '/')) && safe.split(/[\\/]/).pop()!.startsWith('nicu-chat-browser-')) rmSync(safe, { recursive: true, force: true });
}

async function runChatUi({ nurse, doctor, manager, directId }: { nurse: Page; doctor: Page; manager: Page; directId: string }) {
  const doctorName = (await one(db, "SELECT name FROM users WHERE id='doctor'")).name;
  const nurseName = (await one(db, "SELECT name FROM users WHERE id='nurse'")).name;
  async function help(page: Page) {
    await page.locator('.sidebar nav').getByRole('button', { name: 'Help center', exact: true }).click();
    await expect(page.locator('#chat-recipient')).toBeVisible();
  }
  await help(nurse);
  const support = await nurse.locator('.sidebar-bottom').evaluate(element => ({ insideNav: !!element.closest('nav'), isLast: element === element.parentElement?.lastElementChild }));
  expect(support).toEqual({ insideNav: true, isLast: true });
  await nurse.locator('.sidebar nav').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(nurse.locator('.sidebar nav').getByRole('button', { name: 'Help center', exact: true })).toBeInViewport();
  checks.push('Administration and support are the final group inside the scrolling navigation.');
  await nurse.locator('#chat-recipient').selectOption('doctor');
  await nurse.getByRole('button', { name: 'Open direct conversation', exact: true }).click();
  await expect(nurse.locator('#chat-message-text')).toBeVisible();
  const literal = '<img src=x onerror="window.chatInjected=true"> Synthetic nurse note';
  await nurse.locator('#chat-message-text').fill(literal);
  await nurse.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(nurse.locator('.chat-message p').filter({ hasText: literal })).toHaveCount(1);
  expect(await nurse.locator('.chat-message img').count()).toBe(0);
  expect(await nurse.evaluate(() => (window as any).chatInjected)).toBeUndefined();
  expect((await one(db, 'SELECT sender_id,conversation_id FROM chat_messages WHERE text=$1', [literal]))).toEqual({ sender_id: 'nurse', conversation_id: directId });
  await expect(nurse.locator('#chat-message-text')).toHaveValue('');
  await help(doctor);
  await doctor.locator('.chat-conversation').filter({ hasText: nurseName }).click();
  await expect(doctor.locator('.chat-message p').filter({ hasText: literal })).toHaveCount(1);
  checks.push('Nurse sends a direct message through the UI; doctor receives it, server records nurse identity, HTML remains literal text.');

  let loseResponse = true;
  const keys: string[] = [];
  await nurse.route(`**/api/chat/conversations/${directId}/messages`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().postDataJSON().idempotency_key);
    if (loseResponse) { loseResponse = false; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  const retryText = 'Synthetic uncertain response retry';
  await nurse.locator('#chat-message-text').fill(retryText);
  await nurse.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(nurse.locator('.chat-composer [role=alert]')).toBeVisible();
  await expect(nurse.locator('#chat-message-text')).toHaveValue(retryText);
  await nurse.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(nurse.locator('#chat-message-text')).toHaveValue('');
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  expect((await one(db, 'SELECT count(*)::int AS count FROM chat_messages WHERE text=$1', [retryText])).count).toBe(1);
  await nurse.unroute(`**/api/chat/conversations/${directId}/messages`);
  checks.push('An intentionally lost successful response retains the draft; retry reuses its key and does not duplicate the stored message.');

  await help(manager);
  await manager.locator('.chat-conversation').filter({ hasText: doctorName }).filter({ hasText: nurseName }).click();
  await expect(manager.getByText('Read-only access', { exact: true })).toBeVisible();
  await expect(manager.locator('#chat-message-text')).toHaveCount(0);
  await expect(manager.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0);
  await expect(manager.locator('.chat-message p').filter({ hasText: literal })).toHaveCount(1);
  await manager.locator('#chat-recipient').selectOption('doctor');
  await manager.getByRole('button', { name: 'Open direct conversation', exact: true }).click();
  await expect(manager.locator('#chat-message-text')).toBeVisible();
  const managerText = 'Synthetic manager sends only as manager';
  await manager.locator('#chat-message-text').fill(managerText);
  await manager.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(manager.locator('.chat-message p').filter({ hasText: managerText })).toHaveCount(1);
  expect((await one(db, 'SELECT sender_id FROM chat_messages WHERE text=$1', [managerText])).sender_id).toBe('manager');
  checks.push('Manager review of another direct conversation omits the composer; the manager can send only in their own conversation as manager.');

  await nurse.locator('.chat-conversation').filter({ hasText: 'Department room' }).click();
  const groupText = 'Synthetic department group update';
  await nurse.locator('#chat-message-text').fill(groupText);
  await nurse.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(nurse.locator('.chat-message p').filter({ hasText: groupText })).toHaveCount(1);
  expect((await one(db, 'SELECT conversation_id FROM chat_messages WHERE text=$1', [groupText])).conversation_id).toBe('department');
  await nurse.setViewportSize({ width: 390, height: 844 });
  await nurse.getByRole('button', { name: 'Back to conversations', exact: true }).click();
  await expect(nurse.locator('.chat-directory')).toBeVisible();
  await nurse.locator('.chat-conversation').filter({ hasText: doctorName }).click();
  await expect(nurse.locator('#chat-message-text')).toBeVisible();
  expect(await nurse.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await nurse.getByRole('button', { name: 'العربية', exact: true }).click();
  await expect(nurse.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(nurse.getByRole('button', { name: 'إرسال', exact: true })).toBeVisible();
  await nurse.locator('#chat-message-text').fill('رسالة اختبار عربية مصطنعة');
  await nurse.getByRole('button', { name: 'إرسال', exact: true }).click();
  await expect(nurse.locator('.chat-message p').filter({ hasText: 'رسالة اختبار عربية مصطنعة' })).toHaveCount(1);
  expect(await nurse.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  checks.push('Department group messages persist; English and Arabic chat work at 390px without horizontal overflow.');
}

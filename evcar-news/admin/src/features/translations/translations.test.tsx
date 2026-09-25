import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeSession, makeUser } from '@/test/fixtures';
import { errorBody, json, mockFetch } from '@/test/mockFetch';
import { renderApp } from '@/test/render';

// Shaped like the real TranslationDto.
const row = {
  id: 't1',
  namespace: 'home',
  key: 'hero.title',
  locale: 'ar',
  value: 'أحدث الأخبار',
  updatedById: 'u-1',
  updatedAt: '2026-09-01T00:00:00Z',
};

function setup(extra: Record<string, unknown> = {}) {
  return mockFetch({
    'POST /auth/refresh': json(200, makeSession(makeUser({ permissions: ['translations.write'] }))),
    'GET /admin/translations': json(200, {
      data: [row],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }),
    'POST /admin/translations': (call) =>
      json(201, { data: { ...row, id: 'new', ...(call.body as object) } }),
    'PATCH /admin/translations/t1': (call) =>
      json(200, { data: { ...row, ...(call.body as object) } }),
    'DELETE /admin/translations/t1': json(204),
    ...extra,
  });
}

describe('Translations', () => {
  it('renders overrides with the right text direction', async () => {
    setup();
    renderApp('/translations');
    const value = await screen.findByText('أحدث الأخبار');
    expect(value).toHaveAttribute('dir', 'rtl');
  });

  it('adds an override in both languages (one POST per language)', async () => {
    const m = setup();
    renderApp('/translations');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add override' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Namespace/), 'stations');
    await user.type(within(dialog).getByLabelText(/^Key/), 'map.empty');
    await user.type(within(dialog).getByLabelText(/Text \(العربية\)/), 'لا توجد محطات');
    await user.type(within(dialog).getByLabelText(/Text \(English\)/), 'No stations');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.callsTo('POST', '/admin/translations')).toHaveLength(2));
    expect(m.callsTo('POST', '/admin/translations').map((c) => c.body)).toEqual([
      { namespace: 'stations', key: 'map.empty', locale: 'ar', value: 'لا توجد محطات' },
      { namespace: 'stations', key: 'map.empty', locale: 'en', value: 'No stations' },
    ]);
  });

  it('requires at least one language and a valid key', async () => {
    const m = setup();
    renderApp('/translations');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add override' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Namespace/), 'Bad NS');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('Lower-case letters, digits, - or _ (max 64)'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Enter the text in at least one language')).toBeInTheDocument();
    expect(m.callsTo('POST', '/admin/translations')).toHaveLength(0);
  });

  it('updates the existing row when the key already has an override (409)', async () => {
    const m = setup({
      'POST /admin/translations': json(409, errorBody('CONFLICT', 'Already exists')),
    });
    renderApp('/translations');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add override' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Namespace/), 'home');
    await user.type(within(dialog).getByLabelText(/^Key/), 'hero.title');
    await user.type(within(dialog).getByLabelText(/Text \(العربية\)/), 'آخر الأخبار');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.callsTo('PATCH', '/admin/translations/t1')).toHaveLength(1));
    expect(m.callsTo('PATCH', '/admin/translations/t1')[0]!.body).toEqual({ value: 'آخر الأخبار' });
    const lookup = m
      .callsTo('GET', '/admin/translations')
      .find((c) => c.search.get('q') === 'hero.title')!;
    expect(lookup.search.get('namespace')).toBe('home');
    expect(lookup.search.get('locale')).toBe('ar');
  });

  it('edits a row with PATCH /:id', async () => {
    const m = setup();
    renderApp('/translations');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(/Text/);
    await user.clear(input);
    await user.type(input, 'عنوان جديد');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.callsTo('PATCH', '/admin/translations/t1')).toHaveLength(1));
    expect(m.callsTo('PATCH', '/admin/translations/t1')[0]!.body).toEqual({ value: 'عنوان جديد' });
  });

  it('sends a sort the API supports', async () => {
    const m = setup();
    renderApp('/translations?sort=-updatedAt');
    expect(await screen.findByText('أحدث الأخبار')).toBeInTheDocument();
    expect(m.callsTo('GET', '/admin/translations')[0]!.search.get('sort')).toBe('-updatedAt');
  });

  it('deletes an override after confirmation', async () => {
    const m = setup();
    renderApp('/translations');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete override' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete override' }));
    await waitFor(() => expect(m.callsTo('DELETE', '/admin/translations/t1')).toHaveLength(1));
  });
});

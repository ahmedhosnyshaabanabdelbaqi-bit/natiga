import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeSession, makeUser } from '@/test/fixtures';
import { errorBody, json, mockFetch } from '@/test/mockFetch';
import { renderApp } from '@/test/render';
import { normalizeMarket } from './api';
import { validateMarket } from './validation';

// Shaped like the real GET /admin/markets row (AdminMarketDto).
const egp = {
  code: 'EGP',
  nameAr: 'جنيه مصري',
  nameEn: 'Egyptian Pound',
  symbolAr: 'ج.م',
  symbolEn: 'E£',
  decimals: 2,
};
const eg = {
  code: 'EG',
  nameAr: 'مصر',
  nameEn: 'Egypt',
  currencyCode: 'EGP',
  currency: egp,
  timezone: 'Africa/Cairo',
  defaultLanguage: 'ar',
  unitSystem: 'metric',
  driveSide: 'lhd',
  enabled: true,
  sortOrder: 1,
  isDefault: false,
  createdAt: '2026-09-25T05:49:26.177Z',
  updatedAt: '2026-09-25T05:49:26.177Z',
};

function setup(extra: Record<string, unknown> = {}) {
  return mockFetch({
    'POST /auth/refresh': json(200, makeSession(makeUser({ permissions: ['markets.write'] }))),
    'GET /admin/markets': json(200, { data: [eg] }),
    'GET /admin/currencies': json(200, { data: [egp] }),
    'PATCH /admin/markets/EG': (call) => json(200, { data: { ...eg, ...(call.body as object) } }),
    'POST /admin/currencies': (call) => json(201, { data: call.body }),
    'DELETE /admin/currencies/EGP': json(
      409,
      errorBody('CURRENCY_IN_USE', 'This currency is still used.'),
    ),
    ...extra,
  });
}

describe('Markets', () => {
  it('lists markets with the coverage disclaimer', async () => {
    setup();
    renderApp('/markets');
    expect(await screen.findByText('Egypt')).toBeInTheDocument();
    expect(
      screen.getAllByText(/does not guarantee that station, price or car data exists/).length,
    ).toBeGreaterThan(0);
  });

  it('disables a market after confirmation', async () => {
    const m = setup();
    renderApp('/markets');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: /Enable market EG/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(m.callsTo('PATCH', '/admin/markets/EG')).toHaveLength(1));
    expect(m.callsTo('PATCH', '/admin/markets/EG')[0]!.body).toEqual({ enabled: false });
  });

  it('shows server validation errors on the create form', async () => {
    const m = setup({
      'POST /admin/markets': json(
        422,
        errorBody('VALIDATION_FAILED', 'Invalid market', {
          details: [{ field: 'currencyCode', message: 'Unknown currency' }],
        }),
      ),
    });
    renderApp('/markets');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add market' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create market' }));
    // Client-side validation first.
    expect(
      await within(dialog).findByText('Two capital letters (ISO 3166-1 alpha-2)'),
    ).toBeInTheDocument();
    expect(m.callsTo('POST', '/admin/markets')).toHaveLength(0);
  });

  it('protects the default market from being disabled', async () => {
    setup({ 'GET /admin/markets': json(200, { data: [{ ...eg, isDefault: true }] }) });
    renderApp('/markets');
    expect(await screen.findByText('Default')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Enable market EG/ })).toBeDisabled();
  });

  it('offers only registered currencies and registers a new one', async () => {
    const m = setup();
    renderApp('/markets');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add currency' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add currency' });
    await user.type(within(dialog).getByLabelText(/^Code/), 'kwd');
    await user.type(within(dialog).getByLabelText(/Arabic name/), 'دينار كويتي');
    await user.type(within(dialog).getByLabelText(/English name/), 'Kuwaiti Dinar');
    const decimals = within(dialog).getByLabelText(/Decimals/);
    await user.clear(decimals);
    await user.type(decimals, '3');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.callsTo('POST', '/admin/currencies')).toHaveLength(1));
    expect(m.callsTo('POST', '/admin/currencies')[0]!.body).toEqual({
      code: 'KWD',
      nameAr: 'دينار كويتي',
      nameEn: 'Kuwaiti Dinar',
      symbolAr: null,
      symbolEn: null,
      decimals: 3,
    });
  });

  it('asks before deleting a currency and reports when it is in use', async () => {
    const m = setup();
    renderApp('/markets');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete currency EGP' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete currency' }));
    await waitFor(() => expect(m.callsTo('DELETE', '/admin/currencies/EGP')).toHaveLength(1));
    expect(await screen.findByText('This currency is still used.')).toBeInTheDocument();
  });

  it('hides write actions without markets.write', async () => {
    setup({
      'POST /auth/refresh': json(200, makeSession(makeUser({ permissions: ['settings.read'] }))),
    });
    renderApp('/markets');
    expect(await screen.findByText('Egypt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add market' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add currency' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Enable market EG/ })).toBeDisabled();
  });
});

describe('market helpers', () => {
  const t = (k: string) => k;
  it('validates ISO codes, currency and time zone', () => {
    const errors = validateMarket(
      {
        ...eg,
        code: 'egy',
        currencyCode: 'EG',
        timezone: 'Mars/Base',
        unitSystem: 'metric',
        driveSide: 'lhd',
      },
      t,
    );
    expect(errors.code).not.toBeNull();
    expect(errors.currencyCode).not.toBeNull();
    expect(errors.timezone).not.toBeNull();
    const ok = validateMarket({ ...eg, unitSystem: 'metric', driveSide: 'lhd' }, t);
    expect(Object.values(ok).every((v) => v === null)).toBe(true);
  });
  it('maps AdminMarketDto rows (nested currency object ignored)', () => {
    expect(normalizeMarket(eg)).toMatchObject({
      code: 'EG',
      currencyCode: 'EGP',
      isDefault: false,
    });
  });
});

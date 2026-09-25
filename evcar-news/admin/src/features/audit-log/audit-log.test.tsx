import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeSession, makeUser } from '@/test/fixtures';
import { errorBody, json, mockFetch } from '@/test/mockFetch';
import { renderApp } from '@/test/render';
import { actorLabel, dayRangeToIso, normalizeAuditEntry } from './api';

const entry = {
  id: 'a1',
  createdAt: '2026-09-24T12:00:00Z',
  actorId: 'u-1',
  actor: { id: 'u-1', email: 'admin@example.test', displayName: 'Test Admin' },
  action: 'settings.update',
  entityType: 'app_setting',
  entityId: 'branding',
  before: { appName: 'EV Car News', logoUrl: null },
  after: { appName: 'EV Car News Beta', logoUrl: null },
  ip: '127.0.0.1',
  userAgent: 'vitest',
  requestId: 'req-1',
};

describe('Audit log', () => {
  it('passes filters to the API and shows the diff of an entry', async () => {
    const m = mockFetch({
      'POST /auth/refresh': json(200, makeSession(makeUser({ permissions: ['audit.read'] }))),
      'GET /admin/audit-logs': json(200, {
        data: [entry],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }),
      'GET /admin/audit-logs/a1': json(404, errorBody('NOT_FOUND')),
    });
    renderApp('/audit-log?entityType=app_setting&from=2026-09-01&to=2026-09-30');
    expect(await screen.findByText('settings.update')).toBeInTheDocument();
    const call = m.callsTo('GET', '/admin/audit-logs')[0]!;
    expect(call.search.get('entityType')).toBe('app_setting');
    expect(call.search.has('sort')).toBe(false);
    expect(call.search.get('from')).toBe(new Date('2026-09-01T00:00:00').toISOString());
    expect(call.search.get('to')).toBe(new Date('2026-09-30T23:59:59.999').toISOString());

    await userEvent.setup().click(screen.getByText('settings.update'));
    const drawer = await screen.findByRole('dialog');
    // Detail endpoint missing → falls back to the row data.
    expect(await within(drawer).findByText('appName')).toBeInTheDocument();
    expect(within(drawer).getByText('"EV Car News"')).toBeInTheDocument();
    expect(within(drawer).getByText('"EV Car News Beta"')).toBeInTheDocument();
    expect(within(drawer).getByText('Changed')).toBeInTheDocument();
  });

  it('forbids users without audit.read', async () => {
    mockFetch({
      'POST /auth/refresh': json(200, makeSession(makeUser({ permissions: ['users.read'] }))),
    });
    renderApp('/audit-log');
    expect(await screen.findByText("You don't have access to this section")).toBeInTheDocument();
  });
});

describe('normalizeAuditEntry', () => {
  it('accepts `entity` as an alias and falls back to actorLabel', () => {
    const e = normalizeAuditEntry({
      id: 1,
      action: 'x',
      entity: 'market',
      actorId: null,
      actorLabel: 'cli',
    });
    expect(e.entityType).toBe('market');
    expect(e.id).toBe('1');
    expect(actorLabel(e, 'System')).toBe('cli');
    expect(actorLabel({ ...e, actorLabel: null }, 'System')).toBe('System');
  });
});

describe('dayRangeToIso', () => {
  it('ignores malformed dates', () => {
    expect(dayRangeToIso('nope', '')).toEqual({});
  });
});

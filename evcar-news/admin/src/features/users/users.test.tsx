import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeSession, makeUser } from '@/test/fixtures';
import { json, mockFetch } from '@/test/mockFetch';
import { renderApp } from '@/test/render';
import {
  groupPermissions,
  sessionState,
  type AdminPermission,
  type AdminRole,
  type AdminSession,
  type AdminUserDetail,
} from './api';

const role = (r: Partial<AdminRole> & Pick<AdminRole, 'id' | 'key' | 'nameAr' | 'nameEn'>) =>
  ({
    description: null,
    isSystem: true,
    permissions: [],
    permissionsEditable: true,
    userCount: 0,
    ...r,
  }) satisfies AdminRole;

// Shapes as returned by the real backend (GET /admin/roles, /admin/users/:id, sessions).
const roles: AdminRole[] = [
  role({
    id: 'r1',
    key: 'owner',
    nameAr: 'مالك',
    nameEn: 'Owner',
    permissions: ['articles.create', 'users.manage'],
    permissionsEditable: false,
    userCount: 3,
  }),
  role({ id: 'r0', key: 'admin', nameAr: 'مدير', nameEn: 'Administrator' }),
  role({
    id: 'r2',
    key: 'editor',
    nameAr: 'محرر',
    nameEn: 'Editor',
    permissions: ['articles.create', 'articles.update'],
    userCount: 1,
  }),
  role({
    id: 'r3',
    key: 'station_manager',
    nameAr: 'مسؤول المحطات',
    nameEn: 'Station manager',
    permissions: ['stations.write'],
  }),
  role({ id: 'r4', key: 'user', nameAr: 'مستخدم', nameEn: 'User', userCount: 2 }),
];

const permissionCatalog: AdminPermission[] = [
  { key: 'articles.create', group: 'articles', descriptionAr: 'إنشاء', descriptionEn: 'Create' },
  { key: 'articles.update', group: 'articles', descriptionAr: 'تعديل', descriptionEn: 'Edit' },
  { key: 'stations.write', group: 'stations', descriptionAr: 'المحطات', descriptionEn: 'Stations' },
];

const sara: AdminUserDetail = {
  id: 'u-2',
  email: 'sara@example.test',
  displayName: 'Sara',
  emailVerified: true,
  locale: 'ar',
  roles: ['editor', 'user'],
  status: 'active',
  createdAt: '2026-02-01T10:00:00.000Z',
  lastLoginAt: null,
  isDemo: false,
  permissions: ['articles.create', 'articles.update'],
  updatedAt: '2026-02-01T10:00:00.000Z',
  hasPassword: true,
  oauthProviders: [],
  activeSessions: 1,
  failedLoginCount: 0,
  lockedUntil: null,
};

const session = (s: Partial<AdminSession> & Pick<AdminSession, 'id'>): AdminSession => ({
  clientType: 'mobile',
  deviceName: null,
  userAgent: null,
  ip: null,
  createdAt: '2026-09-01T00:00:00Z',
  lastUsedAt: '2026-09-20T00:00:00Z',
  expiresAt: '2099-01-01T00:00:00Z',
  current: false,
  ...s,
});

function setup(overrides: Record<string, unknown> = {}) {
  return mockFetch({
    'POST /auth/refresh': json(200, makeSession(makeUser({ id: 'u-1' }))),
    'GET /admin/users': json(200, {
      data: [sara],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }),
    'GET /admin/roles': json(200, { data: roles }),
    'GET /admin/users/u-2': json(200, { data: sara }),
    'GET /admin/users/u-2/sessions': json(200, {
      data: [
        session({ id: 's1', deviceName: 'Pixel 9', ip: '10.0.0.1' }),
        // Expired while the page was open (the API lists only live sessions).
        session({
          id: 's2',
          clientType: 'web',
          deviceName: 'Admin (Firefox)',
          expiresAt: '2026-08-02T00:00:00Z',
        }),
      ],
    }),
    'GET /admin/permissions': json(200, { data: permissionCatalog }),
    'PUT /admin/roles/editor/permissions': (call) =>
      json(200, {
        data: { ...roles[2], permissions: (call.body as { permissions: string[] }).permissions },
      }),
    'PUT /admin/users/u-2/roles': (call) =>
      json(200, { data: { ...sara, roles: (call.body as { roles: string[] }).roles } }),
    'PATCH /admin/users/u-2/status': json(200, { data: { ...sara, status: 'suspended' } }),
    'DELETE /admin/users/u-2/sessions/s1': json(204),
    'DELETE /admin/users/u-2/sessions': json(200, { data: { revoked: 1 } }),
    ...overrides,
  });
}

describe('Users & roles', () => {
  it('lists users with server-side query params', async () => {
    const m = setup();
    renderApp('/users?q=sar&role=editor');
    expect(await screen.findByText('Sara')).toBeInTheDocument();
    const call = m.callsTo('GET', '/admin/users')[0]!;
    expect(call.search.get('q')).toBe('sar');
    expect(call.search.get('role')).toBe('editor');
    expect(call.search.get('page')).toBe('1');
    expect(call.search.get('pageSize')).toBe('20');
    // Default order is left to the server.
    expect(call.search.has('sort')).toBe(false);
  });

  it('sends a non-default sort chosen by the user', async () => {
    const m = setup();
    renderApp('/users?sort=email');
    expect(await screen.findByText('Sara')).toBeInTheDocument();
    expect(m.callsTo('GET', '/admin/users')[0]!.search.get('sort')).toBe('email');
  });

  it('assigns roles from the user drawer', async () => {
    const m = setup();
    renderApp('/users?user=u-2');
    const drawer = await screen.findByRole('dialog');
    const stationCheckbox = await within(drawer).findByRole('checkbox', {
      name: /Station manager/,
    });
    const user = userEvent.setup();
    await user.click(stationCheckbox);
    await user.click(within(drawer).getByRole('button', { name: 'Save roles' }));
    await waitFor(() => expect(m.callsTo('PUT', '/admin/users/u-2/roles')).toHaveLength(1));
    expect(m.callsTo('PUT', '/admin/users/u-2/roles')[0]!.body).toEqual({
      roles: ['editor', 'user', 'station_manager'],
    });
  });

  it('prevents non-owners from granting owner, and admin without users.manage_admins', async () => {
    setup();
    renderApp('/users?user=u-2');
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByRole('checkbox', { name: /Owner/ })).toBeDisabled();
    expect(within(drawer).getByRole('checkbox', { name: /Administrator/ })).toBeDisabled();
    // The base `user` role is always kept by the server.
    expect(within(drawer).getByRole('checkbox', { name: /^User/ })).toBeDisabled();
    expect(within(drawer).getByRole('checkbox', { name: /Station manager/ })).toBeEnabled();
  });

  it('does not offer role changes on an owner account to a non-owner', async () => {
    setup({ 'GET /admin/users/u-2': json(200, { data: { ...sara, roles: ['owner', 'user'] } }) });
    renderApp('/users?user=u-2');
    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByText(/owner or admin role that you are not allowed to change/),
    ).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Save roles' })).not.toBeInTheDocument();
  });

  it('needs users.block (not users.manage) to suspend', async () => {
    setup({
      'POST /auth/refresh': json(
        200,
        makeSession(makeUser({ id: 'u-1', permissions: ['users.read', 'users.manage'] })),
      ),
    });
    renderApp('/users?user=u-2');
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByRole('button', { name: 'Save roles' })).toBeInTheDocument();
    expect(
      within(drawer).queryByRole('button', { name: 'Suspend account' }),
    ).not.toBeInTheDocument();
  });

  it('users.block alone (community moderator) cannot suspend staff accounts', async () => {
    const moderator = makeSession(
      makeUser({
        id: 'u-1',
        roles: ['community_moderator'],
        permissions: ['users.read', 'users.block'],
      }),
    );
    setup({ 'POST /auth/refresh': json(200, moderator) });
    renderApp('/users?user=u-2'); // Sara is an editor
    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByText(
        /Staff accounts can only be suspended by holders of users.manage/,
      ),
    ).toBeInTheDocument();
    expect(
      within(drawer).queryByRole('button', { name: 'Suspend account' }),
    ).not.toBeInTheDocument();
  });

  it('users.block can suspend a plain user account', async () => {
    const moderator = makeSession(
      makeUser({
        id: 'u-1',
        roles: ['community_moderator'],
        permissions: ['users.read', 'users.block'],
      }),
    );
    setup({
      'POST /auth/refresh': json(200, moderator),
      'GET /admin/users/u-2': json(200, { data: { ...sara, roles: ['user'] } }),
    });
    renderApp('/users?user=u-2');
    expect(await screen.findByRole('button', { name: 'Suspend account' })).toBeEnabled();
  });

  it("does not request an owner's sessions (IPs, devices) for a non-owner", async () => {
    const m = setup({
      'GET /admin/users/u-2': json(200, { data: { ...sara, roles: ['owner', 'user'] } }),
    });
    renderApp('/users?user=u-2');
    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByText(/Sessions \(IP addresses and devices\) of owner and admin/),
    ).toBeInTheDocument();
    expect(within(drawer).queryByText('Pixel 9')).not.toBeInTheDocument();
    expect(m.callsTo('GET', '/admin/users/u-2/sessions')).toHaveLength(0);
  });

  it('suspends an account after confirmation, with a reason', async () => {
    const m = setup();
    renderApp('/users?user=u-2');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Suspend account' }));
    await user.type(await screen.findByLabelText('Reason (internal)'), 'spam');
    const dialogs = screen.getAllByRole('dialog');
    await user.click(
      within(dialogs[dialogs.length - 1]!).getByRole('button', { name: 'Suspend account' }),
    );
    await waitFor(() => expect(m.callsTo('PATCH', '/admin/users/u-2/status')).toHaveLength(1));
    expect(m.callsTo('PATCH', '/admin/users/u-2/status')[0]!.body).toEqual({
      status: 'suspended',
      reason: 'spam',
    });
  });

  it('revokes a single active session', async () => {
    const m = setup();
    renderApp('/users?user=u-2');
    const user = userEvent.setup();
    expect(await screen.findByText('Pixel 9')).toBeInTheDocument();
    // Only the active session offers "Revoke".
    const revokeButtons = screen.getAllByRole('button', { name: 'Revoke' });
    expect(revokeButtons).toHaveLength(1);
    await user.click(revokeButtons[0]!);
    const dialogs = screen.getAllByRole('dialog');
    await user.click(within(dialogs[dialogs.length - 1]!).getByRole('button', { name: 'Revoke' }));
    await waitFor(() =>
      expect(m.callsTo('DELETE', '/admin/users/u-2/sessions/s1')).toHaveLength(1),
    );
  });

  it('is read-only without users.manage', async () => {
    setup({
      'POST /auth/refresh': json(
        200,
        makeSession(makeUser({ id: 'u-1', permissions: ['users.read'] })),
      ),
    });
    renderApp('/users?user=u-2');
    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByText(/You can view roles but not change them/),
    ).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Save roles' })).not.toBeInTheDocument();
    expect(
      within(drawer).queryByRole('button', { name: 'Suspend account' }),
    ).not.toBeInTheDocument();
  });

  it('shows roles with grouped permissions', async () => {
    setup();
    renderApp('/users?tab=roles');
    expect(await screen.findByRole('heading', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 1 user' })).toBeInTheDocument();
  });
});

describe('Role permissions', () => {
  const owner = () =>
    json(
      200,
      makeSession(
        makeUser({
          id: 'u-1',
          roles: ['owner', 'user'],
          permissions: ['roles.read', 'roles.manage'],
        }),
      ),
    );

  it('lets an owner edit a role and sends the full sorted permission set', async () => {
    const m = setup({ 'POST /auth/refresh': owner() });
    renderApp('/users?tab=roles');
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole('button', { name: 'Edit permissions' });
    // Owner role is not editable, so no button for it: admin, editor, station_manager, user.
    expect(buttons).toHaveLength(4);
    await user.click(buttons[1]!);
    const dialog = await screen.findByRole('dialog', { name: /Permissions of “Editor”/ });
    await user.click(within(dialog).getByRole('checkbox', { name: 'stations.write' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'articles.update' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save permissions' }));
    await waitFor(() =>
      expect(m.callsTo('PUT', '/admin/roles/editor/permissions')).toHaveLength(1),
    );
    expect(m.callsTo('PUT', '/admin/roles/editor/permissions')[0]!.body).toEqual({
      permissions: ['articles.create', 'stations.write'],
    });
  });

  it('hides editing from non-owners even with roles.manage', async () => {
    setup();
    renderApp('/users?tab=roles');
    expect(await screen.findByRole('heading', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit permissions' })).not.toBeInTheDocument();
  });
});

describe('users helpers', () => {
  it('groups permissions by resource', () => {
    expect(groupPermissions(['articles.create', 'users.manage', 'articles.publish'])).toEqual([
      ['articles', ['create', 'publish']],
      ['users', ['manage']],
    ]);
  });
  it('derives session state', () => {
    const now = Date.parse('2026-09-25T00:00:00Z');
    expect(sessionState(session({ id: '1', expiresAt: '2026-01-01T00:00:00Z' }), now)).toBe(
      'expired',
    );
    expect(sessionState(session({ id: '1', expiresAt: '2027-01-01T00:00:00Z' }), now)).toBe(
      'active',
    );
  });
});

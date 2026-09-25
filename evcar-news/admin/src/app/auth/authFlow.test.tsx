import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import { tokenStore } from '@/api/tokenStore';
import { makeSession, makeUser } from '@/test/fixtures';
import { errorBody, json, mockFetch } from '@/test/mockFetch';
import { renderApp } from '@/test/render';

const emptyList = { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };

describe('authentication flow', () => {
  it('redirects anonymous visitors to /login with next, then signs in and returns', async () => {
    const admin = makeUser();
    const m = mockFetch({
      'POST /auth/refresh': json(401, errorBody('NO_REFRESH_TOKEN')),
      'POST /auth/login': json(200, makeSession(admin, 'tok-login')),
      'GET /admin/users': json(200, emptyList),
      'GET /admin/roles': json(200, { data: [] }),
    });
    const { router } = renderApp('/users?tab=users');

    await screen.findByRole('heading', { name: 'Sign in to the admin' });
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe('/users?tab=users');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Email/), 'admin@example.test');
    await user.type(screen.getByLabelText(/Password/), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByRole('heading', { name: 'Users & roles' });
    expect(router.state.location.pathname).toBe('/users');
    const login = m.callsTo('POST', '/auth/login')[0]!;
    expect(login.body).toMatchObject({ email: 'admin@example.test', password: 'correct horse' });
    expect(login.headers['x-client-type']).toBe('web');
    expect(tokenStore.get()).toBe('tok-login');
    // The users list was fetched with the in-memory token.
    await waitFor(() =>
      expect(m.callsTo('GET', '/admin/users')[0]?.headers.authorization).toBe('Bearer tok-login'),
    );
  });

  it('shows a clear message for wrong credentials', async () => {
    mockFetch({
      'POST /auth/refresh': json(401, errorBody('NO_REFRESH_TOKEN')),
      'POST /auth/login': json(401, errorBody('INVALID_CREDENTIALS', 'Invalid credentials')),
    });
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Email/), 'admin@example.test');
    await user.type(screen.getByLabelText(/Password/), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
  });

  it('restores the session from the refresh cookie on load', async () => {
    mockFetch({
      'POST /auth/refresh': json(200, makeSession(makeUser({ displayName: 'Mona' }))),
      'GET /health': json(200, {
        data: {
          status: 'ok',
          version: '1.2.3',
          environment: 'development',
          uptimeSeconds: 60,
          timestamp: '2026-09-25T00:00:00Z',
          checks: {
            database: { status: 'up' },
            redis: { status: 'up' },
            storage: { status: 'up' },
          },
        },
      }),
      // Malformed on purpose: must show an error state, not crash the dashboard.
      'GET /admin/system/overview': json(200, { data: { version: '1.2.3' } }),
      'GET /admin/system/integrations': json(200, {
        data: { items: [], capabilities: null, note: '' },
      }),
      'GET /admin/system/jobs': json(200, {
        data: { redis: 'up', workersEnabledHere: true, queues: [] },
      }),
    });
    renderApp('/');
    expect(await screen.findByText('Welcome, Mona.')).toBeInTheDocument();
    expect(await screen.findByText('1.2.3')).toBeInTheDocument();
    expect(
      await screen.findByText('Unexpected system overview response from the API'),
    ).toBeInTheDocument();
  });

  it('sends the user back to login when the session expires mid-use', async () => {
    mockFetch({
      'POST /auth/refresh': [
        json(200, makeSession(makeUser(), 'tok-a')),
        json(401, errorBody('INVALID_REFRESH_TOKEN')),
      ],
      'GET /admin/users': json(401, errorBody('TOKEN_EXPIRED')),
      'GET /admin/roles': json(401, errorBody('TOKEN_EXPIRED')),
    });
    const { router } = renderApp('/users');

    expect(
      await screen.findByText('Your session expired. Please sign in again.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('reason')).toBe('expired');
    expect(params.get('next')).toBe('/users');
    expect(tokenStore.get()).toBeNull();
  });

  it('renders the 403 page for sections outside the user permissions', async () => {
    const editor = makeUser({ roles: ['editor'], permissions: ['articles.create'] });
    mockFetch({ 'POST /auth/refresh': json(200, makeSession(editor)) });
    renderApp('/settings');
    expect(await screen.findByText("You don't have access to this section")).toBeInTheDocument();
    // Navigation only lists what the editor may open.
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByText('Articles')).toBeInTheDocument();
    expect(within(nav).queryByText('Settings')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Users & roles')).not.toBeInTheDocument();
  });

  it('blocks accounts without any admin role', async () => {
    mockFetch({
      'POST /auth/refresh': json(200, makeSession(makeUser({ roles: ['user'], permissions: [] }))),
    });
    renderApp('/');
    expect(await screen.findByText('No admin access')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });

  it('shows an honest placeholder for sections that are not built yet', async () => {
    mockFetch({
      'POST /auth/refresh': json(
        200,
        makeSession(makeUser({ permissions: ['*'], roles: ['owner'] })),
      ),
    });
    renderApp('/tours');
    expect(await screen.findByRole('heading', { name: '360° tours' })).toBeInTheDocument();
    expect(screen.getAllByText('Not implemented yet').length).toBeGreaterThan(0);
  });

  it('signs out through /logout', async () => {
    const m = mockFetch({
      'POST /auth/refresh': json(200, makeSession(makeUser(), 'tok-x')),
      'POST /auth/logout': json(204),
    });
    const { router } = renderApp('/logout');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(m.callsTo('POST', '/auth/logout')).toHaveLength(1);
    expect(tokenStore.get()).toBeNull();
    expect(
      await screen.findByRole('heading', { name: 'Sign in to the admin' }),
    ).toBeInTheDocument();
  });

  it('offers a retry when the API is unreachable during session restore', async () => {
    mockFetch({ 'POST /auth/refresh': json(200, makeSession()) });
    const fetchMock = globalThis.fetch;
    let first = true;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      if (first) {
        first = false;
        throw new TypeError('Failed to fetch');
      }
      return fetchMock(...args);
    }) as typeof fetch;
    renderApp('/login');
    expect(
      await screen.findByText('Could not reach the API server to restore your session.'),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    // Restored session → redirected away from the login page.
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Sign in to the admin' }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe('password pages', () => {
  it('forgot password never reveals whether the account exists', async () => {
    const m = mockFetch({
      'POST /auth/refresh': json(401, errorBody('NO_REFRESH_TOKEN')),
      'POST /auth/forgot-password': json(202),
    });
    renderApp('/forgot-password');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Email/), 'someone@example.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/If an account exists for this email/)).toBeInTheDocument();
    expect(m.callsTo('POST', '/auth/forgot-password')[0]!.body).toEqual({
      email: 'someone@example.test',
    });
  });

  it('setup-password link (create-owner) posts the token and new password', async () => {
    const m = mockFetch({
      'POST /auth/refresh': json(401, errorBody('NO_REFRESH_TOKEN')),
      'POST /auth/reset-password': json(204),
    });
    renderApp('/setup-password?token=abc123');
    expect(
      await screen.findByRole('heading', { name: 'Set up your password' }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^New password/), 'a-strong-pass');
    await user.type(screen.getByLabelText(/^Confirm password/), 'a-strong-pass');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(
      await screen.findByText('Your password has been set. You can now sign in.'),
    ).toBeInTheDocument();
    expect(m.callsTo('POST', '/auth/reset-password')[0]!.body).toEqual({
      token: 'abc123',
      password: 'a-strong-pass',
    });
  });

  it('validates the confirmation and reports expired tokens', async () => {
    mockFetch({
      'POST /auth/refresh': json(401, errorBody('NO_REFRESH_TOKEN')),
      'POST /auth/reset-password': json(400, errorBody('TOKEN_INVALID', 'Token invalid')),
    });
    renderApp('/reset-password?token=old');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^New password/), 'a-strong-pass');
    await user.type(screen.getByLabelText(/^Confirm password/), 'different-pass');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^Confirm password/));
    await user.type(screen.getByLabelText(/^Confirm password/), 'a-strong-pass');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('This link is invalid or has expired.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
  });

  it('explains a missing token', async () => {
    mockFetch({ 'POST /auth/refresh': json(401, errorBody('NO_REFRESH_TOKEN')) });
    renderApp('/reset-password');
    expect(
      await screen.findByText('This link is incomplete: the reset token is missing.'),
    ).toBeInTheDocument();
  });
});

describe('language and direction', () => {
  it('switches the document to RTL for Arabic and shows Arabic texts', async () => {
    mockFetch({
      'POST /auth/refresh': json(
        200,
        makeSession(makeUser({ permissions: ['*'], roles: ['owner'] })),
      ),
    });
    await i18n.changeLanguage('ar');
    renderApp('/stations');
    expect(await screen.findByText('هذا القسم قيد التنفيذ')).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');

    await userEvent.setup().click(screen.getAllByText('English')[0]!);
    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'));
    expect(
      await screen.findByText(
        'This section is not built yet. Nothing here is saved or published, and no sample data is shown.',
      ),
    ).toBeInTheDocument();
  });
});

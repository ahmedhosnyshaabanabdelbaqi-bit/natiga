import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/app/auth/AuthContext';
import type { AuthUser } from '@/api/types';
import { makeUser } from '@/test/fixtures';
import { PermissionGate } from './PermissionGate';

function withUser(user: AuthUser | null, ui: ReactNode) {
  const value: AuthContextValue = {
    state: user ? { status: 'authenticated', user } : { status: 'anonymous' },
    user,
    login: async () => user!,
    logout: async () => undefined,
    retryBootstrap: () => undefined,
  };
  return render(
    <MantineProvider env="test">
      <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>
    </MantineProvider>,
  );
}

describe('<PermissionGate>', () => {
  it('renders children when one of anyOf is granted', () => {
    withUser(
      makeUser({ permissions: ['users.manage'] }),
      <PermissionGate anyOf={['settings.write', 'users.manage']}>
        <button type="button">Save</button>
      </PermissionGate>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('renders the fallback when nothing matches', () => {
    withUser(
      makeUser({ permissions: ['articles.create'] }),
      <PermissionGate anyOf={['settings.write']} fallback={<span>read only</span>}>
        <button type="button">Save</button>
      </PermissionGate>,
    );
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByText('read only')).toBeInTheDocument();
  });

  it('renders nothing by default when denied', () => {
    const { container } = withUser(
      makeUser({ permissions: [] }),
      <PermissionGate anyOf={['users.manage']}>
        <span>secret</span>
      </PermissionGate>,
    );
    expect(container).not.toHaveTextContent('secret');
  });

  it('requires every permission of allOf', () => {
    withUser(
      makeUser({ permissions: ['articles.create'] }),
      <>
        <PermissionGate allOf={['articles.create', 'articles.publish']}>
          <span>publish</span>
        </PermissionGate>
        <PermissionGate allOf={['articles.create']}>
          <span>create</span>
        </PermissionGate>
      </>,
    );
    expect(screen.queryByText('publish')).not.toBeInTheDocument();
    expect(screen.getByText('create')).toBeInTheDocument();
  });

  it('honours wildcard grants and resource prefixes', () => {
    withUser(
      makeUser({ permissions: ['*'] }),
      <PermissionGate allOf={['settings.write', 'users.manage']}>
        <span>owner can</span>
      </PermissionGate>,
    );
    expect(screen.getByText('owner can')).toBeInTheDocument();
  });

  it('hides everything when signed out', () => {
    withUser(
      null,
      <PermissionGate anyOf={['users.*']}>
        <span>users</span>
      </PermissionGate>,
    );
    expect(screen.queryByText('users')).not.toBeInTheDocument();
  });

  it('renders children when no requirement is given', () => {
    withUser(
      makeUser({ permissions: [] }),
      <PermissionGate>
        <span>open</span>
      </PermissionGate>,
    );
    expect(screen.getByText('open')).toBeInTheDocument();
  });
});

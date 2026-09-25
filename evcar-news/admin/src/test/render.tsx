import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createQueryClient } from '@/api/queryClient';
import { AppProviders } from '@/app/AppProviders';
import { createAppRoutes } from '@/app/routes';
import { features } from '@/features/registry';

function testQueryClient() {
  const qc = createQueryClient();
  qc.setDefaultOptions({
    queries: { ...qc.getDefaultOptions().queries, retry: false, gcTime: Infinity },
    mutations: { retry: false },
  });
  return qc;
}

/** Renders the whole admin (real providers, routes and auth) at `path`. */
export function renderApp(path = '/') {
  const queryClient = testQueryClient();
  const router = createMemoryRouter(createAppRoutes(features), { initialEntries: [path] });
  const utils = render(
    <AppProviders queryClient={queryClient} testEnv>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...utils, router, queryClient };
}

/** Renders a component inside the real providers and a memory router. */
export function renderWithProviders(
  ui: ReactElement,
  { path = '/', routes }: { path?: string; routes?: RouteObject[] } = {},
) {
  const queryClient = testQueryClient();
  const router = createMemoryRouter(routes ?? [{ path: '*', element: ui }], {
    initialEntries: [path],
  });
  const utils = render(
    <AppProviders queryClient={queryClient} testEnv>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...utils, router, queryClient };
}

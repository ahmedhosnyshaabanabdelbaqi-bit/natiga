import { useState } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createQueryClient } from '@/api/queryClient';
import { features } from '@/features/registry';
import { AppProviders } from './AppProviders';
import { createAppRoutes } from './routes';

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(() => createBrowserRouter(createAppRoutes(features)));
  return (
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

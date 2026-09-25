import type { RouteObject } from 'react-router';
import type { FeatureDefinition } from './features';
import { FeatureGuard } from './auth/FeatureGuard';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './layout/AppLayout';
import ForbiddenPage from './pages/ForbiddenPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import LogoutPage from './pages/LogoutPage';
import NotFoundPage from './pages/NotFoundPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import RouteErrorPage from './pages/RouteErrorPage';
import { LoadingState } from '@/components/StateViews';

/** Builds the route tree; the feature list is injectable for tests. */
export function createAppRoutes(featureList: readonly FeatureDefinition[]): RouteObject[] {
  return [
    {
      id: 'root',
      errorElement: <RouteErrorPage />,
      hydrateFallbackElement: <LoadingState minHeight={320} />,
      children: [
        { path: 'login', element: <LoginPage /> },
        { path: 'forgot-password', element: <ForgotPasswordPage /> },
        { path: 'reset-password', element: <ResetPasswordPage mode="reset" /> },
        { path: 'setup-password', element: <ResetPasswordPage mode="setup" /> },
        { path: 'logout', element: <LogoutPage /> },
        {
          element: <RequireAuth />,
          children: [
            {
              element: <AppLayout />,
              errorElement: <RouteErrorPage />,
              children: [
                ...featureList.map<RouteObject>((feature) => ({
                  ...(feature.path ? { path: feature.path } : {}),
                  element: <FeatureGuard feature={feature} />,
                  children: feature.routes,
                })),
                { path: 'forbidden', element: <ForbiddenPage /> },
                { path: '*', element: <NotFoundPage /> },
              ],
            },
          ],
        },
      ],
    },
  ];
}

import { DirectionProvider, MantineProvider, useDirection } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider, useQueryClient, type QueryClient } from '@tanstack/react-query';
import 'dayjs/locale/ar';
import 'dayjs/locale/en';
import { useEffect, useMemo, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { AuthProvider } from './auth/AuthProvider';
import { useAppConfig } from './AppConfigContext';
import i18n, { directionFor } from './i18n';
import { buildTheme, resolveBranding } from './theme';

/** Keeps Mantine's direction (and server-localized data) in sync with the UI language. */
function LanguageSync() {
  const { i18n: inst } = useTranslation();
  const { setDirection } = useDirection();
  const queryClient = useQueryClient();
  useEffect(() => {
    setDirection(directionFor(inst.language));
    const handler = (lng: string) => {
      setDirection(directionFor(lng));
      // Server messages and labels follow Accept-Language: refetch in the new language.
      void queryClient.invalidateQueries();
    };
    inst.on('languageChanged', handler);
    return () => inst.off('languageChanged', handler);
  }, [inst, setDirection, queryClient]);
  return null;
}

function ThemedApp({ children, testEnv }: { children: ReactNode; testEnv: boolean }) {
  const config = useAppConfig();
  const branding = config.data?.branding;
  const theme = useMemo(() => buildTheme(branding), [branding]);
  const { i18n: inst } = useTranslation();
  const appName = resolveBranding(branding).appName;

  useEffect(() => {
    document.title = `${appName} · ${inst.t('common:app.adminSuffix')}`;
  }, [appName, inst, inst.language]);

  return (
    <MantineProvider theme={theme} defaultColorScheme="light" env={testEnv ? 'test' : 'default'}>
      <DatesProvider
        settings={{ locale: inst.language, firstDayOfWeek: inst.language === 'ar' ? 6 : 1 }}
      >
        <ModalsProvider>
          <Notifications position="top-center" limit={4} />
          {children}
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}

export function AppProviders({
  queryClient,
  children,
  testEnv = false,
}: {
  queryClient: QueryClient;
  children: ReactNode;
  testEnv?: boolean;
}) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <DirectionProvider initialDirection={directionFor(i18n.language)} detectDirection={false}>
          <LanguageSync />
          <ThemedApp testEnv={testEnv}>
            <AuthProvider>{children}</AuthProvider>
          </ThemedApp>
        </DirectionProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

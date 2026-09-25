import { Anchor, AppShell, Box, Burger, Group, Progress } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigation } from 'react-router';
import { useAuth } from '@/app/auth/AuthContext';
import { NoAccessPage } from '@/app/pages/NoAccessPage';
import { hasAdminAccess } from '@/features/registry';
import { BrandMark } from './BrandMark';
import { ColorSchemeToggle, LanguageSwitcher, UserMenu } from './HeaderControls';
import { NavbarContent } from './NavbarContent';

export function AppLayout() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const [opened, { toggle, close }] = useDisclosure(false);
  const location = useLocation();
  const navigation = useNavigation();

  useEffect(() => {
    close();
  }, [location.pathname, close]);

  if (!hasAdminAccess(user)) return <NoAccessPage />;

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 290, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <Anchor
        href="#main-content"
        className="skip-link"
        style={{ position: 'absolute', insetInlineStart: -9999, zIndex: 1000 }}
        onFocus={(e) => (e.currentTarget.style.insetInlineStart = '8px')}
        onBlur={(e) => (e.currentTarget.style.insetInlineStart = '-9999px')}
      >
        {t('nav.skipToContent')}
      </Anchor>
      <AppShell.Header>
        {navigation.state === 'loading' ? (
          <Progress
            value={100}
            animated
            size={2}
            radius={0}
            pos="absolute"
            top={0}
            left={0}
            right={0}
            aria-hidden
          />
        ) : null}
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label={t(opened ? 'nav.close' : 'nav.open')}
            />
            <BrandMark />
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Box visibleFrom="xs">
              <LanguageSwitcher />
            </Box>
            <ColorSchemeToggle />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar>
        <Box hiddenFrom="xs" p="sm">
          <LanguageSwitcher />
        </Box>
        <NavbarContent />
      </AppShell.Navbar>
      <AppShell.Main id="main-content" tabIndex={-1}>
        <Box maw={1400} mx="auto">
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}

import { Badge, NavLink, ScrollArea, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { NavLink as RouterNavLink, useLocation } from 'react-router';
import { useAuth } from '@/app/auth/AuthContext';
import { buildNavigation, featurePath } from '@/features/registry';

export function NavbarContent() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const location = useLocation();
  const groups = buildNavigation(user);

  return (
    <ScrollArea type="auto" style={{ flex: 1 }} component="nav" aria-label={t('nav.main')}>
      <Stack gap="md" p="sm">
        {groups.map(({ group, items }) => (
          <div key={group} role="group" aria-labelledby={`nav-group-${group}`}>
            <Text
              id={`nav-group-${group}`}
              size="xs"
              fw={700}
              c="dimmed"
              tt="uppercase"
              px="sm"
              mb={4}
            >
              {t(`navGroups.${group}`)}
            </Text>
            {items.map((feature) => {
              const to = featurePath(feature);
              const active =
                to === '/'
                  ? location.pathname === '/'
                  : location.pathname === to || location.pathname.startsWith(`${to}/`);
              const Icon = feature.icon;
              return (
                <NavLink
                  key={feature.key}
                  component={RouterNavLink}
                  to={to}
                  end={to === '/'}
                  active={active}
                  label={t(`${feature.key}:title`)}
                  leftSection={<Icon size={18} stroke={1.6} aria-hidden />}
                  rightSection={
                    feature.status === 'placeholder' ? (
                      <Badge size="xs" variant="light" color="gray">
                        {t('notImplemented.short')}
                      </Badge>
                    ) : null
                  }
                  aria-current={active ? 'page' : undefined}
                  style={{ borderRadius: 'var(--mantine-radius-md)' }}
                />
              );
            })}
          </div>
        ))}
      </Stack>
    </ScrollArea>
  );
}

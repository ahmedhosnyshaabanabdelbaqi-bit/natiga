import {
  ActionIcon,
  Avatar,
  Badge,
  Group,
  Menu,
  SegmentedControl,
  Text,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconChevronDown, IconLogout, IconMoon, IconSun } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '@/app/auth/AuthContext';
import { SUPPORTED_LANGUAGES } from '@/app/i18n';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation('common');
  return (
    <SegmentedControl
      size="xs"
      aria-label={t('header.language')}
      value={i18n.language}
      onChange={(lng) => void i18n.changeLanguage(lng)}
      data={SUPPORTED_LANGUAGES.map((lng) => ({
        value: lng,
        label: <span lang={lng}>{t(`languages.${lng}`)}</span>,
      }))}
    />
  );
}

export function ColorSchemeToggle() {
  const { t } = useTranslation('common');
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const next = computed === 'dark' ? 'light' : 'dark';
  const label = t(next === 'dark' ? 'header.darkMode' : 'header.lightMode');
  return (
    <Tooltip label={label}>
      <ActionIcon
        variant="default"
        size="lg"
        aria-label={label}
        onClick={() => setColorScheme(next)}
      >
        {computed === 'dark' ? (
          <IconSun size={18} aria-hidden />
        ) : (
          <IconMoon size={18} aria-hidden />
        )}
      </ActionIcon>
    </Tooltip>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase();
}

export function UserMenu() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Menu position="bottom-end" width={260} withinPortal>
      <Menu.Target>
        <UnstyledButton aria-label={t('header.accountMenu')}>
          <Group gap={6} wrap="nowrap">
            <Avatar radius="xl" size={32} color="brand">
              {initials(user.displayName || user.email)}
            </Avatar>
            <Text size="sm" fw={500} visibleFrom="md" maw={160} truncate>
              {user.displayName || user.email}
            </Text>
            <IconChevronDown size={14} aria-hidden />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Text size="sm" fw={600} c="var(--mantine-color-text)" truncate>
            {user.displayName}
          </Text>
          <Text size="xs" c="dimmed" truncate dir="ltr">
            {user.email}
          </Text>
          <Group gap={4} mt={6}>
            {user.roles.map((role) => (
              <Badge key={role} size="xs" variant="light">
                {t(`roles.${role}`, { defaultValue: role })}
              </Badge>
            ))}
          </Group>
        </Menu.Label>
        <Menu.Divider />
        <Menu.Item
          component={Link}
          to="/logout"
          color="red"
          leftSection={<IconLogout size={16} aria-hidden />}
        >
          {t('header.logout')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

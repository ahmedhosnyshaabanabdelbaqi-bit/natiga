import {
  Alert,
  Badge,
  Card,
  Grid,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '@/app/auth/AuthContext';
import { usePermissions } from '@/app/auth/usePermissions';
import { PERMISSIONS } from '@/app/permissions';
import { PageHeader } from '@/components/PageHeader';
import { canSeeFeature, featurePath, features } from '@/features/registry';
import { IntegrationsSummaryCard } from '../components/IntegrationsSummaryCard';
import { SystemOverviewCard } from '../components/SystemOverviewCard';

export default function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { user } = useAuth();
  const { can } = usePermissions();
  // Same permissions the API checks: overview/jobs → system.read;
  // integrations → settings.read or integrations.read.
  const canOverview = can(PERMISSIONS.systemRead);
  const canIntegrations = can({ anyOf: [PERMISSIONS.settingsRead, PERMISSIONS.integrationsRead] });
  const visible = features.filter((f) => f.key !== 'dashboard' && canSeeFeature(f, user));
  const implemented = visible.filter((f) => f.status === 'implemented');
  const placeholders = visible.filter((f) => f.status === 'placeholder');

  return (
    <>
      <PageHeader
        title={t('dashboard:title')}
        description={t('dashboard:greeting', { name: user?.displayName || user?.email || '' })}
      />
      <Stack gap="lg">
        {canOverview || canIntegrations ? (
          <Grid>
            {canOverview ? (
              <Grid.Col span={{ base: 12, lg: canIntegrations ? 8 : 12 }}>
                <SystemOverviewCard />
              </Grid.Col>
            ) : null}
            {canIntegrations ? (
              <Grid.Col span={{ base: 12, lg: canOverview ? 4 : 12 }}>
                <IntegrationsSummaryCard showJobs={canOverview} />
              </Grid.Col>
            ) : null}
          </Grid>
        ) : (
          <Alert color="gray" icon={<IconInfoCircle aria-hidden />}>
            {t('dashboard:noSystemAccess')}
          </Alert>
        )}
        <Stack gap="sm">
          <Title order={3}>{t('dashboard:sections')}</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            {[...implemented, ...placeholders].map((f) => {
              const Icon = f.icon;
              return (
                <UnstyledButton key={f.key} component={Link} to={featurePath(f)}>
                  <Card withBorder radius="md" padding="md" h="100%">
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <Group gap="sm" wrap="nowrap">
                        <Icon size={22} aria-hidden />
                        <Text fw={600}>{t(`${f.key}:title`)}</Text>
                      </Group>
                      {f.status === 'placeholder' ? (
                        <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                          {t('common:notImplemented.short')}
                        </Badge>
                      ) : null}
                    </Group>
                  </Card>
                </UnstyledButton>
              );
            })}
          </SimpleGrid>
          {placeholders.length > 0 ? (
            <Text size="xs" c="dimmed">
              {t('dashboard:placeholdersNote', { count: placeholders.length })}
            </Text>
          ) : null}
        </Stack>
      </Stack>
    </>
  );
}

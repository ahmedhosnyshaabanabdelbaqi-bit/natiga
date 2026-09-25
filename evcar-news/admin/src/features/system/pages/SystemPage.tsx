import { Button, Divider, Stack } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { IconRefresh } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { IntegrationsSection } from '../components/IntegrationsSection';
import { JobsSection } from '../components/JobsSection';

export default function SystemPage() {
  const { t } = useTranslation('system');
  const qc = useQueryClient();
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} aria-hidden />}
            onClick={() => void qc.invalidateQueries({ queryKey: ['admin', 'system'] })}
          >
            {t('refresh')}
          </Button>
        }
      />
      <Stack gap="xl">
        <IntegrationsSection />
        <Divider />
        <JobsSection />
      </Stack>
    </>
  );
}

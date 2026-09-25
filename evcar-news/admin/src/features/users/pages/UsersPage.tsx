import { Tabs } from '@mantine/core';
import { IconShieldLock, IconUsers } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { RolesTab } from '../components/RolesTab';
import { UsersTab } from '../components/UsersTab';

export default function UsersPage() {
  const { t } = useTranslation('users');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'roles' ? 'roles' : 'users';

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Tabs
        value={tab}
        keepMounted={false}
        onChange={(value) =>
          setParams(value === 'roles' ? { tab: 'roles' } : {}, { replace: false })
        }
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="users" leftSection={<IconUsers size={16} aria-hidden />}>
            {t('tabs.users')}
          </Tabs.Tab>
          <Tabs.Tab value="roles" leftSection={<IconShieldLock size={16} aria-hidden />}>
            {t('tabs.roles')}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="users">
          <UsersTab />
        </Tabs.Panel>
        <Tabs.Panel value="roles">
          <RolesTab onShowUsers={(role) => setParams({ role })} />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

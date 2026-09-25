import { Alert, Tabs } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { usePermissions } from '@/app/auth/usePermissions';
import { PERMISSIONS } from '@/app/permissions';
import { PageHeader } from '@/components/PageHeader';
import { QueryState } from '@/components/StateViews';
import { SETTING_KEYS, type SettingKey, type SettingsMap } from '../api';
import { AppLinksTab } from '../components/AppLinksTab';
import { BrandingTab } from '../components/BrandingTab';
import { FeatureFlagsTab } from '../components/FeatureFlagsTab';
import { GeneralTab } from '../components/GeneralTab';
import { HomeSectionsTab } from '../components/HomeSectionsTab';
import { LinksTab } from '../components/LinksTab';
import { MapTab } from '../components/MapTab';
import { useSettings } from '../hooks';

const SETTINGS_TABS = [
  'general',
  'branding',
  'home',
  'features',
  'map',
  'share',
  'legal',
  'appLinks',
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

/**
 * Remount a tab whenever its stored value changes on the server (save,
 * restore default, logo upload) so the form starts from the new value.
 */
const version = (data: SettingsMap, key: SettingKey) => data[key]?.updatedAt ?? 'default';

export default function SettingsPage() {
  const { t } = useTranslation('settings');
  const { can } = usePermissions();
  const canWrite = can(PERMISSIONS.settingsWrite);
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: SettingsTab = (SETTINGS_TABS as readonly string[]).includes(raw ?? '')
    ? (raw as SettingsTab)
    : 'general';

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {!canWrite ? (
        <Alert color="gray" icon={<IconLock aria-hidden />} mb="md">
          {t('readOnly')}
        </Alert>
      ) : null}
      <Tabs
        value={tab}
        onChange={(v) => setParams(v && v !== 'general' ? { tab: v } : {})}
        keepMounted={false}
      >
        <Tabs.List mb="md">
          {SETTINGS_TABS.map((key) => (
            <Tabs.Tab key={key} value={key}>
              {t(`tabs.${key}`)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <QueryState query={settings}>
          {(data) => (
            <>
              <Tabs.Panel value="general">
                <GeneralTab
                  key={version(data, SETTING_KEYS.defaults)}
                  settings={data}
                  canWrite={canWrite}
                />
              </Tabs.Panel>
              <Tabs.Panel value="branding">
                <BrandingTab
                  key={version(data, SETTING_KEYS.branding)}
                  settings={data}
                  canWrite={canWrite}
                />
              </Tabs.Panel>
              <Tabs.Panel value="home">
                <HomeSectionsTab
                  key={version(data, SETTING_KEYS.homeSections)}
                  settings={data}
                  canWrite={canWrite}
                />
              </Tabs.Panel>
              <Tabs.Panel value="features">
                <FeatureFlagsTab
                  key={version(data, SETTING_KEYS.features)}
                  settings={data}
                  canWrite={canWrite}
                />
              </Tabs.Panel>
              <Tabs.Panel value="map">
                <MapTab key={version(data, SETTING_KEYS.map)} settings={data} canWrite={canWrite} />
              </Tabs.Panel>
              <Tabs.Panel value="share">
                <LinksTab
                  key={version(data, SETTING_KEYS.share)}
                  settings={data}
                  canWrite={canWrite}
                  settingKey={SETTING_KEYS.share}
                  section="share"
                  fields={[{ name: 'baseUrl', required: true, placeholder: 'https://evcar.news' }]}
                />
              </Tabs.Panel>
              <Tabs.Panel value="legal">
                <LinksTab
                  key={version(data, SETTING_KEYS.legal)}
                  settings={data}
                  canWrite={canWrite}
                  settingKey={SETTING_KEYS.legal}
                  section="legal"
                  fields={[{ name: 'privacyUrl' }, { name: 'termsUrl' }]}
                />
              </Tabs.Panel>
              <Tabs.Panel value="appLinks">
                <AppLinksTab
                  key={version(data, SETTING_KEYS.appLinks)}
                  settings={data}
                  canWrite={canWrite}
                />
              </Tabs.Panel>
            </>
          )}
        </QueryState>
      </Tabs>
    </>
  );
}

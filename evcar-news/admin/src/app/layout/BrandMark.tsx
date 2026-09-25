import { Group, Image, Text, ThemeIcon } from '@mantine/core';
import { IconBolt } from '@tabler/icons-react';
import { useAppConfig } from '@/app/AppConfigContext';
import { resolveBranding } from '@/app/theme';

export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const config = useAppConfig();
  const branding = resolveBranding(config.data?.branding);
  const px = size === 'lg' ? 40 : 30;
  return (
    <Group gap="xs" wrap="nowrap">
      {branding.logoUrl ? (
        <Image src={branding.logoUrl} alt="" h={px} w="auto" fit="contain" />
      ) : (
        <ThemeIcon
          size={px}
          radius="md"
          variant="gradient"
          gradient={{ from: 'brand', to: 'accent' }}
        >
          <IconBolt size={px * 0.6} aria-hidden />
        </ThemeIcon>
      )}
      <Text fw={700} size={size === 'lg' ? 'xl' : 'lg'} dir="auto">
        {branding.appName}
      </Text>
    </Group>
  );
}

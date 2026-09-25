import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { allowedImageUrl, allowedVideoUrl, VIDEO_EMBED_HOSTS } from './embeds';

export type MediaKind = 'image' | 'video';

export function InsertMediaModal({
  kind,
  onClose,
  onInsert,
}: {
  kind: MediaKind | null;
  onClose: () => void;
  onInsert: (value: { url: string; alt?: string }) => void;
}) {
  const { t } = useTranslation('common');
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [altError, setAltError] = useState<string | null>(null);

  const close = () => {
    setUrl('');
    setAlt('');
    setError(null);
    setAltError(null);
    onClose();
  };

  const submit = () => {
    const normalized = kind === 'video' ? allowedVideoUrl(url) : allowedImageUrl(url);
    if (!normalized) {
      setError(t(kind === 'video' ? 'editor.videoNotAllowed' : 'editor.imageHttpsOnly'));
      return;
    }
    if (kind === 'image' && !alt.trim()) {
      setAltError(t('editor.altRequired'));
      return;
    }
    onInsert(kind === 'image' ? { url: normalized, alt: alt.trim() } : { url: normalized });
    close();
  };

  return (
    <Modal
      opened={kind !== null}
      onClose={close}
      title={t(kind === 'video' ? 'editor.insertVideo' : 'editor.insertImage')}
    >
      <Stack>
        <TextInput
          label={t('editor.url')}
          placeholder="https://"
          dir="ltr"
          type="url"
          value={url}
          error={error}
          data-autofocus
          onChange={(e) => {
            setUrl(e.currentTarget.value);
            setError(null);
          }}
        />
        {kind === 'image' ? (
          <TextInput
            label={t('editor.altText')}
            description={t('editor.altHint')}
            value={alt}
            error={altError}
            dir="auto"
            onChange={(e) => {
              setAlt(e.currentTarget.value);
              setAltError(null);
            }}
          />
        ) : (
          <Text size="xs" c="dimmed">
            {t('editor.allowedHosts', { hosts: VIDEO_EMBED_HOSTS.join(', ') })}
          </Text>
        )}
        {kind === 'image' ? (
          <Text size="xs" c="dimmed">
            {t('editor.licenceReminder')}
          </Text>
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={submit}>{t('editor.insert')}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

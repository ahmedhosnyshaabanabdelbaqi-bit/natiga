import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface ConfirmDialogProps {
  opened: boolean;
  onClose: () => void;
  /** May be async; the dialog shows a spinner and closes only on success. */
  onConfirm: () => unknown;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  /** Extra safety: the user must type this text to enable the confirm button. */
  requireText?: string;
  loading?: boolean;
}

type BodyProps = Omit<ConfirmDialogProps, 'opened' | 'title'> & {
  busy: boolean;
  setPending: (pending: boolean) => void;
};

/** Rendered only while the modal is open, so its local state resets on every open. */
function ConfirmDialogBody({
  onClose,
  onConfirm,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  requireText,
  busy,
  setPending,
}: BodyProps) {
  const { t } = useTranslation('common');
  const [typed, setTyped] = useState('');
  const blocked = requireText !== undefined && typed.trim() !== requireText;

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // The error is surfaced by the caller (mutation toast / inline error).
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack>
      {typeof message === 'string' ? <Text size="sm">{message}</Text> : message}
      {requireText !== undefined ? (
        <TextInput
          label={t('confirm.typeToConfirm', { text: requireText })}
          value={typed}
          onChange={(e) => setTyped(e.currentTarget.value)}
          autoComplete="off"
          data-autofocus
        />
      ) : null}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose} disabled={busy}>
          {cancelLabel ?? t('actions.cancel')}
        </Button>
        <Button
          color={danger ? 'red' : undefined}
          onClick={() => void handleConfirm()}
          loading={busy}
          disabled={blocked}
        >
          {confirmLabel ?? t('actions.confirm')}
        </Button>
      </Group>
    </Stack>
  );
}

export function ConfirmDialog({
  opened,
  onClose,
  title,
  loading = false,
  ...rest
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const busy = loading || pending;
  return (
    <Modal opened={opened} onClose={busy ? () => undefined : onClose} title={title} centered>
      {opened ? (
        <ConfirmDialogBody {...rest} onClose={onClose} busy={busy} setPending={setPending} />
      ) : null}
    </Modal>
  );
}

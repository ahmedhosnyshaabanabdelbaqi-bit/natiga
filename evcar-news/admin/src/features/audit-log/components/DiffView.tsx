import {
  Badge,
  Code,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconMinus, IconPencil, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeDiff, previewValue, type DiffKind } from '@/lib/diff';

const KIND_META: Record<DiffKind, { color: string; icon: typeof IconPlus }> = {
  added: { color: 'teal', icon: IconPlus },
  removed: { color: 'red', icon: IconMinus },
  changed: { color: 'yellow', icon: IconPencil },
};

function Json({ value }: { value: unknown }) {
  const { t } = useTranslation('audit-log');
  if (value === undefined || value === null)
    return (
      <Text size="sm" c="dimmed">
        {t('diff.none')}
      </Text>
    );
  return (
    <Code
      block
      dir="ltr"
      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 420, overflow: 'auto' }}
    >
      {JSON.stringify(value, null, 2)}
    </Code>
  );
}

/** Field-level diff of an audit entry, with a raw JSON view. */
export function DiffView({ before, after }: { before: unknown; after: unknown }) {
  const { t } = useTranslation('audit-log');
  const [mode, setMode] = useState<'diff' | 'raw'>('diff');
  const entries = computeDiff(before, after);

  return (
    <Stack gap="sm">
      <SegmentedControl
        size="xs"
        value={mode}
        onChange={(v) => setMode(v === 'raw' ? 'raw' : 'diff')}
        data={[
          { value: 'diff', label: t('diff.changes', { count: entries.length }) },
          { value: 'raw', label: t('diff.raw') },
        ]}
      />
      {mode === 'raw' ? (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Stack gap={4}>
            <Text fw={600} size="sm">
              {t('diff.before')}
            </Text>
            <Json value={before} />
          </Stack>
          <Stack gap={4}>
            <Text fw={600} size="sm">
              {t('diff.after')}
            </Text>
            <Json value={after} />
          </Stack>
        </SimpleGrid>
      ) : entries.length === 0 ? (
        <Text size="sm" c="dimmed">
          {before === undefined && after === undefined ? t('diff.noData') : t('diff.noChanges')}
        </Text>
      ) : (
        <ScrollArea type="auto">
          <Table verticalSpacing="xs" miw={560} striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={110}>{t('diff.kind')}</Table.Th>
                <Table.Th>{t('diff.field')}</Table.Th>
                <Table.Th>{t('diff.before')}</Table.Th>
                <Table.Th>{t('diff.after')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {entries.map((entry) => {
                const meta = KIND_META[entry.kind];
                const KindIcon = meta.icon;
                return (
                  <Table.Tr key={`${entry.kind}:${entry.path}`}>
                    <Table.Td>
                      <Badge
                        size="sm"
                        variant="light"
                        color={meta.color}
                        leftSection={<KindIcon size={10} aria-hidden />}
                      >
                        {t(`diff.kinds.${entry.kind}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Code dir="ltr">{entry.path}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Text
                        size="xs"
                        ff="monospace"
                        dir="ltr"
                        ta="start"
                        c={entry.kind === 'added' ? 'dimmed' : undefined}
                        style={{ wordBreak: 'break-word' }}
                      >
                        {entry.kind === 'added' ? '—' : previewValue(entry.before)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text
                        size="xs"
                        ff="monospace"
                        dir="ltr"
                        ta="start"
                        c={entry.kind === 'removed' ? 'dimmed' : undefined}
                        style={{ wordBreak: 'break-word' }}
                      >
                        {entry.kind === 'removed' ? '—' : previewValue(entry.after)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
  );
}

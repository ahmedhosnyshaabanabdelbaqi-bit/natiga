import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon, Group, Paper, Stack, Switch, Text } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconGripVertical } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HomeSectionConfig } from '@/api/types';
import { EmptyState } from '@/components/StateViews';
import { homeSectionsValue, renumber, SETTING_KEYS, type SettingsMap } from '../api';
import { useSaveSetting } from '../hooks';
import { SettingsFormShell } from './SettingsFormShell';

function SortableRow({
  section,
  index,
  count,
  canWrite,
  onToggle,
  onMove,
}: {
  section: HomeSectionConfig;
  index: number;
  count: number;
  canWrite: boolean;
  onToggle: (enabled: boolean) => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const { t } = useTranslation('settings');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.key,
    disabled: !canWrite,
  });
  const label = t(`homeSections.keys.${section.key}`, { defaultValue: section.key });
  return (
    <Paper
      ref={setNodeRef}
      withBorder
      p="xs"
      radius="md"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
        zIndex: isDragging ? 1 : undefined,
        position: 'relative',
      }}
      data-testid={`home-section-${section.key}`}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={t('homeSections.dragHandle', { name: label })}
            disabled={!canWrite}
            style={{ cursor: canWrite ? 'grab' : 'default', touchAction: 'none' }}
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={18} aria-hidden />
          </ActionIcon>
          <Text size="sm" c="dimmed" w={24} ta="center">
            {index + 1}
          </Text>
          <Stack gap={0}>
            <Text size="sm" fw={600}>
              {label}
            </Text>
            <Text size="xs" c="dimmed" dir="ltr" ta="start">
              {section.key}
            </Text>
          </Stack>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Switch
            checked={section.enabled}
            disabled={!canWrite}
            onChange={(e) => onToggle(e.currentTarget.checked)}
            label={t(section.enabled ? 'homeSections.visible' : 'homeSections.hidden')}
          />
          <ActionIcon
            variant="default"
            aria-label={t('homeSections.moveUp', { name: label })}
            disabled={!canWrite || index === 0}
            onClick={() => onMove(-1)}
          >
            <IconArrowUp size={16} aria-hidden />
          </ActionIcon>
          <ActionIcon
            variant="default"
            aria-label={t('homeSections.moveDown', { name: label })}
            disabled={!canWrite || index === count - 1}
            onClick={() => onMove(1)}
          >
            <IconArrowDown size={16} aria-hidden />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}

export function HomeSectionsTab({
  settings,
  canWrite,
}: {
  settings: SettingsMap;
  canWrite: boolean;
}) {
  const { t } = useTranslation('settings');
  const save = useSaveSetting();
  const initial = homeSectionsValue(settings);
  const initialJson = JSON.stringify(renumber(initial));
  const [items, setItems] = useState(initial);
  const [base, setBase] = useState(initialJson);
  if (base !== initialJson) {
    setBase(initialJson);
    setItems(initial);
  }
  const dirty = JSON.stringify(renumber(items)) !== initialJson;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setItems((list) => {
      const from = list.findIndex((s) => s.key === active.id);
      const to = list.findIndex((s) => s.key === over.id);
      return from < 0 || to < 0 ? list : arrayMove(list, from, to);
    });
  };

  const move = (index: number, delta: -1 | 1) =>
    setItems((list) => {
      const target = index + delta;
      return target < 0 || target >= list.length ? list : arrayMove(list, index, target);
    });

  const raw = settings[SETTING_KEYS.homeSections]?.value;
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const sections = renumber(items);
    // Preserve the stored shape ({ sections: [...] } vs a bare array).
    const value =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw, sections } : sections;
    save.mutate({ key: SETTING_KEYS.homeSections, value });
  };

  return (
    <SettingsFormShell
      title={t('homeSections.title')}
      description={t('homeSections.description')}
      records={[settings[SETTING_KEYS.homeSections]]}
      settingKey={SETTING_KEYS.homeSections}
      dirty={dirty}
      submitting={save.isPending}
      canWrite={canWrite}
      onSubmit={submit}
      onReset={() => setItems(initial)}
    >
      {items.length === 0 ? (
        <EmptyState
          title={t('homeSections.emptyTitle')}
          description={t('homeSections.emptyBody')}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((s) => s.key)} strategy={verticalListSortingStrategy}>
            <Stack gap="xs">
              {items.map((section, index) => (
                <SortableRow
                  key={section.key}
                  section={section}
                  index={index}
                  count={items.length}
                  canWrite={canWrite}
                  onToggle={(enabled) =>
                    setItems((list) =>
                      list.map((s) => (s.key === section.key ? { ...s, enabled } : s)),
                    )
                  }
                  onMove={(delta) => move(index, delta)}
                />
              ))}
            </Stack>
          </SortableContext>
        </DndContext>
      )}
    </SettingsFormShell>
  );
}

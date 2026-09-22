<script setup lang="ts">
/** Paginated table bound to a Laravel paginator response. */
import { onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { http, toApiError } from '@/lib/api';
import type { ApiError } from '@/types';

const props = defineProps<{
    url: string;
    columns: Array<{ key: string; label: string; format?: (row: Record<string, unknown>) => string; numeric?: boolean }>;
    params?: Record<string, unknown>;
    rowKey?: string;
    emptyText?: string;
}>();

const emit = defineEmits<{ select: [Record<string, unknown>] }>();

const rows = ref<Array<Record<string, unknown>>>([]);
const page = ref(1);
const lastPage = ref(1);
const total = ref(0);
const loading = ref(false);
const error = ref<ApiError | null>(null);

async function load() {
    loading.value = true;
    error.value = null;
    try {
        const { data } = await http.get(props.url, { params: { ...props.params, page: page.value } });
        // Supports both a paginator and a plain array.
        rows.value = data.data ?? data;
        lastPage.value = data.last_page ?? 1;
        total.value = data.total ?? rows.value.length;
    } catch (e) {
        error.value = toApiError(e);
    } finally {
        loading.value = false;
    }
}

onMounted(load);
watch(() => [props.params, props.url], () => { page.value = 1; void load(); }, { deep: true });
watch(page, load);

defineExpose({ reload: load });

function cell(row: Record<string, unknown>, column: (typeof props.columns)[number]): string {
    if (column.format) return column.format(row);
    const value = column.key.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], row);
    return value === null || value === undefined ? '—' : String(value);
}
</script>

<template>
    <div class="card overflow-hidden">
        <div class="scroll-slim overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="border-b border-line bg-surface-2">
                    <tr>
                        <th
                            v-for="column in columns"
                            :key="column.key"
                            class="whitespace-nowrap px-3 py-2.5 text-right text-[11px] font-extrabold uppercase tracking-wide text-ink-muted"
                        >
                            {{ column.label }}
                        </th>
                    </tr>
                </thead>

                <tbody>
                    <tr v-if="loading">
                        <td :colspan="columns.length" class="py-10 text-center text-sm text-ink-subtle">
                            جارٍ التحميل…
                        </td>
                    </tr>

                    <tr v-else-if="!rows.length">
                        <td :colspan="columns.length" class="py-12 text-center">
                            <span class="mx-auto grid size-12 place-items-center rounded-full bg-surface-2 text-ink-subtle">
                                <AppIcon name="search" :size="22" />
                            </span>
                            <p class="mt-2.5 text-sm text-ink-subtle">{{ emptyText ?? 'لا توجد بيانات' }}</p>
                        </td>
                    </tr>

                    <tr
                        v-for="row in rows"
                        v-else
                        :key="String(row[rowKey ?? 'id'])"
                        class="cursor-pointer border-b border-line last:border-0 t-fast hover:bg-surface-2"
                        @click="emit('select', row)"
                    >
                        <td
                            v-for="column in columns"
                            :key="column.key"
                            class="whitespace-nowrap px-3 py-2.5"
                            :class="column.numeric ? 'num font-bold' : ''"
                        >
                            {{ cell(row, column) }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-if="lastPage > 1" class="flex items-center justify-between border-t border-line bg-surface-2 px-3 py-2">
            <span class="num text-xs text-ink-muted">{{ total }} سجل</span>
            <div class="flex items-center gap-1.5">
                <button
                    class="grid size-8 place-items-center rounded-md bg-surface-1 text-ink-muted ring-1 ring-line t-fast hover:bg-surface-3 disabled:opacity-35"
                    :disabled="page <= 1"
                    aria-label="السابق"
                    @click="page--"
                >
                    <AppIcon name="chevronRight" :size="15" />
                </button>
                <span class="num px-2 text-xs font-bold">{{ page }} / {{ lastPage }}</span>
                <button
                    class="grid size-8 place-items-center rounded-md bg-surface-1 text-ink-muted ring-1 ring-line t-fast hover:bg-surface-3 disabled:opacity-35"
                    :disabled="page >= lastPage"
                    aria-label="التالي"
                    @click="page++"
                >
                    <AppIcon name="chevronLeft" :size="15" />
                </button>
            </div>
        </div>

        <p
            v-if="error"
            class="flex items-center gap-2 border-t border-danger/25 bg-danger-soft px-3 py-2.5 text-sm font-bold text-danger"
            role="alert"
        >
            <AppIcon name="alert" :size="15" />
            {{ error.message }}
        </p>
    </div>
</template>

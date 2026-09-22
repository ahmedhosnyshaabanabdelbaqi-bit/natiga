<script setup lang="ts">
/** Paginated table bound to a Laravel paginator response. */
import { onMounted, ref, watch } from 'vue';
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
    <div class="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200">
        <table class="w-full text-sm">
            <thead class="bg-ink-50 text-xs text-ink-600">
                <tr>
                    <th v-for="column in columns" :key="column.key" class="px-3 py-2 text-right font-black">{{ column.label }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-if="loading"><td :colspan="columns.length" class="py-8 text-center text-ink-400">جارٍ التحميل…</td></tr>
                <tr v-else-if="!rows.length"><td :colspan="columns.length" class="py-8 text-center text-ink-400">{{ emptyText ?? 'لا توجد بيانات' }}</td></tr>
                <tr
                    v-for="row in rows"
                    v-else
                    :key="String(row[rowKey ?? 'id'])"
                    class="cursor-pointer border-t border-ink-100 hover:bg-ink-50"
                    @click="emit('select', row)"
                >
                    <td v-for="column in columns" :key="column.key" class="px-3 py-2" :class="column.numeric ? 'num' : ''">
                        {{ cell(row, column) }}
                    </td>
                </tr>
            </tbody>
        </table>

        <div v-if="lastPage > 1" class="flex items-center justify-between border-t border-ink-100 px-3 py-2 text-sm">
            <span class="text-ink-500">{{ total }} سجل</span>
            <div class="flex gap-2">
                <button class="rounded-lg bg-ink-100 px-3 py-1 font-bold disabled:opacity-40" :disabled="page <= 1" @click="page--">السابق</button>
                <span class="num px-2 py-1">{{ page }} / {{ lastPage }}</span>
                <button class="rounded-lg bg-ink-100 px-3 py-1 font-bold disabled:opacity-40" :disabled="page >= lastPage" @click="page++">التالي</button>
            </div>
        </div>

        <p v-if="error" class="border-t border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm font-bold text-danger-600">{{ error.message }}</p>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { http, toApiError } from '@/lib/api';
import * as M from '@/lib/money';
import { useConnectionStore } from '@/stores/connection';
import type { ApiError } from '@/types';

/**
 * Opening and closing the till.
 *
 * Blind counting is the default: the expected figure is withheld from the
 * cashier until the counted cash has been entered, so the count is honest.
 */
const emit = defineEmits<{ close: [] }>();
const connection = useConnectionStore();

interface CurrentShift {
    id: number;
    number: string;
    status: string;
    opened_at: string;
    opening_float: string;
    blind_count: boolean;
    expected_cash: string | null;
    totals: Record<string, unknown>;
}

const shift = ref<CurrentShift | null>(null);
const loading = ref(true);
const error = ref<ApiError | null>(null);
const openingFloat = ref('0');
const countedCash = ref('');
const notes = ref('');
const denominations = ref<Record<string, number>>({});
const closed = ref<Record<string, unknown> | null>(null);
const allowUnsynced = ref(false);

const NOTES = ['200', '100', '50', '20', '10', '5', '1', '0.5', '0.25'];

onMounted(load);

async function load() {
    loading.value = true;
    try {
        const { data } = await http.get('/shifts/current');
        shift.value = data.shift;
    } catch (e) {
        error.value = toApiError(e);
    } finally {
        loading.value = false;
    }
}

async function open() {
    error.value = null;
    try {
        await http.post('/shifts', { opening_float: openingFloat.value || '0', blind_count: true });
        await load();
    } catch (e) {
        error.value = toApiError(e);
    }
}

function countedFromDenominations(): string {
    return M.sum(
        Object.entries(denominations.value).map(([note, count]) => M.multiply(note, String(count || 0))),
    );
}

function applyDenominations() {
    countedCash.value = M.round(countedFromDenominations(), 2);
}

async function close() {
    if (!shift.value) return;
    error.value = null;

    try {
        const { data } = await http.post(`/shifts/${shift.value.id}/close`, {
            counted_cash: countedCash.value || '0',
            denominations: Object.keys(denominations.value).length ? denominations.value : undefined,
            notes: notes.value || undefined,
            allow_unsynced: allowUnsynced.value || undefined,
        });
        closed.value = data.report;
        shift.value = null;
    } catch (e) {
        const api = toApiError(e);
        error.value = api;
        if (api.error_code === 'unsynced_operations_pending') {
            error.value = {
                ...api,
                message: `لا يمكن الإغلاق النهائي: يوجد ${api.context?.pending ?? ''} عملية محلية لم تُزامَن. زامن أولًا، أو أغلق بمسار الاستثناء باعتماد المدير.`,
            };
        }
    }
}
</script>

<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4">
        <div class="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white">
            <header class="flex items-center justify-between border-b border-ink-200 px-4 py-3">
                <h2 class="text-lg font-black">الوردية والخزنة</h2>
                <button class="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-bold" @click="emit('close')">إغلاق</button>
            </header>

            <div class="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-4">
                <p v-if="loading" class="text-center text-ink-400">جارٍ التحميل…</p>

                <!-- close-out report -->
                <div v-else-if="closed" class="space-y-2">
                    <h3 class="text-lg font-black text-cash-600">تم إغلاق الوردية</h3>
                    <dl class="divide-y divide-ink-100 rounded-xl ring-1 ring-ink-200">
                        <div v-for="(value, key) in closed" :key="key" class="flex justify-between px-3 py-2 text-sm">
                            <dt class="font-bold">{{ key }}</dt>
                            <dd class="num">{{ typeof value === 'object' ? JSON.stringify(value) : value }}</dd>
                        </div>
                    </dl>
                </div>

                <!-- open a shift -->
                <div v-else-if="!shift" class="space-y-3">
                    <p class="text-sm text-ink-600">لا توجد وردية مفتوحة على هذا الكاشير.</p>
                    <label class="block text-sm font-bold">العهدة الافتتاحية</label>
                    <input v-model="openingFloat" data-keep-focus="true" class="num w-full rounded-xl border border-ink-300 px-3 py-2.5" />
                    <button class="w-full rounded-xl bg-cash-600 py-3 font-black text-white" @click="open">فتح الوردية</button>
                </div>

                <!-- close a shift -->
                <div v-else class="space-y-3">
                    <div class="rounded-xl bg-ink-50 p-3 text-sm">
                        <p><b>وردية {{ shift.number }}</b> — بدأت {{ new Date(shift.opened_at).toLocaleString('ar-EG') }}</p>
                        <p class="num">العهدة الافتتاحية: {{ M.formatMoney(shift.opening_float) }}</p>
                        <p v-if="shift.blind_count && shift.expected_cash === null" class="mt-1 text-xs text-ink-500">
                            العد الأعمى مفعّل: المتوقع لا يظهر قبل تسجيل المبلغ الفعلي.
                        </p>
                        <p v-else-if="shift.expected_cash" class="num mt-1 font-bold">
                            النقد المتوقع: {{ M.formatMoney(shift.expected_cash) }}
                        </p>
                    </div>

                    <div>
                        <p class="mb-1 text-sm font-bold">العد بالفئات (اختياري)</p>
                        <div class="grid grid-cols-3 gap-2">
                            <label v-for="note in NOTES" :key="note" class="flex items-center gap-1 text-xs">
                                <span class="num w-10">{{ note }}</span>
                                <input
                                    v-model.number="denominations[note]"
                                    type="number"
                                    min="0"
                                    data-keep-focus="true"
                                    class="num w-full rounded border border-ink-300 px-2 py-1"
                                    @input="applyDenominations"
                                />
                            </label>
                        </div>
                    </div>

                    <label class="block text-sm font-bold">النقد الفعلي في الدرج</label>
                    <input v-model="countedCash" data-keep-focus="true" class="num w-full rounded-xl border-2 border-ink-300 px-3 py-3 text-xl font-black" />

                    <input v-model="notes" data-keep-focus="true" placeholder="ملاحظات الإغلاق" class="w-full rounded-xl border border-ink-300 px-3 py-2 text-sm" />

                    <label v-if="connection.pendingCount > 0" class="flex items-center gap-2 rounded-xl bg-warn-500/10 p-3 text-sm">
                        <input v-model="allowUnsynced" type="checkbox" class="h-4 w-4" />
                        <span>إغلاق استثنائي رغم وجود {{ connection.pendingCount }} عملية غير متزامنة (يتطلب صلاحية المدير ويُسجَّل).</span>
                    </label>

                    <button class="w-full rounded-xl bg-danger-600 py-3 font-black text-white" @click="close">
                        إغلاق الوردية وحساب الفرق
                    </button>
                </div>
            </div>

            <p v-if="error" class="border-t border-danger-500/30 bg-danger-500/10 px-4 py-2 text-sm font-bold text-danger-600">
                {{ error.message }}
            </p>
        </div>
    </div>
</template>

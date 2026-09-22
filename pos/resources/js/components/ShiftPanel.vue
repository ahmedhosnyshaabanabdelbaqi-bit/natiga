<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import PanelShell from '@/components/PanelShell.vue';
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

/** أسماء عربية لحقول تقرير الإغلاق القادم من الخادم. */
const labels: Record<string, string> = {
    sales_count: 'عدد الفواتير',
    sales_total: 'إجمالي المبيعات',
    discounts_total: 'الخصومات',
    tax_total: 'الضريبة',
    credit_total: 'مبيعات آجلة',
    returns_count: 'عدد المرتجعات',
    returns_total: 'قيمة المرتجعات',
    returns_cash: 'مرتجعات نقدية',
    opening_float: 'العهدة الافتتاحية',
    expected_cash: 'النقد المتوقع',
    counted_cash: 'النقد الفعلي',
    variance: 'العجز / الزيادة',
    business_date: 'يوم العمل',
};

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
    <PanelShell title="الوردية والخزنة" icon="wallet" @close="emit('close')">
        <div class="scroll-slim min-h-0 flex-1 overflow-y-auto p-4">
            <p v-if="loading" class="py-10 text-center text-sm text-ink-subtle">جارٍ التحميل…</p>

            <!-- ─── تقرير الإغلاق ─── -->
            <div v-else-if="closed" class="space-y-3">
                <div class="flex items-center gap-2.5">
                    <span class="grid size-10 place-items-center rounded-full bg-cash-soft text-cash">
                        <AppIcon name="check" :size="20" />
                    </span>
                    <h3 class="text-lg font-black text-cash">تم إغلاق الوردية</h3>
                </div>

                <dl class="divide-y divide-line overflow-hidden rounded-lg border border-line">
                    <div
                        v-for="(value, key) in closed"
                        v-show="typeof value !== 'object'"
                        :key="key"
                        class="flex justify-between bg-surface-1 px-3 py-2 text-sm"
                    >
                        <dt class="font-bold text-ink-muted">{{ labels[key] ?? key }}</dt>
                        <dd class="num font-extrabold">{{ value }}</dd>
                    </div>
                </dl>
            </div>

            <!-- ─── فتح وردية ─── -->
            <div v-else-if="!shift" class="space-y-3">
                <p class="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2.5 text-sm text-ink-muted">
                    <AppIcon name="info" :size="16" class="mt-px text-info" />
                    لا توجد وردية مفتوحة على هذا الكاشير. البيع لا يبدأ قبل فتحها.
                </p>
                <label class="block text-sm font-bold">
                    العهدة الافتتاحية
                    <input v-model="openingFloat" data-keep-focus="true" class="num field-lg mt-1.5" />
                </label>
                <button
                    class="t-pop flex w-full items-center justify-center gap-2 rounded-lg bg-cash py-3.5 font-black text-white t-fast hover:bg-cash-strong"
                    @click="open"
                >
                    <AppIcon name="check" :size="19" />
                    فتح الوردية
                </button>
            </div>

            <!-- ─── إغلاق وردية ─── -->
            <div v-else class="space-y-3">
                <div class="rounded-lg border border-line bg-surface-2 p-3 text-sm">
                    <p class="flex flex-wrap items-center gap-2">
                        <span class="num rounded bg-surface-1 px-2 py-0.5 font-extrabold">{{ shift.number }}</span>
                        <span class="num text-ink-muted">
                            بدأت {{ new Date(shift.opened_at).toLocaleString('ar-EG') }}
                        </span>
                    </p>
                    <p class="num mt-1.5 flex justify-between">
                        <span class="text-ink-muted">العهدة الافتتاحية</span>
                        <b>{{ M.formatMoney(shift.opening_float) }}</b>
                    </p>

                    <!-- العد الأعمى: المتوقع لا يظهر قبل تسجيل الفعلي -->
                    <p
                        v-if="shift.blind_count && shift.expected_cash === null"
                        class="mt-2 flex items-start gap-1.5 border-t border-line pt-2 text-[11px] text-ink-subtle"
                    >
                        <AppIcon name="lock" :size="13" class="mt-px" />
                        العد الأعمى مفعّل: المتوقع لا يظهر قبل تسجيل المبلغ الفعلي.
                    </p>
                    <p
                        v-else-if="shift.expected_cash"
                        class="num mt-2 flex justify-between border-t border-line pt-2 font-bold"
                    >
                        <span>النقد المتوقع</span>
                        <span>{{ M.formatMoney(shift.expected_cash) }}</span>
                    </p>
                </div>

                <div>
                    <p class="mb-1.5 text-sm font-bold">العد بالفئات (اختياري)</p>
                    <div class="grid grid-cols-3 gap-1.5">
                        <label
                            v-for="note in NOTES"
                            :key="note"
                            class="flex items-center gap-1.5 rounded-md border border-line bg-surface-1 px-2 py-1.5"
                        >
                            <span class="num w-8 text-[11px] font-bold text-ink-muted">{{ note }}</span>
                            <input
                                v-model.number="denominations[note]"
                                type="number"
                                min="0"
                                data-keep-focus="true"
                                :aria-label="`عدد فئة ${note}`"
                                class="num w-full border-0 bg-transparent p-0 text-sm outline-none"
                                @input="applyDenominations"
                            />
                        </label>
                    </div>
                </div>

                <label class="block text-sm font-bold">
                    النقد الفعلي في الدرج
                    <input v-model="countedCash" data-keep-focus="true" class="num field-lg mt-1.5 !border-2 text-xl" />
                </label>

                <input v-model="notes" data-keep-focus="true" placeholder="ملاحظات الإغلاق" class="field text-sm" />

                <label
                    v-if="connection.pendingCount > 0"
                    class="flex items-start gap-2.5 rounded-lg border border-warn/35 bg-warn-soft p-3 text-sm"
                >
                    <input v-model="allowUnsynced" type="checkbox" class="mt-0.5 size-4 accent-[var(--color-warn)]" />
                    <span>
                        إغلاق استثنائي رغم وجود
                        <b class="num">{{ connection.pendingCount }}</b>
                        عملية غير متزامنة — يتطلب صلاحية المدير ويُسجَّل في التدقيق.
                    </span>
                </label>

                <button
                    class="t-pop flex w-full items-center justify-center gap-2 rounded-lg bg-danger py-3.5 font-black text-white t-fast hover:bg-danger-strong"
                    @click="close"
                >
                    <AppIcon name="lock" :size="19" />
                    إغلاق الوردية وحساب الفرق
                </button>
            </div>
        </div>

        <p
            v-if="error"
            class="flex shrink-0 items-start gap-2 border-t border-danger/25 bg-danger-soft px-4 py-2.5 text-sm font-bold text-danger"
            role="alert"
        >
            <AppIcon name="alert" :size="16" class="mt-0.5" />
            {{ error.message }}
        </p>
    </PanelShell>
</template>

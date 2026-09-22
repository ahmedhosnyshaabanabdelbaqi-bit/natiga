<script setup lang="ts">
import { ref } from 'vue';
import { http, toApiError, uuid } from '@/lib/api';
import * as M from '@/lib/money';
import type { ApiError } from '@/types';

/**
 * Returns, always against the original invoice.
 *
 * The server states how much of each line is still returnable and what each
 * unit ACTUALLY cost the customer after discounts; this panel never re-prices
 * from today's list.
 */
const emit = defineEmits<{ close: [] }>();

interface ReturnableLine {
    sale_line_id: number;
    product_name: string;
    unit_name: string;
    qty_sold: string;
    qty_returned_base: string;
    qty_returnable_base: string;
    unit_price: string;
    effective_unit_total: string;
    serials: string[];
}

const query = ref('');
const sale = ref<{ id: number; number: string; is_credit: boolean } | null>(null);
const lines = ref<ReturnableLine[]>([]);
const outstanding = ref('0');
const selection = ref<Record<number, { qty: string; disposition: string; serials: string[] }>>({});
const reason = ref('');
const error = ref<ApiError | null>(null);
const loading = ref(false);
const done = ref<{ number: string; refund_cash: string; credit_applied: string } | null>(null);

async function findSale() {
    if (!query.value.trim()) return;
    loading.value = true;
    error.value = null;
    sale.value = null;

    try {
        const { data } = await http.get('/sales', { params: { number: query.value.trim(), per_page: 1 } });
        const found = data.data?.[0];
        if (!found) {
            error.value = { message: 'لم يتم العثور على فاتورة بهذا الرقم.' };
            return;
        }
        const detail = await http.get(`/sales/${found.id}/returnable`);
        sale.value = detail.data.sale;
        lines.value = detail.data.lines;
        outstanding.value = detail.data.outstanding;
        selection.value = {};
    } catch (e) {
        error.value = toApiError(e);
    } finally {
        loading.value = false;
    }
}

function toggle(line: ReturnableLine) {
    if (selection.value[line.sale_line_id]) {
        delete selection.value[line.sale_line_id];
    } else {
        selection.value[line.sale_line_id] = {
            qty: line.qty_returnable_base,
            disposition: 'resalable',
            serials: [],
        };
    }
}

const refundEstimate = () =>
    M.sum(
        Object.entries(selection.value).map(([id, pick]) => {
            const line = lines.value.find((l) => l.sale_line_id === Number(id));
            return line ? M.multiply(pick.qty, line.effective_unit_total) : '0';
        }),
    );

async function submit() {
    if (!sale.value || Object.keys(selection.value).length === 0) return;
    loading.value = true;
    error.value = null;

    try {
        const { data } = await http.post(
            '/returns',
            {
                sale_id: sale.value.id,
                reason: reason.value || undefined,
                lines: Object.entries(selection.value).map(([id, pick]) => ({
                    sale_line_id: Number(id),
                    qty: pick.qty,
                    disposition: pick.disposition,
                    ...(pick.serials.length ? { serials: pick.serials } : {}),
                })),
            },
            { headers: { 'Idempotency-Key': uuid() } },
        );

        done.value = {
            number: data.number,
            refund_cash: data.refund_cash,
            credit_applied: data.credit_applied,
        };
    } catch (e) {
        error.value = toApiError(e);
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4">
        <div class="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white">
            <header class="flex items-center justify-between border-b border-ink-200 px-4 py-3">
                <h2 class="text-lg font-black">مرتجع مبيعات</h2>
                <button class="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-bold" @click="emit('close')">إغلاق</button>
            </header>

            <div v-if="done" class="p-6 text-center">
                <p class="text-xl font-black text-cash-600">تم تسجيل المرتجع {{ done.number }}</p>
                <p v-if="!M.isZero(done.credit_applied)" class="mt-2 text-sm">
                    تم تخفيض مديونية العميل بمقدار <b class="num">{{ M.formatMoney(done.credit_applied) }}</b>
                </p>
                <p v-if="!M.isZero(done.refund_cash)" class="mt-1 text-lg font-black">
                    المبلغ المرتجع نقدًا: <span class="num">{{ M.formatMoney(done.refund_cash) }}</span>
                </p>
                <button class="mt-4 rounded-xl bg-brand-600 px-6 py-2.5 font-bold text-white" @click="emit('close')">تم</button>
            </div>

            <template v-else>
                <div class="flex gap-2 border-b border-ink-200 p-4">
                    <input
                        v-model="query"
                        data-keep-focus="true"
                        placeholder="رقم الفاتورة أو امسح الباركود الموجود عليها"
                        class="flex-1 rounded-xl border border-ink-300 px-4 py-2.5 outline-none focus:border-brand-600"
                        @keydown.enter.prevent="findSale"
                    />
                    <button class="rounded-xl bg-brand-600 px-5 py-2.5 font-bold text-white" @click="findSale">بحث</button>
                </div>

                <div class="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-4">
                    <p v-if="loading" class="text-center text-ink-400">جارٍ التحميل…</p>

                    <template v-else-if="sale">
                        <p class="mb-3 text-sm">
                            فاتورة <b>{{ sale.number }}</b>
                            <span v-if="sale.is_credit" class="mr-2 rounded bg-warn-500/20 px-2 py-0.5 text-xs font-bold text-warn-500">
                                آجلة — المتبقي على العميل {{ M.formatMoney(outstanding) }}
                            </span>
                        </p>

                        <ul class="divide-y divide-ink-100 rounded-xl ring-1 ring-ink-200">
                            <li v-for="line in lines" :key="line.sale_line_id" class="p-3">
                                <label class="flex items-start gap-3">
                                    <input
                                        type="checkbox"
                                        class="mt-1 h-4 w-4"
                                        :checked="!!selection[line.sale_line_id]"
                                        :disabled="M.compare(line.qty_returnable_base, '0') <= 0"
                                        @change="toggle(line)"
                                    />
                                    <span class="min-w-0 flex-1">
                                        <span class="block font-bold">{{ line.product_name }}</span>
                                        <span class="block text-xs text-ink-500">
                                            بيعت {{ M.formatQty(line.qty_sold) }} {{ line.unit_name }} ·
                                            سبق إرجاع {{ M.formatQty(line.qty_returned_base) }} ·
                                            متاح للإرجاع <b>{{ M.formatQty(line.qty_returnable_base) }}</b>
                                        </span>
                                        <span class="num block text-xs text-ink-600">
                                            القيمة الفعلية للوحدة بعد الخصم: {{ M.formatMoney(line.effective_unit_total) }}
                                        </span>
                                    </span>
                                </label>

                                <div v-if="selection[line.sale_line_id]" class="mr-7 mt-2 flex flex-wrap items-center gap-2">
                                    <input
                                        v-model="selection[line.sale_line_id].qty"
                                        data-keep-focus="true"
                                        class="num w-24 rounded-lg border border-ink-300 px-2 py-1.5 text-sm"
                                    />
                                    <select v-model="selection[line.sale_line_id].disposition" class="rounded-lg border border-ink-300 px-2 py-1.5 text-sm">
                                        <option value="resalable">صالح للبيع</option>
                                        <option value="damaged">تالف</option>
                                        <option value="inspection">يحتاج فحص</option>
                                        <option value="returns_warehouse">إلى مخزن المرتجعات</option>
                                    </select>
                                    <span class="num text-sm font-bold">
                                        = {{ M.formatMoney(M.multiply(selection[line.sale_line_id].qty, line.effective_unit_total)) }}
                                    </span>
                                </div>
                            </li>
                        </ul>

                        <input
                            v-model="reason"
                            data-keep-focus="true"
                            placeholder="سبب المرتجع"
                            class="mt-3 w-full rounded-xl border border-ink-300 px-3 py-2 text-sm"
                        />
                    </template>

                    <p v-else class="text-center text-ink-400">ابحث عن الفاتورة الأصلية للبدء</p>
                </div>

                <p v-if="error" class="border-t border-danger-500/30 bg-danger-500/10 px-4 py-2 text-sm font-bold text-danger-600">
                    {{ error.message }}
                </p>

                <footer v-if="sale" class="flex items-center gap-3 border-t border-ink-200 p-3">
                    <span class="num text-lg font-black">قيمة المرتجع: {{ M.formatMoney(refundEstimate()) }}</span>
                    <button
                        class="mr-auto rounded-xl bg-danger-600 px-6 py-3 font-black text-white disabled:opacity-40"
                        :disabled="loading || Object.keys(selection).length === 0"
                        @click="submit"
                    >
                        تنفيذ المرتجع
                    </button>
                </footer>
            </template>
        </div>
    </div>
</template>

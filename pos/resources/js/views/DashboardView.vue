<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { http, toApiError } from '@/lib/api';
import * as M from '@/lib/money';
import type { ApiError } from '@/types';

/**
 * Owner dashboard.
 *
 * Every figure carries its definition, and each one opens the documents behind
 * it — a number nobody can trace is a number nobody can trust.
 */
interface Dashboard {
    period: { from: string; to: string; timezone: string };
    invoices: number;
    gross_sales: string;
    returns_total: string;
    net_sales: string;
    tax_collected: string;
    discounts: string;
    cost_of_sales?: string;
    gross_profit?: string;
    expenses: string;
    operating_profit?: string;
    credit_sales: string;
    cash_positions: Record<string, string>;
    receivables: string;
    payables: string;
    alerts: Record<string, number>;
    definition: Record<string, string>;
}

const data = ref<Dashboard | null>(null);
const drill = ref<{ metric: string; rows: unknown[] } | null>(null);
const error = ref<ApiError | null>(null);
const from = ref(new Date().toISOString().slice(0, 10));
const to = ref(new Date().toISOString().slice(0, 10));

onMounted(load);

async function load() {
    try {
        const response = await http.get('/reports/dashboard', { params: { from: from.value, to: to.value } });
        data.value = response.data;
    } catch (e) {
        error.value = toApiError(e);
    }
}

async function openDrill(metric: string) {
    try {
        const response = await http.get('/reports/drill-down', {
            params: { metric, from: from.value, to: to.value },
        });
        drill.value = { metric, rows: response.data.rows };
    } catch (e) {
        error.value = toApiError(e);
    }
}

const cards = () => {
    if (!data.value) return [];
    const d = data.value;
    return [
        { key: 'gross_sales', label: 'مبيعات اليوم (إجمالي)', value: d.gross_sales, drill: 'gross_sales' },
        { key: 'returns_total', label: 'المرتجعات', value: d.returns_total, drill: 'returns_total' },
        { key: 'net_sales', label: 'صافي المبيعات', value: d.net_sales, drill: 'net_sales', emphasis: true },
        { key: 'gross_profit', label: 'مجمل الربح', value: d.gross_profit, emphasis: true },
        { key: 'expenses', label: 'المصروفات', value: d.expenses, drill: 'expenses' },
        { key: 'operating_profit', label: 'الربح التشغيلي', value: d.operating_profit, emphasis: true },
        { key: 'receivables', label: 'مستحقات على العملاء', value: d.receivables },
        { key: 'payables', label: 'مستحقات للموردين', value: d.payables },
    ].filter((card) => card.value !== undefined);
};

const alertLabels: Record<string, string> = {
    lowStock: 'أصناف تحت الحد الأدنى',
    expiringSoon: 'دفعات قاربت الانتهاء',
    expired: 'دفعات منتهية',
    openShifts: 'ورديات مفتوحة',
    unsynced: 'عمليات غير متزامنة',
    overdue: 'فواتير آجلة متأخرة',
};
</script>

<template>
    <div>
        <div class="mb-4 flex flex-wrap items-end gap-2">
            <label class="text-sm font-bold">من <input v-model="from" type="date" class="mr-1 rounded-lg border border-ink-300 px-2 py-1.5" /></label>
            <label class="text-sm font-bold">إلى <input v-model="to" type="date" class="mr-1 rounded-lg border border-ink-300 px-2 py-1.5" /></label>
            <button class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white" @click="load">تحديث</button>
            <span v-if="data" class="text-xs text-ink-500">التوقيت: {{ data.period.timezone }}</span>
        </div>

        <div v-if="data" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
                v-for="card in cards()"
                :key="card.key"
                class="rounded-2xl bg-white p-4 text-right shadow-sm ring-1 ring-ink-200"
                :class="card.drill ? 'cursor-pointer hover:ring-brand-500' : 'cursor-default'"
                @click="card.drill && openDrill(card.drill)"
            >
                <p class="text-xs font-bold text-ink-500">{{ card.label }}</p>
                <p class="num mt-1 text-2xl font-black" :class="card.emphasis ? 'text-brand-700' : ''">
                    {{ M.formatMoney(card.value) }}
                </p>
                <p v-if="card.drill" class="mt-1 text-[11px] text-ink-400">اضغط لعرض المستندات</p>
            </button>
        </div>

        <section v-if="data" class="mt-4 grid gap-3 lg:grid-cols-2">
            <div class="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
                <h3 class="mb-2 text-sm font-black">حالة الخزائن</h3>
                <dl class="space-y-1 text-sm">
                    <div v-for="(value, code) in data.cash_positions" :key="code" class="flex justify-between">
                        <dt>{{ code }}</dt>
                        <dd class="num font-bold">{{ M.formatMoney(value) }}</dd>
                    </div>
                </dl>
            </div>

            <div class="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
                <h3 class="mb-2 text-sm font-black">تنبيهات</h3>
                <ul class="space-y-1 text-sm">
                    <li v-for="(count, key) in data.alerts" :key="key" class="flex justify-between">
                        <span>{{ alertLabels[key] ?? key }}</span>
                        <span class="num font-bold" :class="count > 0 ? 'text-danger-600' : 'text-ink-400'">{{ count }}</span>
                    </li>
                </ul>
            </div>
        </section>

        <section v-if="data" class="mt-4 rounded-2xl bg-ink-50 p-4 text-xs text-ink-600 ring-1 ring-ink-200">
            <h3 class="mb-1 font-black text-ink-700">تعريف الأرقام</h3>
            <p v-for="(text, key) in data.definition" :key="key">• <b>{{ key }}</b>: {{ text }}</p>
        </section>

        <div v-if="drill" class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4" @click.self="drill = null">
            <div class="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white">
                <header class="flex items-center justify-between border-b border-ink-200 px-4 py-3">
                    <h3 class="font-black">المستندات المكوِّنة لـ {{ drill.metric }}</h3>
                    <button class="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-bold" @click="drill = null">إغلاق</button>
                </header>
                <div class="scrollbar-slim min-h-0 flex-1 overflow-auto p-4">
                    <table class="w-full text-sm">
                        <tbody>
                            <tr v-for="(row, i) in drill.rows" :key="i" class="border-b border-ink-100">
                                <td v-for="(value, key) in (row as Record<string, unknown>)" :key="key" class="px-2 py-1.5">
                                    {{ value }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-if="!drill.rows.length" class="py-8 text-center text-ink-400">لا توجد مستندات في هذه الفترة</p>
                </div>
            </div>
        </div>

        <p v-if="error" class="mt-4 rounded-lg bg-danger-500/10 px-3 py-2 text-sm font-bold text-danger-600">{{ error.message }}</p>
    </div>
</template>

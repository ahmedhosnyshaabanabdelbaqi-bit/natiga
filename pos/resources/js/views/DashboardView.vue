<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
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
        { key: 'gross_sales', label: 'مبيعات اليوم (إجمالي)', value: d.gross_sales, drill: 'gross_sales', icon: 'receipt', tone: 'brand' },
        { key: 'returns_total', label: 'المرتجعات', value: d.returns_total, drill: 'returns_total', icon: 'undo', tone: 'plain' },
        { key: 'net_sales', label: 'صافي المبيعات', value: d.net_sales, drill: 'net_sales', icon: 'chart', tone: 'brand' },
        { key: 'gross_profit', label: 'مجمل الربح', value: d.gross_profit, icon: 'gauge', tone: 'cash' },
        { key: 'expenses', label: 'المصروفات', value: d.expenses, drill: 'expenses', icon: 'wallet', tone: 'plain' },
        { key: 'operating_profit', label: 'الربح التشغيلي', value: d.operating_profit, icon: 'chart', tone: 'cash' },
        { key: 'receivables', label: 'مستحقات على العملاء', value: d.receivables, icon: 'users', tone: 'plain' },
        { key: 'payables', label: 'مستحقات للموردين', value: d.payables, icon: 'truck', tone: 'plain' },
    ].filter((card) => card.value !== undefined);
};

const alertIcons: Record<string, string> = {
    lowStock: 'box',
    expiringSoon: 'clock',
    expired: 'alert',
    openShifts: 'clock',
    unsynced: 'sync',
    overdue: 'receipt',
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
    <div class="space-y-4">
        <!-- ─── الفترة ─── -->
        <div class="flex flex-wrap items-end gap-2">
            <h1 class="me-auto text-xl font-black">لوحة المالك</h1>
            <label class="text-xs font-bold text-ink-muted">
                من
                <input v-model="from" type="date" class="field num mt-1 !w-auto !py-2 text-sm" />
            </label>
            <label class="text-xs font-bold text-ink-muted">
                إلى
                <input v-model="to" type="date" class="field num mt-1 !w-auto !py-2 text-sm" />
            </label>
            <button
                class="t-pop flex items-center gap-1.5 rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white t-fast hover:bg-brand-strong"
                @click="load"
            >
                <AppIcon name="refresh" :size="15" />
                تحديث
            </button>
        </div>

        <!-- ─── المؤشرات ─── -->
        <div v-if="data" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <component
                :is="card.drill ? 'button' : 'div'"
                v-for="card in cards()"
                :key="card.key"
                class="card p-4 text-right t-fast"
                :class="card.drill ? 'cursor-pointer hover:border-brand hover:shadow-md' : ''"
                @click="card.drill && openDrill(card.drill)"
            >
                <span class="flex items-center gap-2">
                    <span
                        class="grid size-7 place-items-center rounded-md"
                        :class="{
                            brand: 'bg-brand-soft text-brand-deep',
                            cash: 'bg-cash-soft text-cash',
                            plain: 'bg-surface-2 text-ink-muted',
                        }[card.tone]"
                    >
                        <AppIcon :name="card.icon" :size="15" />
                    </span>
                    <span class="text-xs font-bold text-ink-muted">{{ card.label }}</span>
                </span>

                <span
                    class="num mt-2 block text-2xl font-black"
                    :class="card.tone === 'cash' ? 'text-cash' : card.tone === 'brand' ? 'text-brand-deep' : 'text-ink'"
                >
                    {{ M.formatMoney(card.value) }}
                </span>

                <span v-if="card.drill" class="mt-1 flex items-center gap-1 text-[10px] text-ink-subtle">
                    <AppIcon name="search" :size="11" />
                    اضغط لعرض المستندات
                </span>
            </component>
        </div>

        <!-- ─── الخزائن والتنبيهات ─── -->
        <section v-if="data" class="grid gap-3 lg:grid-cols-2">
            <div class="card p-4">
                <h3 class="mb-3 flex items-center gap-2 text-sm font-extrabold">
                    <AppIcon name="wallet" :size="16" class="text-brand" />
                    حالة الخزائن
                </h3>
                <dl class="space-y-1.5 text-sm">
                    <div
                        v-for="(value, code) in data.cash_positions"
                        :key="code"
                        class="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2"
                    >
                        <dt class="num font-bold text-ink-muted">{{ code }}</dt>
                        <dd class="num font-extrabold">{{ M.formatMoney(value) }}</dd>
                    </div>
                    <p v-if="!Object.keys(data.cash_positions).length" class="text-ink-subtle">لا توجد خزائن</p>
                </dl>
            </div>

            <div class="card p-4">
                <h3 class="mb-3 flex items-center gap-2 text-sm font-extrabold">
                    <AppIcon name="alert" :size="16" class="text-warn" />
                    تنبيهات
                </h3>
                <ul class="space-y-1">
                    <li
                        v-for="(count, key) in data.alerts"
                        :key="key"
                        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                        :class="count > 0 ? 'bg-danger-soft' : ''"
                    >
                        <AppIcon
                            :name="alertIcons[key] ?? 'info'"
                            :size="15"
                            :class="count > 0 ? 'text-danger' : 'text-ink-subtle'"
                        />
                        <span>{{ alertLabels[key] ?? key }}</span>
                        <span
                            class="num mr-auto font-extrabold"
                            :class="count > 0 ? 'text-danger' : 'text-ink-subtle'"
                        >
                            {{ count }}
                        </span>
                    </li>
                </ul>
            </div>
        </section>

        <!-- ─── تعريف الأرقام: رقم لا يُفهم لا يُوثق به ─── -->
        <section v-if="data" class="card bg-surface-2 p-4 text-xs text-ink-muted">
            <h3 class="mb-1.5 flex items-center gap-2 text-sm font-extrabold text-ink">
                <AppIcon name="info" :size="15" class="text-info" />
                تعريف الأرقام
            </h3>
            <p v-for="(text, key) in data.definition" :key="key" class="leading-relaxed">
                • <b class="num text-ink">{{ key }}</b>: {{ text }}
            </p>
            <p class="num mt-2 text-ink-subtle">التوقيت المعتمد: {{ data.period.timezone }}</p>
        </section>

        <!-- ─── المستندات خلف الرقم ─── -->
        <div
            v-if="drill"
            class="fixed inset-0 z-50 flex items-center justify-center bg-chrome/55 p-4 backdrop-blur-[2px]"
            @click.self="drill = null"
        >
            <div class="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-surface-1 shadow-panel">
                <header class="flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-3">
                    <span class="grid size-8 place-items-center rounded-md bg-brand-soft text-brand-deep">
                        <AppIcon name="receipt" :size="17" />
                    </span>
                    <h3 class="num text-sm font-extrabold">المستندات المكوِّنة لـ {{ drill.metric }}</h3>
                    <button
                        class="mr-auto grid size-8 place-items-center rounded-md bg-surface-2 text-ink-muted t-fast hover:bg-surface-3"
                        aria-label="إغلاق"
                        @click="drill = null"
                    >
                        <AppIcon name="close" :size="15" />
                    </button>
                </header>

                <div class="scroll-slim min-h-0 flex-1 overflow-auto p-4">
                    <table v-if="drill.rows.length" class="w-full text-sm">
                        <tbody>
                            <tr
                                v-for="(row, i) in drill.rows"
                                :key="i"
                                class="border-b border-line last:border-0"
                            >
                                <td
                                    v-for="(value, key) in (row as Record<string, unknown>)"
                                    :key="key"
                                    class="px-2 py-2"
                                >
                                    {{ value }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-else class="py-10 text-center text-sm text-ink-subtle">لا توجد مستندات في هذه الفترة</p>
                </div>
            </div>
        </div>

        <p
            v-if="error"
            class="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-bold text-danger"
            role="alert"
        >
            <AppIcon name="alert" :size="16" />
            {{ error.message }}
        </p>
    </div>
</template>

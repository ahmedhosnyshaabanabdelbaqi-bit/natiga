<script setup lang="ts">
import { ref } from 'vue';
import { http, toApiError } from '@/lib/api';
import * as M from '@/lib/money';
import DataTable from '@/components/DataTable.vue';
import type { ApiError } from '@/types';

const selected = ref<Record<string, any> | null>(null);
const report = ref<Record<string, any> | null>(null);
const error = ref<ApiError | null>(null);

const columns = [
    { key: 'number', label: 'رقم الوردية' },
    { key: 'terminal.name', label: 'الكاشير' },
    { key: 'user.name', label: 'المستخدم' },
    { key: 'opened_at', label: 'البداية', format: (r: Record<string, unknown>) => new Date(String(r.opened_at)).toLocaleString('ar-EG') },
    { key: 'status', label: 'الحالة' },
    { key: 'expected_cash', label: 'المتوقع', numeric: true, format: (r: Record<string, unknown>) => M.formatMoney(String(r.expected_cash ?? '0')) },
    { key: 'counted_cash', label: 'الفعلي', numeric: true, format: (r: Record<string, unknown>) => M.formatMoney(String(r.counted_cash ?? '0')) },
    { key: 'variance', label: 'الفرق', numeric: true, format: (r: Record<string, unknown>) => M.formatMoney(String(r.variance ?? '0')) },
];

async function select(row: Record<string, unknown>) {
    try {
        const { data } = await http.get(`/shifts/${row.id}/report`);
        selected.value = data.shift;
        report.value = data.report;
    } catch (e) {
        error.value = toApiError(e);
    }
}

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
    variance: 'العجز/الزيادة',
    business_date: 'يوم العمل',
};
</script>

<template>
    <div>
        <h1 class="mb-3 text-xl font-black">الورديات</h1>
        <DataTable url="/shifts" :columns="columns" @select="select" />

        <section v-if="report" class="mt-4 grid gap-3 lg:grid-cols-2">
            <div class="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
                <h3 class="mb-2 font-black">تقرير الإغلاق — {{ selected?.number }}</h3>
                <dl class="space-y-1 text-sm">
                    <div v-for="(value, key) in report" :key="key" v-show="typeof value !== 'object'" class="flex justify-between">
                        <dt>{{ labels[key] ?? key }}</dt>
                        <dd class="num font-bold">{{ value }}</dd>
                    </div>
                </dl>
            </div>

            <div class="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
                <h3 class="mb-2 font-black">حركات الخزنة</h3>
                <dl class="space-y-1 text-sm">
                    <div v-for="(value, key) in (report.cash_breakdown ?? {})" :key="key" class="flex justify-between">
                        <dt>{{ key }}</dt>
                        <dd class="num font-bold">{{ M.formatMoney(String(value)) }}</dd>
                    </div>
                </dl>

                <h3 class="mt-3 mb-2 font-black">حسب طريقة الدفع</h3>
                <dl class="space-y-1 text-sm">
                    <div v-for="(entry, code) in (report.payments_by_method ?? {})" :key="code" class="flex justify-between">
                        <dt>{{ code }} ({{ (entry as Record<string, unknown>).count }})</dt>
                        <dd class="num font-bold">{{ M.formatMoney(String((entry as Record<string, unknown>).total)) }}</dd>
                    </div>
                </dl>
            </div>
        </section>

        <p v-if="error" class="mt-3 rounded-lg bg-danger-500/10 px-3 py-2 text-sm font-bold text-danger-600">{{ error.message }}</p>
    </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { onMounted, ref } from 'vue';
import { http, toApiError } from '@/lib/api';
import * as M from '@/lib/money';
import type { ApiError } from '@/types';

const from = ref(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
const to = ref(new Date().toISOString().slice(0, 10));
const groupBy = ref<'day' | 'week' | 'month'>('day');
const salesRows = ref<Array<Record<string, any>>>([]);
const paymentMix = ref<Record<string, any>>({});
const topProducts = ref<Array<Record<string, any>>>([]);
const slowProducts = ref<Array<Record<string, any>>>([]);
const valuation = ref<Record<string, any> | null>(null);
const error = ref<ApiError | null>(null);

onMounted(load);

async function load() {
    error.value = null;
    try {
        const params = { from: from.value, to: to.value };
        const [sales, top, slow, stock] = await Promise.all([
            http.get('/reports/sales', { params: { ...params, group_by: groupBy.value } }),
            http.get('/reports/products', { params: { ...params, limit: 10, direction: 'desc' } }),
            http.get('/reports/products', { params: { ...params, limit: 10, direction: 'asc' } }),
            http.get('/reports/inventory'),
        ]);
        salesRows.value = sales.data.rows;
        paymentMix.value = sales.data.payment_mix;
        topProducts.value = top.data.rows;
        slowProducts.value = slow.data.rows;
        valuation.value = stock.data;
    } catch (e) {
        error.value = toApiError(e);
    }
}
</script>

<template>
    <div>
        <div class="mb-4 flex flex-wrap items-end gap-2">
            <h1 class="flex items-center gap-2 text-xl font-black">
                <span class="grid size-8 place-items-center rounded-md bg-brand-soft text-brand-deep">
                    <AppIcon name="chart" :size="17" />
                </span>
                التقارير
            </h1>
            <label class="text-sm font-bold">من <input v-model="from" type="date" class="mr-1 rounded-lg border border-line-strong px-2 py-1.5" /></label>
            <label class="text-sm font-bold">إلى <input v-model="to" type="date" class="mr-1 rounded-lg border border-line-strong px-2 py-1.5" /></label>
            <select v-model="groupBy" class="rounded-lg border border-line-strong px-2 py-1.5 text-sm">
                <option value="day">يومي</option>
                <option value="week">أسبوعي</option>
                <option value="month">شهري</option>
            </select>
            <button class="t-pop rounded-md bg-brand px-4 py-2 text-sm font-bold text-white t-fast hover:bg-brand-strong" @click="load">تحديث</button>
        </div>

        <div class="grid gap-3 lg:grid-cols-2">
            <div class="card p-4">
                <h3 class="mb-2 font-black">المبيعات حسب الفترة</h3>
                <table class="w-full text-sm">
                    <thead class="text-xs text-ink-subtle">
                        <tr><th class="text-right">الفترة</th><th class="text-right">فواتير</th><th class="text-right">الإجمالي</th><th class="text-right">الخصومات</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in salesRows" :key="row.bucket" class="border-t border-line">
                            <td class="py-1">{{ row.bucket }}</td>
                            <td class="num py-1">{{ row.invoices }}</td>
                            <td class="num py-1 font-bold">{{ M.formatMoney(String(row.gross)) }}</td>
                            <td class="num py-1">{{ M.formatMoney(String(row.discounts)) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="card p-4">
                <h3 class="mb-2 font-black">توزيع طرق الدفع</h3>
                <dl class="space-y-1 text-sm">
                    <div v-for="(entry, code) in paymentMix" :key="code" class="flex justify-between">
                        <dt>{{ code }} ({{ entry.count }})</dt>
                        <dd class="num font-bold">{{ M.formatMoney(entry.total) }}</dd>
                    </div>
                </dl>

                <h3 v-if="valuation" class="mt-4 mb-2 font-black">تقييم المخزون</h3>
                <p v-if="valuation" class="num text-lg font-black">{{ M.formatMoney(valuation.total_value) }}</p>
                <p v-if="valuation" class="text-xs text-ink-subtle">{{ valuation.definition }}</p>
            </div>

            <div class="card p-4">
                <h3 class="mb-2 font-black">الأصناف الأعلى حركة</h3>
                <table class="w-full text-sm">
                    <tbody>
                        <tr v-for="row in topProducts" :key="row.variant_id" class="border-t border-line">
                            <td class="py-1">{{ row.product_name }}</td>
                            <td class="num py-1">{{ M.formatQty(String(row.qty)) }}</td>
                            <td class="num py-1 font-bold">{{ M.formatMoney(String(row.revenue)) }}</td>
                            <td v-if="row.profit !== undefined" class="num py-1 text-brand-deep">{{ M.formatMoney(String(row.profit)) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="card p-4">
                <h3 class="mb-2 font-black">الأصناف الأقل حركة</h3>
                <table class="w-full text-sm">
                    <tbody>
                        <tr v-for="row in slowProducts" :key="row.variant_id" class="border-t border-line">
                            <td class="py-1">{{ row.product_name }}</td>
                            <td class="num py-1">{{ M.formatQty(String(row.qty)) }}</td>
                            <td class="num py-1">{{ M.formatMoney(String(row.revenue)) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <p v-if="error" class="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm font-bold text-danger">{{ error.message }}</p>
    </div>
</template>

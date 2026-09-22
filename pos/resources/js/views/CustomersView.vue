<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { computed, ref } from 'vue';
import { http, toApiError, uuid } from '@/lib/api';
import * as M from '@/lib/money';
import DataTable from '@/components/DataTable.vue';
import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/types';

const auth = useAuthStore();
const search = ref('');
const withDebt = ref(false);
const selected = ref<Record<string, any> | null>(null);
const statement = ref<Array<Record<string, any>>>([]);
const openInvoices = ref<Array<Record<string, any>>>([]);
const collectAmount = ref('');
const methods = ref<Array<Record<string, any>>>([]);
const methodId = ref<number | null>(null);
const error = ref<ApiError | null>(null);
const done = ref('');

const params = computed(() => ({ q: search.value || undefined, with_debt: withDebt.value || undefined }));

const columns = [
    { key: 'code', label: 'الكود' },
    { key: 'name', label: 'الاسم' },
    { key: 'phone', label: 'الهاتف' },
    { key: 'balance', label: 'المديونية', numeric: true, format: (r: Record<string, unknown>) => M.formatMoney(String(r.balance)) },
    { key: 'credit_limit', label: 'حد الائتمان', numeric: true, format: (r: Record<string, unknown>) => M.formatMoney(String(r.credit_limit)) },
    { key: 'allow_credit', label: 'آجل', format: (r: Record<string, unknown>) => (r.allow_credit ? 'مسموح' : 'ممنوع') },
];

async function select(row: Record<string, unknown>) {
    error.value = null;
    done.value = '';
    try {
        const [detail, entries, boot] = await Promise.all([
            http.get(`/customers/${row.id}`),
            http.get(`/customers/${row.id}/statement`),
            http.get('/pos/bootstrap'),
        ]);
        selected.value = detail.data.customer;
        openInvoices.value = detail.data.open_invoices ?? [];
        statement.value = entries.data.entries.data ?? [];
        methods.value = boot.data.payment_methods.filter((m: Record<string, unknown>) => m.type !== 'credit');
        methodId.value = methods.value[0]?.id ?? null;
        collectAmount.value = String(row.balance ?? '');
    } catch (e) {
        error.value = toApiError(e);
    }
}

async function collect() {
    if (!selected.value || !methodId.value) return;
    error.value = null;
    try {
        const { data } = await http.post(
            `/customers/${selected.value.id}/collect`,
            { payment_method_id: methodId.value, amount: collectAmount.value },
            { headers: { 'Idempotency-Key': uuid() } },
        );
        done.value = `تم تسجيل التحصيل ${data.number} بقيمة ${M.formatMoney(data.amount)}`;
        await select(selected.value);
    } catch (e) {
        error.value = toApiError(e);
    }
}
</script>

<template>
    <div>
        <div class="mb-3 flex flex-wrap items-center gap-2">
            <h1 class="flex items-center gap-2 text-xl font-black">
                <span class="grid size-8 place-items-center rounded-md bg-brand-soft text-brand-deep">
                    <AppIcon name="users" :size="17" />
                </span>
                العملاء
            </h1>
            <input v-model="search" placeholder="بحث بالاسم أو الهاتف" class="rounded-lg border border-line-strong px-3 py-2 text-sm" />
            <label class="flex items-center gap-1 text-sm"><input v-model="withDebt" type="checkbox" /> أصحاب مديونية فقط</label>
        </div>

        <DataTable url="/customers" :params="params" :columns="columns" @select="select" />

        <section v-if="selected" class="mt-4 grid gap-3 lg:grid-cols-2">
            <div class="card p-4">
                <h2 class="mb-2 font-black">{{ selected.name }}</h2>
                <p class="num text-lg font-black" :class="M.compare(String(selected.balance), '0') > 0 ? 'text-danger' : 'text-cash'">
                    المديونية: {{ M.formatMoney(selected.balance) }}
                </p>

                <h3 class="mt-3 mb-1 text-sm font-black">الفواتير المفتوحة</h3>
                <ul class="space-y-1 text-sm">
                    <li v-for="invoice in openInvoices" :key="invoice.id" class="flex justify-between">
                        <span>{{ invoice.number }} <span class="text-xs text-ink-subtle">استحقاق {{ invoice.due_date ?? '—' }}</span></span>
                        <span class="num font-bold">
                            {{ M.formatMoney(M.subtract(M.subtract(String(invoice.due_total), String(invoice.allocated)), String(invoice.credited))) }}
                        </span>
                    </li>
                    <li v-if="!openInvoices.length" class="text-ink-subtle">لا توجد فواتير مفتوحة</li>
                </ul>

                <div v-if="auth.can('customers.collect')" class="mt-4 rounded-xl bg-surface-2 p-3">
                    <h3 class="mb-2 text-sm font-black">تحصيل</h3>
                    <div class="flex flex-wrap gap-2">
                        <select v-model="methodId" class="rounded-lg border border-line-strong px-3 py-2 text-sm">
                            <option v-for="method in methods" :key="method.id" :value="method.id">{{ method.name }}</option>
                        </select>
                        <input v-model="collectAmount" class="num w-32 rounded-lg border border-line-strong px-3 py-2 text-sm" />
                        <button class="t-pop rounded-md bg-cash px-4 py-2 text-sm font-bold text-white t-fast hover:bg-cash-strong" @click="collect">تسجيل التحصيل</button>
                    </div>
                    <p class="mt-2 text-xs text-ink-subtle">
                        يُسجَّل التحصيل كحركة خزنة مستقلة عن المبيعات، فلا يُحتسب المبلغ مرتين.
                    </p>
                </div>

                <p v-if="done" class="mt-2 rounded-lg bg-cash/10 px-3 py-2 text-sm font-bold text-cash">{{ done }}</p>
                <p v-if="error" class="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm font-bold text-danger">{{ error.message }}</p>
            </div>

            <div class="card p-4">
                <h3 class="mb-2 font-black">كشف الحساب</h3>
                <table class="w-full text-sm">
                    <thead class="text-xs text-ink-subtle">
                        <tr><th class="text-right">التاريخ</th><th class="text-right">البيان</th><th class="text-right">مدين</th><th class="text-right">دائن</th><th class="text-right">الرصيد</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in statement" :key="entry.id" class="border-t border-line">
                            <td class="py-1">{{ entry.entry_date }}</td>
                            <td class="py-1">{{ entry.description }}</td>
                            <td class="num py-1">{{ M.formatMoney(entry.debit) }}</td>
                            <td class="num py-1">{{ M.formatMoney(entry.credit) }}</td>
                            <td class="num py-1 font-bold">{{ M.formatMoney(entry.balance_after) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    </div>
</template>

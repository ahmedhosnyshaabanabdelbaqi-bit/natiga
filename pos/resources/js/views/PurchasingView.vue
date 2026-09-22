<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { http, toApiError, uuid } from '@/lib/api';
import * as M from '@/lib/money';
import DataTable from '@/components/DataTable.vue';
import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/types';

/**
 * Purchasing.
 *
 * The screen keeps ordering and receiving visibly apart, because only the
 * receipt increases stock and cost.
 */
const auth = useAuthStore();
const tab = ref<'orders' | 'receipts' | 'receive'>('orders');
const suppliers = ref<Array<Record<string, any>>>([]);
const warehouses = ref<Array<Record<string, any>>>([]);
const error = ref<ApiError | null>(null);
const done = ref('');

const receipt = ref({
    supplier_id: null as number | null,
    warehouse_id: null as number | null,
    supplier_reference: '',
    lines: [] as Array<{ variant_id: number | null; product_unit_id: number | null; qty: string; unit_cost: string; label: string; batch_code: string; expiry_date: string }>,
});

const search = ref('');
const suggestions = ref<Array<Record<string, any>>>([]);

const orderColumns = [
    { key: 'number', label: 'رقم الأمر' },
    { key: 'supplier.name', label: 'المورد' },
    { key: 'ordered_on', label: 'التاريخ' },
    { key: 'status', label: 'الحالة' },
    { key: 'grand_total', label: 'الإجمالي', numeric: true, format: (r: Record<string, unknown>) => M.formatMoney(String(r.grand_total)) },
];

const receiptColumns = [
    { key: 'number', label: 'رقم الاستلام' },
    { key: 'supplier.name', label: 'المورد' },
    { key: 'warehouse.name', label: 'المخزن' },
    { key: 'business_date', label: 'التاريخ' },
    { key: 'grand_total', label: 'الإجمالي', numeric: true, format: (r: Record<string, unknown>) => M.formatMoney(String(r.grand_total)) },
];

onMounted(async () => {
    try {
        const [s, w] = await Promise.all([http.get('/suppliers'), http.get('/inventory/balances', { params: { per_page: 1 } })]);
        suppliers.value = s.data.data ?? [];
        // Warehouses come from the POS bootstrap, which every role can read.
        const boot = await http.get('/pos/bootstrap');
        warehouses.value = boot.data.terminal ? [{ id: boot.data.terminal.warehouse_id, name: 'مخزن الكاشير' }] : [];
        receipt.value.warehouse_id = boot.data.terminal?.warehouse_id ?? null;
    } catch (e) {
        error.value = toApiError(e);
    }
});

let timer: number | undefined;
function onSearch() {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
        if (!search.value) { suggestions.value = []; return; }
        const { data } = await http.get('/pos/search', { params: { q: search.value, per_page: 10 } });
        suggestions.value = data.data;
    }, 220);
}

function addLine(item: Record<string, any>) {
    receipt.value.lines.push({
        variant_id: item.variant_id,
        product_unit_id: item.product_unit_id,
        qty: '1',
        unit_cost: '0',
        label: `${item.name} (${item.sku})`,
        batch_code: '',
        expiry_date: '',
    });
    search.value = '';
    suggestions.value = [];
}

async function submitReceipt() {
    error.value = null;
    done.value = '';
    try {
        const { data } = await http.post(
            '/goods-receipts',
            {
                supplier_id: receipt.value.supplier_id,
                warehouse_id: receipt.value.warehouse_id,
                supplier_reference: receipt.value.supplier_reference || undefined,
                lines: receipt.value.lines.map((l) => ({
                    variant_id: l.variant_id,
                    product_unit_id: l.product_unit_id,
                    qty: l.qty,
                    unit_cost: l.unit_cost,
                    ...(l.batch_code ? { batch_code: l.batch_code } : {}),
                    ...(l.expiry_date ? { expiry_date: l.expiry_date } : {}),
                })),
            },
            { headers: { 'Idempotency-Key': uuid() } },
        );
        done.value = `تم تسجيل الاستلام ${data.number} — زاد المخزون وتحدثت التكلفة.`;
        receipt.value.lines = [];
    } catch (e) {
        error.value = toApiError(e);
    }
}
</script>

<template>
    <div>
        <div class="mb-3 flex flex-wrap items-center gap-2">
            <h1 class="text-xl font-black">المشتريات</h1>
            <button class="rounded-lg px-3 py-2 text-sm font-bold" :class="tab === 'orders' ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-ink-300'" @click="tab = 'orders'">أوامر الشراء</button>
            <button class="rounded-lg px-3 py-2 text-sm font-bold" :class="tab === 'receipts' ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-ink-300'" @click="tab = 'receipts'">الاستلامات</button>
            <button v-if="auth.can('purchasing.manage')" class="rounded-lg px-3 py-2 text-sm font-bold" :class="tab === 'receive' ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-ink-300'" @click="tab = 'receive'">استلام بضاعة</button>
        </div>

        <p class="mb-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
            أمر الشراء لا يزيد المخزون. الكمية والتكلفة تتغيران عند تسجيل الاستلام فقط.
        </p>

        <DataTable v-if="tab === 'orders'" url="/purchase-orders" :columns="orderColumns" />
        <DataTable v-else-if="tab === 'receipts'" url="/goods-receipts" :columns="receiptColumns" />

        <div v-else class="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
            <div class="grid gap-3 sm:grid-cols-3">
                <label class="text-sm font-bold">المورد
                    <select v-model="receipt.supplier_id" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2">
                        <option :value="null">اختر</option>
                        <option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">{{ supplier.name }}</option>
                    </select>
                </label>
                <label class="text-sm font-bold">المخزن
                    <select v-model="receipt.warehouse_id" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2">
                        <option v-for="warehouse in warehouses" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}</option>
                    </select>
                </label>
                <label class="text-sm font-bold">مرجع فاتورة المورد
                    <input v-model="receipt.supplier_reference" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" />
                </label>
            </div>

            <div class="relative mt-3">
                <input v-model="search" placeholder="ابحث عن صنف لإضافته" class="w-full rounded-lg border border-ink-300 px-3 py-2" @input="onSearch" />
                <ul v-if="suggestions.length" class="absolute z-10 mt-1 w-full overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-ink-200">
                    <li v-for="item in suggestions" :key="item.variant_id" class="cursor-pointer px-3 py-2 text-sm hover:bg-ink-50" @click="addLine(item)">
                        {{ item.name }} — {{ item.sku }}
                    </li>
                </ul>
            </div>

            <table v-if="receipt.lines.length" class="mt-3 w-full text-sm">
                <thead class="text-xs text-ink-500">
                    <tr><th class="text-right">الصنف</th><th class="text-right">الكمية</th><th class="text-right">تكلفة الوحدة</th><th class="text-right">رقم الدفعة</th><th class="text-right">الصلاحية</th><th></th></tr>
                </thead>
                <tbody>
                    <tr v-for="(line, i) in receipt.lines" :key="i" class="border-t border-ink-100">
                        <td class="py-1">{{ line.label }}</td>
                        <td class="py-1"><input v-model="line.qty" class="num w-20 rounded border border-ink-300 px-2 py-1" /></td>
                        <td class="py-1"><input v-model="line.unit_cost" class="num w-24 rounded border border-ink-300 px-2 py-1" /></td>
                        <td class="py-1"><input v-model="line.batch_code" class="w-24 rounded border border-ink-300 px-2 py-1" /></td>
                        <td class="py-1"><input v-model="line.expiry_date" type="date" class="rounded border border-ink-300 px-2 py-1" /></td>
                        <td class="py-1"><button class="text-danger-600" @click="receipt.lines.splice(i, 1)">✕</button></td>
                    </tr>
                </tbody>
            </table>

            <button
                class="mt-3 rounded-lg bg-cash-600 px-6 py-2.5 font-bold text-white disabled:opacity-40"
                :disabled="!receipt.supplier_id || !receipt.lines.length"
                @click="submitReceipt"
            >
                تسجيل الاستلام
            </button>

            <p v-if="done" class="mt-2 rounded-lg bg-cash-600/10 px-3 py-2 text-sm font-bold text-cash-600">{{ done }}</p>
        </div>

        <p v-if="error" class="mt-3 rounded-lg bg-danger-500/10 px-3 py-2 text-sm font-bold text-danger-600">{{ error.message }}</p>
    </div>
</template>

<script setup lang="ts">
import * as L from '@/lib/labels';
import AppIcon from '@/components/AppIcon.vue';
import { computed, ref } from 'vue';
import { http, toApiError } from '@/lib/api';
import * as M from '@/lib/money';
import DataTable from '@/components/DataTable.vue';
import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/types';

const auth = useAuthStore();
const tab = ref<'balances' | 'movements'>('balances');
const search = ref('');
const lowStock = ref(false);
const deadStock = ref(false);
const reconcile = ref<{ in_sync: boolean; discrepancies: unknown[] } | null>(null);
const error = ref<ApiError | null>(null);

const params = computed(() => ({
    q: search.value || undefined,
    low_stock: lowStock.value || undefined,
    dead_stock: deadStock.value || undefined,
}));

const balanceColumns = [
    { key: 'sku', label: 'الكود' },
    { key: 'product_name', label: 'الصنف' },
    { key: 'warehouse_name', label: 'المخزن' },
    { key: 'qty_on_hand', label: 'الرصيد', numeric: true, format: (r: Record<string, unknown>) => M.formatQty(String(r.qty_on_hand)) },
    { key: 'qty_reserved', label: 'محجوز', numeric: true, format: (r: Record<string, unknown>) => M.formatQty(String(r.qty_reserved)) },
    { key: 'min_stock', label: 'الحد الأدنى', numeric: true, format: (r: Record<string, unknown>) => M.formatQty(String(r.min_stock)) },
    { key: 'avg_cost', label: 'متوسط التكلفة', numeric: true, format: (r: Record<string, unknown>) => M.formatMoney(String(r.avg_cost)) },
];

const movementColumns = [
    { key: 'occurred_at', label: 'التاريخ', format: (r: Record<string, unknown>) => new Date(String(r.occurred_at)).toLocaleString('ar-EG') },
    { key: 'variant.sku', label: 'الكود' },
    { key: 'warehouse.name', label: 'المخزن' },
    { key: 'reason', label: 'السبب', format: (r: Record<string, unknown>) => L.movementReason(r.reason) },
    { key: 'qty_base', label: 'الكمية', numeric: true, format: (r: Record<string, unknown>) => M.formatQty(String(r.qty_base)) },
    { key: 'balance_after', label: 'الرصيد بعدها', numeric: true, format: (r: Record<string, unknown>) => M.formatQty(String(r.balance_after)) },
    { key: 'unit_cost', label: 'التكلفة', numeric: true, format: (r: Record<string, unknown>) => M.formatMoney(String(r.unit_cost)) },
    { key: 'user.name', label: 'المستخدم' },
];

async function runReconcile() {
    try {
        const { data } = await http.get('/inventory/reconcile');
        reconcile.value = data;
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
                    <AppIcon name="box" :size="17" />
                </span>
                المخزون
            </h1>
            <button class="t-pop rounded-md px-3.5 py-2 text-sm font-bold t-fast" :class="tab === 'balances' ? 'bg-brand text-white' : 'bg-surface-2 text-ink-muted hover:bg-surface-3'" @click="tab = 'balances'">الأرصدة</button>
            <button class="t-pop rounded-md px-3.5 py-2 text-sm font-bold t-fast" :class="tab === 'movements' ? 'bg-brand text-white' : 'bg-surface-2 text-ink-muted hover:bg-surface-3'" @click="tab = 'movements'">سجل الحركات</button>
            <button v-if="auth.can('inventory.view')" class="t-pop mr-auto rounded-md bg-ink px-3 py-2 text-sm font-bold text-surface-1 t-fast hover:opacity-90" @click="runReconcile">
                مطابقة الأرصدة بالحركات
            </button>
        </div>

        <div v-if="reconcile" class="mb-3 rounded-xl p-3 text-sm font-bold" :class="reconcile.in_sync ? 'bg-cash/10 text-cash' : 'bg-danger/10 text-danger'">
            {{ reconcile.in_sync
                ? 'الأرصدة المشتقة مطابقة تمامًا لسجل الحركات.'
                : `يوجد ${reconcile.discrepancies.length} صنف غير مطابق — يلزم إعادة بناء الرصيد.` }}
        </div>

        <div v-if="tab === 'balances'" class="mb-3 flex flex-wrap gap-2">
            <input v-model="search" placeholder="بحث" class="rounded-lg border border-line-strong px-3 py-2 text-sm" />
            <label class="flex items-center gap-1 text-sm"><input v-model="lowStock" type="checkbox" /> تحت الحد الأدنى</label>
            <label class="flex items-center gap-1 text-sm"><input v-model="deadStock" type="checkbox" /> راكد (90 يومًا)</label>
        </div>

        <DataTable v-if="tab === 'balances'" url="/inventory/balances" :params="params" :columns="balanceColumns" />
        <DataTable v-else url="/inventory/movements" :columns="movementColumns" />

        <p v-if="error" class="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm font-bold text-danger">{{ error.message }}</p>
    </div>
</template>

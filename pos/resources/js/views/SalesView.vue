<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import DataTable from '@/components/DataTable.vue';
import * as M from '@/lib/money';

const router = useRouter();
const number = ref('');
const from = ref('');
const to = ref('');
const paymentMethod = ref('');

const params = computed(() => ({
    number: number.value || undefined,
    from: from.value || undefined,
    to: to.value || undefined,
    payment_method: paymentMethod.value || undefined,
}));

const columns = [
    { key: 'number', label: 'رقم الفاتورة' },
    { key: 'business_date', label: 'التاريخ' },
    { key: 'customer.name', label: 'العميل' },
    { key: 'cashier.name', label: 'الكاشير' },
    { key: 'grand_total', label: 'الإجمالي', numeric: true, format: (r: Record<string, unknown>) => M.formatMoney(String(r.grand_total)) },
    { key: 'due_total', label: 'المتبقي آجل', numeric: true, format: (r: Record<string, unknown>) => M.formatMoney(String(r.due_total)) },
    { key: 'origin', label: 'المصدر', format: (r: Record<string, unknown>) => (r.origin === 'offline' ? 'أوفلاين' : 'مباشر') },
];
</script>

<template>
    <div>
        <h1 class="flex items-center gap-2 text-xl font-black">
                <span class="grid size-8 place-items-center rounded-md bg-brand-soft text-brand-deep">
                    <AppIcon name="receipt" :size="17" />
                </span>
                سجل الفواتير
            </h1>
        <div class="mb-3 flex flex-wrap gap-2">
            <input v-model="number" placeholder="رقم الفاتورة" class="rounded-lg border border-line-strong px-3 py-2 text-sm" />
            <input v-model="from" type="date" class="rounded-lg border border-line-strong px-3 py-2 text-sm" />
            <input v-model="to" type="date" class="rounded-lg border border-line-strong px-3 py-2 text-sm" />
            <select v-model="paymentMethod" class="rounded-lg border border-line-strong px-3 py-2 text-sm">
                <option value="">كل طرق الدفع</option>
                <option value="cash">نقدي</option>
                <option value="card">بطاقة</option>
                <option value="wallet">محفظة</option>
                <option value="transfer">تحويل</option>
            </select>
        </div>

        <DataTable
            url="/sales"
            :params="params"
            :columns="columns"
            empty-text="لا توجد فواتير مطابقة"
            @select="(row) => router.push(`/app/sales/${row.id}`)"
        />
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { http, toApiError } from '@/lib/api';
import * as M from '@/lib/money';
import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/types';

const props = defineProps<{ id: string }>();
const auth = useAuthStore();

const sale = ref<Record<string, any> | null>(null);
const error = ref<ApiError | null>(null);
const reprinting = ref(false);
const reprintNote = ref('');

onMounted(async () => {
    try {
        const { data } = await http.get(`/sales/${props.id}`);
        sale.value = data;
    } catch (e) {
        error.value = toApiError(e);
    }
});

async function reprint() {
    reprinting.value = true;
    try {
        const { data } = await http.post(`/sales/${props.id}/reprint`);
        reprintNote.value = `تمت إضافة مهمة طباعة (نسخة رقم ${data.copy_number}). فشل الطابعة لا يؤثر على الفاتورة.`;
    } catch (e) {
        error.value = toApiError(e);
    } finally {
        reprinting.value = false;
    }
}
</script>

<template>
    <div v-if="sale">
        <div class="mb-3 flex items-center gap-3">
            <h1 class="text-xl font-black">فاتورة {{ sale.number }}</h1>
            <span v-if="sale.provisional" class="rounded bg-warn-500 px-2 py-1 text-xs font-bold text-white">
                مستند غير متزامن
            </span>
            <button
                v-if="auth.can('pos.reprint')"
                class="mr-auto rounded-lg bg-ink-800 px-4 py-2 text-sm font-bold text-white"
                :disabled="reprinting"
                @click="reprint"
            >
                إعادة طباعة
            </button>
        </div>

        <p v-if="reprintNote" class="mb-3 rounded-lg bg-cash-600/10 px-3 py-2 text-sm font-bold text-cash-600">{{ reprintNote }}</p>

        <div class="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200">
            <table class="w-full text-sm">
                <thead class="bg-ink-50 text-xs">
                    <tr>
                        <th class="px-3 py-2 text-right">الصنف</th>
                        <th class="px-3 py-2 text-right">الوحدة</th>
                        <th class="px-3 py-2 text-right">الكمية</th>
                        <th class="px-3 py-2 text-right">السعر</th>
                        <th class="px-3 py-2 text-right">الخصم</th>
                        <th class="px-3 py-2 text-right">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="line in sale.lines" :key="line.id" class="border-t border-ink-100">
                        <td class="px-3 py-2">{{ line.product_name }} {{ line.variant_name }}</td>
                        <td class="px-3 py-2">{{ line.unit_name }}</td>
                        <td class="num px-3 py-2">{{ M.formatQty(line.qty) }}</td>
                        <td class="num px-3 py-2">{{ M.formatMoney(line.unit_price) }}</td>
                        <td class="num px-3 py-2">
                            {{ M.formatMoney(M.add(line.line_discount_amount, line.invoice_discount_share)) }}
                        </td>
                        <td class="num px-3 py-2 font-bold">{{ M.formatMoney(line.total_amount) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <dl class="rounded-2xl bg-white p-4 text-sm ring-1 ring-ink-200">
                <div class="flex justify-between py-1"><dt>الإجمالي قبل الخصم</dt><dd class="num">{{ M.formatMoney(sale.subtotal) }}</dd></div>
                <div class="flex justify-between py-1"><dt>الخصم</dt><dd class="num">{{ M.formatMoney(sale.discount_total) }}</dd></div>
                <div class="flex justify-between py-1"><dt>الضريبة</dt><dd class="num">{{ M.formatMoney(sale.tax_total) }}</dd></div>
                <div class="flex justify-between border-t border-ink-200 py-1 font-black"><dt>الإجمالي</dt><dd class="num">{{ M.formatMoney(sale.grand_total) }}</dd></div>
                <div class="flex justify-between py-1"><dt>المدفوع</dt><dd class="num">{{ M.formatMoney(sale.paid_total) }}</dd></div>
                <div class="flex justify-between py-1"><dt>الباقي للعميل</dt><dd class="num">{{ M.formatMoney(sale.change_total) }}</dd></div>
                <div v-if="sale.is_credit" class="flex justify-between py-1 text-warn-500"><dt>آجل</dt><dd class="num">{{ M.formatMoney(sale.due_total) }}</dd></div>
                <template v-if="sale.cost_total !== undefined">
                    <div class="flex justify-between border-t border-ink-200 py-1"><dt>التكلفة</dt><dd class="num">{{ M.formatMoney(sale.cost_total) }}</dd></div>
                    <div class="flex justify-between py-1 font-black text-brand-700"><dt>مجمل الربح</dt><dd class="num">{{ M.formatMoney(sale.profit_total) }}</dd></div>
                </template>
            </dl>

            <div class="rounded-2xl bg-white p-4 text-sm ring-1 ring-ink-200">
                <h3 class="mb-2 font-black">المدفوعات</h3>
                <ul class="space-y-1">
                    <li v-for="(payment, i) in sale.payments" :key="i" class="flex justify-between">
                        <span>
                            {{ payment.method_code }}
                            <span v-if="payment.capture_mode === 'manual' && payment.method_type !== 'cash'" class="text-xs text-ink-500">
                                (تسجيل يدوي)
                            </span>
                        </span>
                        <span class="num font-bold">{{ M.formatMoney(payment.amount) }}</span>
                    </li>
                </ul>
            </div>
        </div>
    </div>

    <p v-else-if="error" class="rounded-lg bg-danger-500/10 px-3 py-2 text-sm font-bold text-danger-600">{{ error.message }}</p>
</template>

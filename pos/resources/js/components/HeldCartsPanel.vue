<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { http, toApiError } from '@/lib/api';
import { useCartStore } from '@/stores/cart';
import type { ApiError, CartLine, HeldCartDto } from '@/types';

/**
 * Parked invoices.
 *
 * Recalling one takes a server-side claim (optimistic version), so two tills
 * cannot check out the same hold. Any price / stock / expiry drift since it was
 * parked is shown BEFORE the cashier continues.
 */
const emit = defineEmits<{ close: [] }>();
const cart = useCartStore();

const carts = ref<HeldCartDto[]>([]);
const loading = ref(true);
const error = ref<ApiError | null>(null);
const differences = ref<Array<Record<string, unknown>>>([]);

onMounted(load);

async function load() {
    loading.value = true;
    try {
        const { data } = await http.get<HeldCartDto[]>('/held-carts');
        carts.value = data;
    } catch (e) {
        error.value = toApiError(e);
    } finally {
        loading.value = false;
    }
}

async function recall(held: HeldCartDto) {
    error.value = null;
    differences.value = [];

    try {
        const { data } = await http.post(`/held-carts/${held.id}/recall`, { version: held.version });

        cart.reset();
        const payload = data.cart.payload as { lines?: CartLine[] };
        cart.lines = (payload.lines ?? []) as CartLine[];
        cart.heldCartId = held.id;
        cart.setCustomer(data.cart.customer_id ?? null, held.label);
        void cart.persist();

        differences.value = data.differences ?? [];
        if (differences.value.length === 0) emit('close');
    } catch (e) {
        error.value = toApiError(e);
        await load();
    }
}

async function cancel(held: HeldCartDto) {
    try {
        await http.delete(`/held-carts/${held.id}`);
        await load();
    } catch (e) {
        error.value = toApiError(e);
    }
}

const differenceLabel = (type: string) =>
    ({
        price_changed: 'تغير السعر',
        insufficient_stock: 'الرصيد غير كافٍ',
        batch_expired: 'انتهت صلاحية الدفعة',
        variant_unavailable: 'الصنف غير متاح',
        price_missing: 'لا يوجد سعر',
    })[type] ?? type;
</script>

<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4">
        <div class="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white">
            <header class="flex items-center justify-between border-b border-ink-200 px-4 py-3">
                <h2 class="text-lg font-black">الفواتير المعلقة</h2>
                <button class="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-bold" @click="emit('close')">إغلاق</button>
            </header>

            <div v-if="differences.length" class="border-b border-warn-500/40 bg-warn-500/10 p-4">
                <p class="mb-2 font-black text-warn-500">تغيرت بيانات منذ تعليق الفاتورة — راجعها قبل الاعتماد:</p>
                <ul class="space-y-1 text-sm">
                    <li v-for="(diff, i) in differences" :key="i">
                        • بند {{ Number(diff.line) + 1 }}: {{ differenceLabel(String(diff.type)) }}
                        <span v-if="diff.old"> (كان {{ diff.old }} — أصبح {{ diff.new }})</span>
                        <span v-if="diff.available"> (متاح {{ diff.available }} / مطلوب {{ diff.needed }})</span>
                    </li>
                </ul>
                <button class="mt-3 rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-white" @click="emit('close')">
                    فهمت، تابع البيع
                </button>
            </div>

            <div class="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
                <p v-if="loading" class="p-8 text-center text-ink-400">جارٍ التحميل…</p>
                <p v-else-if="!carts.length" class="p-8 text-center text-ink-400">لا توجد فواتير معلقة</p>

                <ul v-else class="divide-y divide-ink-100">
                    <li v-for="held in carts" :key="held.id" class="flex items-center gap-3 px-4 py-3">
                        <div class="min-w-0 flex-1">
                            <p class="truncate font-bold">{{ held.label }}</p>
                            <p class="text-xs text-ink-500">
                                {{ held.user?.name }} ·
                                {{ new Date(held.updated_at).toLocaleString('ar-EG') }} ·
                                {{ (held.payload as { lines?: unknown[] }).lines?.length ?? 0 }} بند
                                <span v-if="held.status === 'recalled'" class="text-warn-500">· مستخدمة على جهاز آخر</span>
                            </p>
                        </div>
                        <button
                            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                            :disabled="held.status === 'recalled'"
                            @click="recall(held)"
                        >
                            استرجاع
                        </button>
                        <button class="rounded-lg bg-ink-100 px-3 py-2 text-sm font-bold text-danger-600" @click="cancel(held)">إلغاء</button>
                    </li>
                </ul>
            </div>

            <p v-if="error" class="border-t border-danger-500/30 bg-danger-500/10 px-4 py-2 text-sm font-bold text-danger-600">
                {{ error.message }}
            </p>
        </div>
    </div>
</template>

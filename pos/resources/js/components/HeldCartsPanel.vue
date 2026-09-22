<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import PanelShell from '@/components/PanelShell.vue';
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
    <PanelShell title="الفواتير المعلقة" icon="layers" @close="emit('close')">
        <!-- الفروق منذ التعليق تُعرض قبل متابعة البيع، لا بعده -->
        <div v-if="differences.length" class="shrink-0 border-b border-warn/30 bg-warn-soft p-4">
            <p class="mb-2 flex items-center gap-2 text-sm font-black text-warn-strong">
                <AppIcon name="alert" :size="17" />
                تغيرت بيانات منذ تعليق الفاتورة — راجعها قبل الاعتماد
            </p>
            <ul class="space-y-1 text-[13px] text-ink">
                <li v-for="(diff, i) in differences" :key="i" class="flex gap-1.5">
                    <span class="text-warn">•</span>
                    <span>
                        بند {{ Number(diff.line) + 1 }}: {{ differenceLabel(String(diff.type)) }}
                        <span v-if="diff.old" class="num">(كان {{ diff.old }} — أصبح {{ diff.new }})</span>
                        <span v-if="diff.available" class="num">
                            (متاح {{ diff.available }} / مطلوب {{ diff.needed }})
                        </span>
                    </span>
                </li>
            </ul>
            <button class="mt-3 rounded-md bg-ink px-4 py-2 text-sm font-bold text-surface-1" @click="emit('close')">
                فهمت، تابع البيع
            </button>
        </div>

        <div class="scroll-slim min-h-0 flex-1 overflow-y-auto">
            <p v-if="loading" class="p-10 text-center text-sm text-ink-subtle">جارٍ التحميل…</p>

            <div v-else-if="!carts.length" class="flex flex-col items-center gap-3 p-12 text-center">
                <span class="grid size-14 place-items-center rounded-full bg-surface-2 text-ink-subtle">
                    <AppIcon name="layers" :size="26" />
                </span>
                <p class="text-sm text-ink-subtle">لا توجد فواتير معلقة</p>
            </div>

            <ul v-else class="divide-y divide-line">
                <li v-for="held in carts" :key="held.id" class="flex items-center gap-3 px-4 py-3">
                    <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-bold">{{ held.label }}</p>
                        <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-subtle">
                            <span>{{ held.user?.name }}</span>
                            <span class="text-line-strong">·</span>
                            <span class="num">{{ new Date(held.updated_at).toLocaleString('ar-EG') }}</span>
                            <span class="text-line-strong">·</span>
                            <span class="num">{{ (held.payload as { lines?: unknown[] }).lines?.length ?? 0 }} بند</span>
                            <span
                                v-if="held.status === 'recalled'"
                                class="rounded bg-warn-soft px-1.5 py-px font-bold text-warn"
                            >
                                مستخدمة على جهاز آخر
                            </span>
                        </p>
                    </div>
                    <button
                        class="t-pop flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-bold text-white t-fast hover:bg-brand-strong disabled:opacity-40"
                        :disabled="held.status === 'recalled'"
                        @click="recall(held)"
                    >
                        <AppIcon name="undo" :size="15" />
                        استرجاع
                    </button>
                    <button
                        class="grid size-9 place-items-center rounded-md bg-surface-2 text-danger t-fast hover:bg-danger-soft"
                        aria-label="إلغاء الفاتورة المعلقة"
                        @click="cancel(held)"
                    >
                        <AppIcon name="trash" :size="16" />
                    </button>
                </li>
            </ul>
        </div>

        <p
            v-if="error"
            class="flex shrink-0 items-center gap-2 border-t border-danger/25 bg-danger-soft px-4 py-2.5 text-sm font-bold text-danger"
            role="alert"
        >
            <AppIcon name="alert" :size="16" />
            {{ error.message }}
        </p>
    </PanelShell>
</template>

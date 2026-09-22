<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { http, toApiError, isNetworkError, uuid } from '@/lib/api';
import * as M from '@/lib/money';
import { useCartStore } from '@/stores/cart';
import { useConnectionStore } from '@/stores/connection';
import { useAuthStore } from '@/stores/auth';
import NumericKeypad from '@/components/NumericKeypad.vue';
import type { ApiError, PaymentMethod, SaleDto } from '@/types';

/**
 * Payment.
 *
 * Shows the four numbers that matter: total, paid, remaining, change.
 * Supports mixed payment in one invoice, and distinguishes what the customer
 * HANDED OVER from what is applied to the invoice, so the drawer figure is right.
 *
 * When the server is unreachable, an eligible cash sale is queued locally under
 * the device policy; anything else is refused rather than pretended.
 *
 * If the response is lost after submitting, the panel asks the server for the
 * outcome BY KEY instead of sending the sale again.
 */

const props = defineProps<{ methods: PaymentMethod[]; scale: number }>();
const emit = defineEmits<{ close: []; completed: [{ number: string; change: string; provisional: boolean }] }>();

const cart = useCartStore();
const connection = useConnectionStore();
const auth = useAuthStore();

const selectedMethod = ref<PaymentMethod | null>(null);
const entry = ref('0');
const reference = ref('');
const submitting = ref(false);
const error = ref<ApiError | null>(null);
const recovering = ref(false);
const amountInput = ref<HTMLInputElement | null>(null);

const cashMethod = computed(() => props.methods.find((m) => m.type === 'cash') ?? null);
const money = (v: string) => M.formatMoney(v, props.scale);

onMounted(() => {
    selectedMethod.value = cashMethod.value;
    // Pre-fill with the exact amount due: the common case is one Enter away.
    entry.value = cart.remaining;
    nextTick(() => amountInput.value?.select());
});

const remaining = computed(() => cart.remaining);
const change = computed(() => cart.changeTotal);

/** Quick cash buttons: the exact amount plus sensible round notes above it. */
const quickAmounts = computed(() => {
    const due = Number(M.round(remaining.value, 0));
    const notes = [5, 10, 20, 50, 100, 200];
    const suggestions = new Set<string>([M.round(remaining.value, props.scale)]);
    for (const note of notes) {
        const rounded = Math.ceil(due / note) * note;
        if (rounded >= due && rounded > 0) suggestions.add(String(rounded));
    }
    return [...suggestions].slice(0, 6);
});

function selectMethod(method: PaymentMethod) {
    selectedMethod.value = method;
    reference.value = '';
    entry.value = remaining.value;
    nextTick(() => amountInput.value?.select());
}

function applyPayment() {
    const method = selectedMethod.value;
    if (!method) return;

    const tendered = M.round(entry.value || '0', props.scale);
    if (M.isZero(tendered) || M.isNegative(tendered)) return;

    if (method.requires_reference && !reference.value.trim()) {
        error.value = { message: 'طريقة الدفع تتطلب رقم مرجع.' };
        return;
    }

    // Applied to the invoice = min(tendered, what is still due).
    // Change only exists for methods that allow it (cash).
    const applied = M.compare(tendered, remaining.value) > 0 && method.allows_change ? remaining.value : tendered;

    if (M.compare(applied, remaining.value) > 0) {
        error.value = { message: 'المبلغ يتجاوز المتبقي على الفاتورة.' };
        return;
    }

    cart.addPayment(method, applied, method.allows_change ? tendered : applied, reference.value.trim() || null);
    error.value = null;
    entry.value = cart.remaining;
    reference.value = '';
    nextTick(() => amountInput.value?.select());
}

function payExact() {
    entry.value = remaining.value;
    applyPayment();
}

// ---- completing the sale --------------------------------------------------

async function complete() {
    if (!cart.canComplete || submitting.value) return;

    submitting.value = true;
    error.value = null;

    const payload = cart.salePayload();
    const key = cart.idempotencyKey;

    try {
        const { data } = await http.post<SaleDto>('/sales', payload, {
            headers: { 'Idempotency-Key': key },
        });

        emit('completed', {
            number: data.number,
            change: data.change_total,
            provisional: data.provisional ?? false,
        });
    } catch (e) {
        if (isNetworkError(e)) {
            // The request may or may not have arrived. Ask by key BEFORE
            // considering an offline queue, so a successful sale is never
            // duplicated.
            const recovered = await recoverByKey(key);
            if (recovered) return;

            await queueOffline(payload, key);
            return;
        }

        const api = toApiError(e);
        error.value = api;

        // A manager approval is a normal outcome, not a failure.
        if (api.error_code === 'approval_required') {
            error.value = { ...api, message: 'تتطلب قيمة الخصم موافقة المدير.' };
        }
    } finally {
        submitting.value = false;
    }
}

/** "The response was lost" recovery. */
async function recoverByKey(key: string): Promise<boolean> {
    recovering.value = true;
    try {
        const { data } = await http.get(`/sales/by-key/${encodeURIComponent(key)}`, { timeout: 8000 });
        if (data?.status === 'completed' && data.response) {
            emit('completed', {
                number: data.response.number,
                change: data.response.change_total ?? '0',
                provisional: data.response.provisional ?? false,
            });
            return true;
        }
        return false;
    } catch {
        return false; // still unreachable
    } finally {
        recovering.value = false;
    }
}

/** Degraded mode, under the device policy the server will re-check anyway. */
async function queueOffline(payload: Record<string, unknown>, key: string) {
    const terminal = auth.user?.terminal;
    const blockers: string[] = [];

    if (!terminal?.offline_allowed) blockers.push('هذا الجهاز غير معتمد للبيع دون خادم.');
    if (cart.isCredit) blockers.push('البيع الآجل ممنوع دون اتصال.');
    if (cart.lines.some((l) => l.tracking === 'serial')) blockers.push('بيع الأصناف المتتبعة بالسيريال ممنوع دون اتصال.');
    if (cart.lines.some((l) => l.price_overridden)) blockers.push('تعديل السعر ممنوع دون اتصال.');
    if (cart.payments.some((p) => !props.methods.find((m) => m.id === p.payment_method_id)?.allowed_offline)) {
        blockers.push('إحدى طرق الدفع غير مسموح بها دون اتصال.');
    }
    const ceiling = terminal?.offline_max_sale_amount ?? '0';
    if (!M.isZero(ceiling) && M.compare(cart.totals.grand_total, ceiling) > 0) {
        blockers.push(`قيمة الفاتورة تتجاوز الحد المسموح دون اتصال (${money(ceiling)}).`);
    }

    if (blockers.length > 0) {
        error.value = {
            message: 'تعذر الوصول إلى الخادم، ولا يمكن إتمام هذه الفاتورة دون اتصال:\n• ' + blockers.join('\n• '),
            error_code: 'offline_blocked',
        };
        return;
    }

    try {
        await connection.queue({
            uuid: uuid(),
            type: 'sale',
            payload: { ...payload, idempotency_key: key },
            client_created_at: new Date().toISOString(),
            status: 'pending',
            attempts: 0,
            collected_amount: cart.totals.grand_total,
        });

        emit('completed', {
            number: 'محلية-' + key.slice(0, 8),
            change: change.value,
            provisional: true,
        });
    } catch (storageError) {
        error.value = {
            message: (storageError as Error).message,
            error_code: 'offline_storage_failed',
        };
    }
}
</script>

<template>
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/60 p-0 sm:items-center sm:p-6" @keydown.esc="emit('close')">
        <div class="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <header class="flex shrink-0 items-center justify-between border-b border-ink-200 px-4 py-3">
                <h2 class="text-lg font-black">الدفع</h2>
                <button class="rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-bold" @click="emit('close')">إغلاق (Esc)</button>
            </header>

            <div class="scrollbar-slim grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
                <!-- figures -->
                <section>
                    <dl class="space-y-2 rounded-xl bg-ink-50 p-4">
                        <div class="flex items-baseline justify-between">
                            <dt class="font-bold">إجمالي الفاتورة</dt>
                            <dd class="num text-2xl font-black">{{ money(cart.totals.grand_total) }}</dd>
                        </div>
                        <div class="flex items-baseline justify-between text-cash-600">
                            <dt class="font-bold">المدفوع</dt>
                            <dd class="num text-xl font-black">{{ money(cart.paidTotal) }}</dd>
                        </div>
                        <div class="flex items-baseline justify-between" :class="M.isZero(remaining) ? 'text-ink-400' : 'text-danger-600'">
                            <dt class="font-bold">المتبقي</dt>
                            <dd class="num text-xl font-black">{{ money(remaining) }}</dd>
                        </div>
                        <div v-if="!M.isZero(change)" class="flex items-baseline justify-between rounded-lg bg-warn-500/15 p-2 text-warn-500">
                            <dt class="font-black">الباقي للعميل</dt>
                            <dd class="num text-2xl font-black">{{ money(change) }}</dd>
                        </div>
                    </dl>

                    <ul v-if="cart.payments.length" class="mt-3 divide-y divide-ink-100 rounded-xl ring-1 ring-ink-200">
                        <li v-for="(payment, index) in cart.payments" :key="index" class="flex items-center gap-2 px-3 py-2 text-sm">
                            <span class="font-bold">{{ methods.find((m) => m.id === payment.payment_method_id)?.name }}</span>
                            <span v-if="payment.reference" class="text-xs text-ink-500">{{ payment.reference }}</span>
                            <span class="num mr-auto font-black">{{ money(payment.amount) }}</span>
                            <span v-if="M.compare(payment.tendered_amount, payment.amount) > 0" class="num text-xs text-ink-500">
                                (مُسلَّم {{ money(payment.tendered_amount) }})
                            </span>
                            <button class="text-danger-600" @click="cart.removePayment(index)">✕</button>
                        </li>
                    </ul>

                    <label class="mt-3 flex items-center gap-2 text-sm">
                        <input v-model="cart.isCredit" type="checkbox" :disabled="!cart.customerId" class="h-4 w-4" />
                        <span :class="cart.customerId ? '' : 'text-ink-400'">
                            بيع آجل (يتطلب اختيار عميل)
                        </span>
                    </label>
                </section>

                <!-- entry -->
                <section>
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="method in methods"
                            :key="method.id"
                            class="rounded-xl px-4 py-2.5 text-sm font-bold ring-1 fade-fast"
                            :class="selectedMethod?.id === method.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-700 ring-ink-300'"
                            @click="selectMethod(method)"
                        >
                            {{ method.name }}
                        </button>
                    </div>

                    <input
                        ref="amountInput"
                        v-model="entry"
                        data-keep-focus="true"
                        inputmode="decimal"
                        class="num mt-3 w-full rounded-xl border-2 border-ink-300 px-4 py-3 text-2xl font-black outline-none focus:border-brand-600"
                        @keydown.enter.prevent="applyPayment"
                    />

                    <input
                        v-if="selectedMethod?.requires_reference"
                        v-model="reference"
                        data-keep-focus="true"
                        placeholder="رقم المرجع / الإيصال من جهاز الشبكة"
                        class="mt-2 w-full rounded-xl border border-ink-300 px-3 py-2 text-sm outline-none focus:border-brand-600"
                    />
                    <p v-if="selectedMethod && selectedMethod.type !== 'cash'" class="mt-1 text-xs text-ink-500">
                        تسجيل يدوي لعملية تمت على جهاز خارجي — ليس تكاملًا بنكيًا تلقائيًا.
                    </p>

                    <div class="mt-2 flex flex-wrap gap-2">
                        <button
                            v-for="amount in quickAmounts"
                            :key="amount"
                            class="num rounded-lg bg-ink-100 px-3 py-2 text-sm font-bold"
                            @click="entry = amount"
                        >
                            {{ money(amount) }}
                        </button>
                    </div>

                    <div class="mt-3">
                        <NumericKeypad v-model="entry" allow-decimal @enter="applyPayment" />
                    </div>

                    <button class="mt-2 w-full rounded-xl bg-ink-800 py-3 text-sm font-bold text-white" @click="payExact">
                        دفع المبلغ المتبقي بالضبط
                    </button>
                </section>
            </div>

            <div v-if="error" class="shrink-0 whitespace-pre-line border-t border-danger-500/30 bg-danger-500/10 px-4 py-2 text-sm font-bold text-danger-600">
                {{ error.message }}
            </div>
            <div v-if="recovering" class="shrink-0 bg-warn-500/15 px-4 py-2 text-sm font-bold text-warn-500">
                انقطع الرد — جارٍ الاستعلام عن نتيجة العملية بنفس المفتاح بدل إعادة البيع…
            </div>

            <footer class="shrink-0 border-t border-ink-200 p-3">
                <button
                    class="w-full rounded-xl bg-cash-600 py-4 text-xl font-black text-white shadow active:bg-cash-500 disabled:opacity-40"
                    :disabled="!cart.canComplete || submitting"
                    @click="complete"
                >
                    {{ submitting ? 'جارٍ الاعتماد…' : 'اعتماد البيع' }}
                </button>
            </footer>
        </div>
    </div>
</template>

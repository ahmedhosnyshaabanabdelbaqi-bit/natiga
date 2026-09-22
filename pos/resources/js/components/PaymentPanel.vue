<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { http, toApiError, isNetworkError, uuid } from '@/lib/api';
import * as M from '@/lib/money';
import { useCartStore } from '@/stores/cart';
import { useConnectionStore } from '@/stores/connection';
import { useAuthStore } from '@/stores/auth';
import AppIcon from '@/components/AppIcon.vue';
import NumericKeypad from '@/components/NumericKeypad.vue';
import PanelShell from '@/components/PanelShell.vue';
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
    <PanelShell title="الدفع" icon="wallet" width="lg" @close="emit('close')">
        <div class="scroll-slim grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
            <!-- ─── الأرقام التي تهم ─── -->
            <section class="flex flex-col gap-3">
                <dl class="rounded-lg border border-line bg-surface-2 p-4">
                    <div class="flex items-baseline justify-between">
                        <dt class="text-sm font-bold text-ink-muted">إجمالي الفاتورة</dt>
                        <dd class="num text-2xl font-black">{{ money(cart.totals.grand_total) }}</dd>
                    </div>
                    <div class="mt-2 flex items-baseline justify-between border-t border-line pt-2">
                        <dt class="text-sm font-bold text-cash">المدفوع</dt>
                        <dd class="num text-xl font-extrabold text-cash">{{ money(cart.paidTotal) }}</dd>
                    </div>
                    <div class="mt-1.5 flex items-baseline justify-between">
                        <dt class="text-sm font-bold" :class="M.isZero(remaining) ? 'text-ink-subtle' : 'text-danger'">
                            المتبقي
                        </dt>
                        <dd
                            class="num text-xl font-extrabold"
                            :class="M.isZero(remaining) ? 'text-ink-subtle' : 'text-danger'"
                        >
                            {{ money(remaining) }}
                        </dd>
                    </div>
                </dl>

                <!-- الباقي للعميل: أبرز رقم بعد الإجمالي -->
                <div
                    v-if="!M.isZero(change)"
                    class="flex items-baseline justify-between rounded-lg border border-warn/35 bg-warn-soft px-4 py-3"
                >
                    <span class="flex items-center gap-2 text-sm font-black text-warn-strong">
                        <AppIcon name="undo" :size="17" />
                        الباقي للعميل
                    </span>
                    <span class="num text-3xl font-black text-warn-strong">{{ money(change) }}</span>
                </div>

                <ul v-if="cart.payments.length" class="divide-y divide-line overflow-hidden rounded-lg border border-line">
                    <li
                        v-for="(payment, index) in cart.payments"
                        :key="index"
                        class="flex items-center gap-2 bg-surface-1 px-3 py-2.5 text-sm"
                    >
                        <span class="font-bold">
                            {{ methods.find((m) => m.id === payment.payment_method_id)?.name }}
                        </span>
                        <span v-if="payment.reference" class="num truncate text-[11px] text-ink-subtle">
                            {{ payment.reference }}
                        </span>
                        <span class="num mr-auto font-extrabold">{{ money(payment.amount) }}</span>
                        <span
                            v-if="M.compare(payment.tendered_amount, payment.amount) > 0"
                            class="num text-[11px] text-ink-subtle"
                        >
                            مُسلَّم {{ money(payment.tendered_amount) }}
                        </span>
                        <button
                            class="grid size-6 place-items-center rounded text-ink-subtle t-fast hover:bg-danger-soft hover:text-danger"
                            aria-label="حذف الدفعة"
                            @click="cart.removePayment(index)"
                        >
                            <AppIcon name="close" :size="14" />
                        </button>
                    </li>
                </ul>

                <label
                    class="flex items-center gap-2.5 rounded-lg border border-line bg-surface-1 px-3 py-2.5 text-sm"
                    :class="cart.customerId ? 'cursor-pointer' : 'opacity-55'"
                >
                    <input
                        v-model="cart.isCredit"
                        type="checkbox"
                        :disabled="!cart.customerId"
                        class="size-4 accent-[var(--color-brand)]"
                    />
                    <span class="font-bold">بيع آجل</span>
                    <span class="text-[11px] text-ink-subtle">يتطلب اختيار عميل معروف</span>
                </label>
            </section>

            <!-- ─── الإدخال ─── -->
            <section class="flex flex-col gap-2.5">
                <div class="flex flex-wrap gap-1.5">
                    <button
                        v-for="method in methods"
                        :key="method.id"
                        class="t-pop flex items-center gap-1.5 rounded-md px-3.5 py-2.5 text-sm font-bold t-fast"
                        :class="selectedMethod?.id === method.id
                            ? 'bg-brand text-white'
                            : 'bg-surface-2 text-ink-muted hover:bg-surface-3'"
                        @click="selectMethod(method)"
                    >
                        <AppIcon :name="method.type === 'cash' ? 'wallet' : 'tag'" :size="15" />
                        {{ method.name }}
                    </button>
                </div>

                <input
                    ref="amountInput"
                    v-model="entry"
                    data-keep-focus="true"
                    inputmode="decimal"
                    aria-label="المبلغ"
                    class="num field-lg !border-2 text-center text-2xl"
                    @keydown.enter.prevent="applyPayment"
                />

                <input
                    v-if="selectedMethod?.requires_reference"
                    v-model="reference"
                    data-keep-focus="true"
                    placeholder="رقم المرجع من جهاز الشبكة"
                    class="field text-sm"
                />
                <p
                    v-if="selectedMethod && selectedMethod.type !== 'cash'"
                    class="flex items-start gap-1.5 rounded-md bg-info-soft px-2.5 py-2 text-[11px] text-ink-muted"
                >
                    <AppIcon name="info" :size="14" class="mt-px text-info" />
                    تسجيل يدوي لعملية تمت على جهاز خارجي — ليس تكاملًا بنكيًا تلقائيًا.
                </p>

                <div class="flex flex-wrap gap-1.5">
                    <button
                        v-for="amount in quickAmounts"
                        :key="amount"
                        class="num t-pop rounded-md bg-surface-2 px-3 py-2 text-sm font-bold text-ink t-fast hover:bg-surface-3"
                        @click="entry = amount"
                    >
                        {{ money(amount) }}
                    </button>
                </div>

                <NumericKeypad v-model="entry" allow-decimal @enter="applyPayment" />

                <button
                    class="t-pop w-full rounded-md bg-ink py-2.5 text-sm font-bold text-surface-1 t-fast hover:opacity-90"
                    @click="payExact"
                >
                    دفع المبلغ المتبقي بالضبط
                </button>
            </section>
        </div>

        <!-- ─── الرسائل ─── -->
        <div
            v-if="error"
            class="flex shrink-0 items-start gap-2 whitespace-pre-line border-t border-danger/25 bg-danger-soft px-4 py-2.5 text-sm font-bold text-danger"
            role="alert"
        >
            <AppIcon name="alert" :size="16" class="mt-0.5" />
            {{ error.message }}
        </div>
        <div
            v-if="recovering"
            class="flex shrink-0 items-center gap-2 border-t border-warn/25 bg-warn-soft px-4 py-2.5 text-sm font-bold text-warn-strong"
            role="status"
        >
            <AppIcon name="sync" :size="16" />
            انقطع الرد — جارٍ الاستعلام عن نتيجة العملية بنفس المفتاح بدل إعادة البيع…
        </div>

        <footer class="safe-b shrink-0 border-t border-line bg-surface-2 p-3">
            <button
                class="t-pop flex w-full items-center justify-center gap-2 rounded-lg bg-cash py-4 text-xl font-black text-white shadow-md t-fast hover:bg-cash-strong disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="!cart.canComplete || submitting"
                @click="complete"
            >
                <AppIcon :name="submitting ? 'sync' : 'check'" :size="22" />
                {{ submitting ? 'جارٍ الاعتماد…' : 'اعتماد البيع' }}
            </button>
        </footer>
    </PanelShell>
</template>

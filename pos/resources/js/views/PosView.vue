<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { http, toApiError, isNetworkError } from '@/lib/api';
import * as M from '@/lib/money';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import { useConnectionStore } from '@/stores/connection';
import { findCachedBarcode } from '@/lib/offlineDb';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import PaymentPanel from '@/components/PaymentPanel.vue';
import HeldCartsPanel from '@/components/HeldCartsPanel.vue';
import ReturnPanel from '@/components/ReturnPanel.vue';
import ShiftPanel from '@/components/ShiftPanel.vue';
import type { ApiError, CatalogItem, PosBootstrap, ScanResult } from '@/types';

/**
 * The till.
 *
 * Layout in Arabic (RTL): the CART sits on the right where the eye lands first,
 * products fill the opposite side, the scan box is pinned at the top and the
 * total + pay button never move.
 *
 * A normal cash sale can be completed without touching the mouse:
 *   scan ... scan ... F9 (pay) ... type amount ... Enter.
 */

const router = useRouter();
const auth = useAuthStore();
const cart = useCartStore();
const connection = useConnectionStore();

const boot = ref<PosBootstrap | null>(null);
const scanInput = ref<HTMLInputElement | null>(null);
const scanValue = ref('');
const searchValue = ref('');
const results = ref<CatalogItem[]>([]);
const searching = ref(false);
const activeCategory = ref<number | null>(null);
const favoritesOnly = ref(false);
const error = ref<ApiError | null>(null);
const flash = ref<{ text: string; tone: 'ok' | 'warn' | 'error' } | null>(null);
const panel = ref<'none' | 'payment' | 'held' | 'return' | 'shift'>('none');
const lastSale = ref<{ number: string; change: string; provisional: boolean } | null>(null);
const restorePrompt = ref(false);

const gridMode = computed(() => boot.value?.layout === 'grid_first');
const shiftOpen = computed(() => boot.value?.shift?.status === 'open');

// ---- boot -----------------------------------------------------------------

onMounted(async () => {
    await load();
    window.addEventListener('keydown', onKey, true);

    // Offer to restore an interrupted basket rather than silently resurrecting it.
    if (await cart.restore()) restorePrompt.value = true;

    focusScan();
});

onUnmounted(() => window.removeEventListener('keydown', onKey, true));

async function load() {
    try {
        const { data } = await http.get<PosBootstrap>('/pos/bootstrap');
        boot.value = data;
        cart.configure(data.currency.cash_step, data.currency.scale);
        connection.serverReachable = true;
        if (data.layout === 'grid_first') void runSearch('');
    } catch (e) {
        if (isNetworkError(e)) connection.serverReachable = false;
        else error.value = toApiError(e);
    }
}

// ---- keyboard -------------------------------------------------------------
/**
 * Shortcuts are chosen to avoid browser conflicts (no Ctrl+N/W/T) and the final
 * sale is NEVER triggered by a stray key outside the payment screen.
 */
function onKey(event: KeyboardEvent) {
    const key = event.key;

    if (key === 'F2') { event.preventDefault(); focusSearch(); return; }
    if (key === 'F3') { event.preventDefault(); focusScan(); return; }
    if (key === 'F4') { event.preventDefault(); openPanel('held'); return; }
    if (key === 'F7') { event.preventDefault(); void holdCart(); return; }
    if (key === 'F8') { event.preventDefault(); openPanel('return'); return; }
    if (key === 'F9') { event.preventDefault(); openPayment(); return; }
    if (key === 'Escape') {
        if (panel.value !== 'none') {
            event.preventDefault();
            closePanel();
        }
        return;
    }
}

function focusScan() {
    // Never steal focus while a form field is being filled.
    const active = document.activeElement as HTMLElement | null;
    if (active?.dataset?.keepFocus === 'true') return;
    nextTick(() => scanInput.value?.focus());
}

function focusSearch() {
    nextTick(() => (document.getElementById('pos-search') as HTMLInputElement | null)?.focus());
}

// ---- scanning -------------------------------------------------------------

function beep(tone: 'ok' | 'error') {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        // Distinct tones: a short high blip for a hit, a low double for a miss.
        osc.frequency.value = tone === 'ok' ? 1180 : 320;
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + (tone === 'ok' ? 0.06 : 0.22));
        osc.onended = () => void ctx.close();
    } catch {
        /* audio is a nicety, never a blocker */
    }
}

function showFlash(text: string, tone: 'ok' | 'warn' | 'error') {
    flash.value = { text, tone };
    window.setTimeout(() => (flash.value = null), tone === 'ok' ? 1200 : 3000);
}

async function submitScan() {
    const code = scanValue.value.trim();
    if (!code) return;
    scanValue.value = '';

    try {
        const { data } = await http.post<ScanResult>('/pos/scan', {
            code,
            warehouse_id: boot.value?.terminal?.warehouse_id ?? undefined,
        });
        cart.addItem(data);
        beep('ok');
    } catch (e) {
        if (isNetworkError(e)) {
            // Degraded mode: fall back to the locally cached catalogue.
            connection.serverReachable = false;
            const cached = await findCachedBarcode(code);
            if (cached) {
                cart.addItem({
                    variant_id: cached.product.variant_id,
                    product_id: cached.product.product_id,
                    product_unit_id: cached.barcode.product_unit_id ?? cached.product.product_unit_id,
                    name: cached.product.name,
                    variant_name: cached.product.variant_name,
                    sku: cached.product.sku,
                    unit_name: 'قطعة',
                    unit_factor: '1',
                    type: cached.product.type,
                    tracking: 'none',
                    allow_fractional: cached.product.allow_fractional_qty,
                    unit_price: cached.product.unit_price,
                    available: '0',
                } as CatalogItem);
                beep('ok');
                showFlash('أُضيف من النسخة المحلية — سيتم التحقق عند المزامنة', 'warn');
            } else {
                beep('error');
                showFlash('الباركود غير موجود في النسخة المحلية', 'error');
            }
        } else {
            const api = toApiError(e);
            beep('error');
            showFlash(api.error_code === 'barcode_not_found' ? `باركود غير معروف: ${code}` : api.message, 'error');
        }
    } finally {
        // Focus returns to the scan box so the next scan just works.
        focusScan();
    }
}

// ---- search / grid --------------------------------------------------------

let searchTimer: number | undefined;

watch(searchValue, (value) => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void runSearch(value), 220);
});

async function runSearch(term: string) {
    searching.value = true;
    try {
        const { data } = await http.get('/pos/search', {
            params: {
                q: term || undefined,
                category_id: activeCategory.value ?? undefined,
                favorites: favoritesOnly.value || undefined,
                warehouse_id: boot.value?.terminal?.warehouse_id ?? undefined,
                per_page: 60,
            },
        });
        results.value = data.data;
    } catch (e) {
        if (isNetworkError(e)) connection.serverReachable = false;
    } finally {
        searching.value = false;
    }
}

function pickCategory(id: number | null) {
    activeCategory.value = id;
    favoritesOnly.value = false;
    void runSearch(searchValue.value);
}

function toggleFavorites() {
    favoritesOnly.value = !favoritesOnly.value;
    activeCategory.value = null;
    void runSearch(searchValue.value);
}

function addFromGrid(item: CatalogItem) {
    if (item.unit_price === null) {
        showFlash('لا يوجد سعر محدد لهذا الصنف', 'error');
        return;
    }
    cart.addItem(item);
    beep('ok');
    focusScan();
}

// ---- cart actions ---------------------------------------------------------

function openPanel(next: typeof panel.value) {
    if (panel.value === next) {
        closePanel();
        return;
    }
    panel.value = next;
}

/**
 * Closing the shift panel re-reads the bootstrap: a shift may have just been
 * opened or closed, and the header must not keep showing stale state.
 */
function closePanel() {
    const wasShift = panel.value === 'shift';
    panel.value = 'none';
    if (wasShift) void load();
    focusScan();
}

function openPayment() {
    if (cart.isEmpty) {
        showFlash('السلة فارغة', 'warn');
        return;
    }
    if (!shiftOpen.value) {
        showFlash('لا توجد وردية مفتوحة', 'error');
        panel.value = 'shift';
        return;
    }
    panel.value = 'payment';
}

async function holdCart() {
    if (cart.isEmpty) return;
    try {
        await http.post('/held-carts', {
            label: cart.customerName || `فاتورة ${new Date().toLocaleTimeString('ar-EG')}`,
            customer_id: cart.customerId,
            payload: {
                warehouse_id: boot.value?.terminal?.warehouse_id,
                lines: cart.lines,
                invoice_discount_type: cart.invoiceDiscountType,
                invoice_discount_value: cart.invoiceDiscountValue,
            },
        });
        cart.reset();
        showFlash('تم تعليق الفاتورة', 'ok');
    } catch (e) {
        error.value = toApiError(e);
    }
    focusScan();
}

function onSaleCompleted(result: { number: string; change: string; provisional: boolean }) {
    lastSale.value = result;
    panel.value = 'none';
    cart.reset();
    showFlash(`تم اعتماد الفاتورة ${result.number}`, 'ok');
    focusScan();
    window.setTimeout(() => (lastSale.value = null), 12000);
}

function discardRestored() {
    cart.reset();
    restorePrompt.value = false;
    focusScan();
}

function keepRestored() {
    restorePrompt.value = false;
    focusScan();
}

function lockScreen() {
    auth.lock();
    router.push({ name: 'login' });
}

const money = (v: string | null | undefined) => M.formatMoney(v, boot.value?.currency.scale ?? 2);
</script>

<template>
    <div dir="rtl" class="pos-screen flex h-screen flex-col bg-ink-100 text-ink-900">
        <!-- ===================== top bar ===================== -->
        <header class="flex shrink-0 items-center gap-3 bg-ink-900 px-3 py-2 text-white">
            <div class="flex items-center gap-2 text-sm font-bold">
                <span class="rounded-lg bg-brand-600 px-2 py-1">{{ boot?.terminal?.name ?? 'كاشير' }}</span>
                <span class="text-ink-300">{{ auth.user?.name }}</span>
                <span v-if="boot?.shift" class="text-ink-400">وردية {{ boot.shift.number }}</span>
                <span v-else class="rounded bg-danger-600 px-2 py-0.5 text-xs">لا توجد وردية</span>
            </div>

            <ConnectionBanner class="mr-auto" />

            <button class="rounded-lg bg-ink-700 px-3 py-1.5 text-xs font-bold" @click="openPanel('shift')">الوردية</button>
            <button class="rounded-lg bg-ink-700 px-3 py-1.5 text-xs font-bold" @click="lockScreen">قفل الشاشة</button>
            <RouterLink to="/app/dashboard" class="rounded-lg bg-ink-700 px-3 py-1.5 text-xs font-bold">الإدارة</RouterLink>
        </header>

        <!-- ===================== scan row ===================== -->
        <div class="flex shrink-0 items-center gap-2 border-b border-ink-200 bg-white px-3 py-2">
            <input
                ref="scanInput"
                v-model="scanValue"
                type="text"
                inputmode="none"
                autocomplete="off"
                placeholder="امسح الباركود (F3)"
                class="w-80 rounded-xl border-2 border-brand-600 px-4 py-2.5 text-lg font-bold outline-none focus:ring-2 focus:ring-brand-500/30"
                @keydown.enter.prevent="submitScan"
            />
            <input
                id="pos-search"
                v-model="searchValue"
                type="search"
                data-keep-focus="true"
                placeholder="ابحث بالاسم أو الكود (F2)"
                class="flex-1 rounded-xl border border-ink-300 px-4 py-2.5 outline-none focus:border-brand-500"
            />
            <span v-if="searching" class="text-xs text-ink-500">جارٍ البحث…</span>

            <button class="rounded-xl bg-ink-800 px-3 py-2.5 text-sm font-bold text-white" @click="toggleFavorites">
                {{ favoritesOnly ? '● المفضلة' : 'المفضلة' }}
            </button>
        </div>

        <!-- flash -->
        <div
            v-if="flash"
            :class="[
                'shrink-0 px-3 py-1.5 text-center text-sm font-bold text-white',
                flash.tone === 'ok' ? 'bg-cash-600' : flash.tone === 'warn' ? 'bg-warn-500' : 'bg-danger-600',
            ]"
        >
            {{ flash.text }}
        </div>

        <!-- restored basket -->
        <div v-if="restorePrompt" class="flex shrink-0 items-center gap-3 bg-warn-500 px-3 py-2 text-sm font-bold text-ink-900">
            <span>تمت استعادة سلة غير مكتملة من الجلسة السابقة ({{ cart.itemCount }} بند).</span>
            <button class="rounded bg-ink-900 px-3 py-1 text-white" @click="keepRestored">احتفظ بها</button>
            <button class="rounded bg-white px-3 py-1" @click="discardRestored">ابدأ سلة جديدة</button>
        </div>

        <!-- ===================== body ===================== -->
        <div class="flex min-h-0 flex-1">
            <!-- CART: right side in RTL, where the eye lands first -->
            <section class="flex w-[38%] min-w-[380px] flex-col border-l border-ink-200 bg-white">
                <div class="flex items-center justify-between border-b border-ink-200 px-3 py-2">
                    <h2 class="text-sm font-black text-ink-700">سلة البيع ({{ cart.itemCount }})</h2>
                    <button
                        v-if="!cart.isEmpty"
                        class="text-xs font-bold text-danger-600"
                        @click="cart.reset()"
                    >
                        إفراغ السلة
                    </button>
                </div>

                <div class="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
                    <p v-if="cart.isEmpty" class="p-8 text-center text-sm text-ink-400">
                        ابدأ بمسح باركود أو اختيار صنف
                    </p>

                    <ul v-else class="divide-y divide-ink-100">
                        <li v-for="line in cart.lines" :key="line.key" class="px-3 py-2">
                            <div class="flex items-start gap-2">
                                <div class="min-w-0 flex-1">
                                    <p class="truncate text-sm font-bold">{{ line.name }}</p>
                                    <p class="text-xs text-ink-500">
                                        {{ line.sku }} · {{ line.unit_name }}
                                        <span v-if="line.tracking === 'serial'" class="text-warn-500">· سيريال</span>
                                    </p>
                                </div>
                                <button class="px-1 text-danger-600" @click="cart.removeLine(line.key)">✕</button>
                            </div>

                            <div class="mt-1.5 flex items-center gap-2">
                                <div class="flex items-center rounded-lg ring-1 ring-ink-200">
                                    <button class="px-3 py-1 text-lg font-bold" @click="cart.increment(line.key, '-1')">−</button>
                                    <input
                                        :value="line.qty"
                                        data-keep-focus="true"
                                        class="num w-16 border-x border-ink-200 py-1 text-center text-sm font-bold outline-none"
                                        @change="cart.setQty(line.key, ($event.target as HTMLInputElement).value)"
                                    />
                                    <button class="px-3 py-1 text-lg font-bold" @click="cart.increment(line.key)">+</button>
                                </div>

                                <span class="num text-sm text-ink-500">× {{ money(line.unit_price) }}</span>
                                <span class="num mr-auto text-base font-black">
                                    {{ money(M.multiply(line.qty, line.unit_price)) }}
                                </span>
                            </div>
                        </li>
                    </ul>
                </div>

                <!-- totals + pay: fixed, never moves -->
                <div class="shrink-0 border-t-2 border-ink-200 bg-ink-50 p-3">
                    <dl class="space-y-1 text-sm">
                        <div class="flex justify-between text-ink-600">
                            <dt>الإجمالي قبل الخصم</dt>
                            <dd class="num">{{ money(cart.totals.subtotal) }}</dd>
                        </div>
                        <div v-if="!M.isZero(cart.totals.discount_total)" class="flex justify-between text-danger-600">
                            <dt>الخصم</dt>
                            <dd class="num">− {{ money(cart.totals.discount_total) }}</dd>
                        </div>
                        <div v-if="!M.isZero(cart.totals.tax_total)" class="flex justify-between text-ink-600">
                            <dt>الضريبة</dt>
                            <dd class="num">{{ money(cart.totals.tax_total) }}</dd>
                        </div>
                        <div v-if="!M.isZero(cart.totals.rounding_adjustment)" class="flex justify-between text-ink-500">
                            <dt>تقريب</dt>
                            <dd class="num">{{ money(cart.totals.rounding_adjustment) }}</dd>
                        </div>
                    </dl>

                    <div class="mt-2 flex items-baseline justify-between border-t border-ink-200 pt-2">
                        <span class="text-base font-black">الإجمالي</span>
                        <span class="num text-3xl font-black text-brand-700">{{ money(cart.totals.grand_total) }}</span>
                    </div>

                    <div class="mt-3 grid grid-cols-4 gap-2">
                        <button
                            class="col-span-2 rounded-xl bg-cash-600 py-4 text-lg font-black text-white shadow active:bg-cash-500 fade-fast disabled:opacity-40"
                            :disabled="cart.isEmpty"
                            @click="openPayment"
                        >
                            دفع (F9)
                        </button>
                        <button class="rounded-xl bg-ink-700 py-4 text-sm font-bold text-white" :disabled="cart.isEmpty" @click="holdCart">
                            تعليق<br /><span class="text-xs opacity-70">F7</span>
                        </button>
                        <button class="rounded-xl bg-ink-700 py-4 text-sm font-bold text-white" @click="openPanel('held')">
                            المعلقة<br /><span class="text-xs opacity-70">F4</span>
                        </button>
                    </div>

                    <button class="mt-2 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-ink-700 ring-1 ring-ink-300" @click="openPanel('return')">
                        مرتجع / بحث عن فاتورة (F8)
                    </button>
                </div>
            </section>

            <!-- PRODUCTS -->
            <section class="flex min-w-0 flex-1 flex-col">
                <div v-if="boot?.categories?.length" class="scrollbar-slim flex shrink-0 gap-2 overflow-x-auto border-b border-ink-200 bg-white px-3 py-2">
                    <button
                        class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold"
                        :class="activeCategory === null && !favoritesOnly ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700'"
                        @click="pickCategory(null)"
                    >
                        الكل
                    </button>
                    <button
                        v-for="category in boot.categories"
                        :key="category.id"
                        class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold"
                        :class="activeCategory === category.id ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700'"
                        @click="pickCategory(category.id)"
                    >
                        {{ category.name }}
                    </button>
                </div>

                <div class="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-3">
                    <p v-if="!results.length && !searching" class="mt-16 text-center text-sm text-ink-400">
                        {{ gridMode ? 'لا توجد أصناف مطابقة' : 'ابحث أو امسح باركود لإضافة صنف' }}
                    </p>

                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        <button
                            v-for="item in results"
                            :key="item.variant_id"
                            class="flex flex-col rounded-xl bg-white p-2.5 text-right shadow-sm ring-1 ring-ink-200 active:bg-brand-600/10 fade-fast"
                            @click="addFromGrid(item)"
                        >
                            <span class="line-clamp-2 min-h-[2.5rem] text-sm font-bold">{{ item.name }}</span>
                            <span class="mt-1 text-xs text-ink-500">{{ item.sku }}</span>
                            <span class="num mt-1 text-base font-black text-brand-700">
                                {{ item.unit_price ? money(item.unit_price) : 'بدون سعر' }}
                            </span>
                            <span
                                class="num mt-0.5 text-xs"
                                :class="M.compare(item.available, '0') > 0 ? 'text-ink-500' : 'text-danger-600'"
                            >
                                متاح: {{ M.formatQty(item.available) }}
                            </span>
                        </button>
                    </div>
                </div>
            </section>
        </div>

        <!-- last sale confirmation, including change due -->
        <div
            v-if="lastSale"
            class="shrink-0 bg-cash-600 px-4 py-2 text-center text-white"
        >
            <span class="font-black">تم اعتماد الفاتورة {{ lastSale.number }}</span>
            <span v-if="!M.isZero(lastSale.change)" class="num mr-4 text-xl font-black">
                الباقي للعميل: {{ money(lastSale.change) }}
            </span>
            <span v-if="lastSale.provisional" class="mr-4 rounded bg-warn-500 px-2 py-0.5 text-xs">
                مستند غير متزامن — سيُعتمد عند عودة الخادم
            </span>
        </div>

        <!-- ===================== panels ===================== -->
        <PaymentPanel
            v-if="panel === 'payment'"
            :methods="boot?.payment_methods ?? []"
            :scale="boot?.currency.scale ?? 2"
            @close="closePanel"
            @completed="onSaleCompleted"
        />
        <HeldCartsPanel v-if="panel === 'held'" @close="closePanel" />
        <ReturnPanel v-if="panel === 'return'" @close="closePanel" />
        <ShiftPanel v-if="panel === 'shift'" @close="closePanel" />
    </div>
</template>

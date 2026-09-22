<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { http, toApiError, isNetworkError } from '@/lib/api';
import * as M from '@/lib/money';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import { useConnectionStore } from '@/stores/connection';
import { useThemeStore } from '@/stores/theme';
import { findCachedBarcode } from '@/lib/offlineDb';
import AppIcon from '@/components/AppIcon.vue';
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
const theme = useThemeStore();

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
        // حتى في وضع الباركود: المساحة المقابلة تعرض الأصناف بدل أن تبقى فارغة.
        void runSearch('');
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
    <div dir="rtl" class="pos-screen flex h-screen flex-col bg-surface-0 text-ink">
        <!-- ════════ الشريط العلوي ════════ -->
        <header class="on-chrome flex shrink-0 items-center gap-3 bg-chrome px-3 py-2 text-ink-invert">
            <div class="flex items-center gap-2">
                <span class="grid size-9 place-items-center rounded-md bg-brand text-white">
                    <AppIcon name="cart" :size="19" />
                </span>
                <div class="leading-tight">
                    <p class="text-[13px] font-extrabold">{{ boot?.terminal?.name ?? 'الكاشير' }}</p>
                    <p class="text-[11px] text-white/55">{{ auth.user?.name }}</p>
                </div>
            </div>

            <span
                v-if="boot?.shift"
                class="hidden items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white/80 sm:flex"
            >
                <AppIcon name="clock" :size="13" />
                {{ boot.shift.number }}
            </span>
            <button
                v-else
                class="flex items-center gap-1.5 rounded-md bg-danger px-2.5 py-1.5 text-[11px] font-bold text-white t-fast hover:bg-danger-strong"
                @click="openPanel('shift')"
            >
                <AppIcon name="alert" :size="13" />
                لا توجد وردية
            </button>

            <ConnectionBanner class="mr-auto" />

            <div class="flex items-center gap-1">
                <button
                    class="grid size-9 place-items-center rounded-md bg-white/10 text-white/80 t-fast hover:bg-white/20"
                    :title="theme.isDark ? 'الوضع النهاري' : 'الوضع الليلي'"
                    :aria-label="theme.isDark ? 'الوضع النهاري' : 'الوضع الليلي'"
                    @click="theme.toggle()"
                >
                    <AppIcon :name="theme.isDark ? 'sun' : 'moon'" :size="17" />
                </button>
                <button
                    class="grid size-9 place-items-center rounded-md bg-white/10 text-white/80 t-fast hover:bg-white/20"
                    title="الوردية والخزنة"
                    aria-label="الوردية والخزنة"
                    @click="openPanel('shift')"
                >
                    <AppIcon name="wallet" :size="17" />
                </button>
                <button
                    class="grid size-9 place-items-center rounded-md bg-white/10 text-white/80 t-fast hover:bg-white/20"
                    title="قفل الشاشة"
                    aria-label="قفل الشاشة"
                    @click="lockScreen"
                >
                    <AppIcon name="lock" :size="17" />
                </button>
                <RouterLink
                    to="/app/dashboard"
                    class="grid size-9 place-items-center rounded-md bg-white/10 text-white/80 t-fast hover:bg-white/20"
                    title="لوحة الإدارة"
                    aria-label="لوحة الإدارة"
                >
                    <AppIcon name="gauge" :size="17" />
                </RouterLink>
            </div>
        </header>

        <!-- ════════ شريط المسح والبحث ════════ -->
        <div class="flex shrink-0 items-center gap-2 border-b border-line bg-surface-1 px-3 py-2.5">
            <!-- خانة المسح: أبرز عنصر في الشاشة، دائمة التركيز -->
            <div class="relative w-[22rem] shrink-0">
                <AppIcon
                    name="scan"
                    :size="19"
                    class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-brand"
                />
                <input
                    ref="scanInput"
                    v-model="scanValue"
                    type="text"
                    inputmode="none"
                    autocomplete="off"
                    placeholder="امسح الباركود  ·  F3"
                    class="field-lg !border-2 !border-brand ps-11 text-lg"
                    @keydown.enter.prevent="submitScan"
                />
            </div>

            <div class="relative min-w-0 flex-1">
                <AppIcon
                    name="search"
                    :size="17"
                    class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle"
                />
                <input
                    id="pos-search"
                    v-model="searchValue"
                    type="search"
                    data-keep-focus="true"
                    placeholder="ابحث بالاسم أو الكود  ·  F2"
                    class="field ps-10"
                />
                <span
                    v-if="searching"
                    class="absolute end-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-ink-subtle"
                >
                    جارٍ البحث…
                </span>
            </div>

            <button
                class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-bold t-fast"
                :class="favoritesOnly
                    ? 'bg-warn text-white'
                    : 'bg-surface-2 text-ink-muted hover:bg-surface-3'"
                @click="toggleFavorites"
            >
                <AppIcon name="star" :size="16" />
                <span class="hidden lg:inline">المفضلة</span>
            </button>
        </div>

        <!-- ════════ الإشعارات ════════ -->
        <Transition name="none">
            <div
                v-if="flash"
                class="flex shrink-0 items-center justify-center gap-2 px-3 py-2 text-sm font-bold text-white"
                :class="flash.tone === 'ok' ? 'bg-cash' : flash.tone === 'warn' ? 'bg-warn' : 'bg-danger'"
                role="status"
            >
                <AppIcon :name="flash.tone === 'ok' ? 'check' : 'alert'" :size="16" />
                {{ flash.text }}
            </div>
        </Transition>

        <div
            v-if="restorePrompt"
            class="flex shrink-0 flex-wrap items-center gap-3 border-b border-warn/30 bg-warn-soft px-3 py-2.5 text-sm"
        >
            <AppIcon name="undo" :size="17" class="text-warn" />
            <span class="font-bold text-ink">
                تمت استعادة سلة غير مكتملة من الجلسة السابقة ({{ cart.itemCount }} بند).
            </span>
            <div class="mr-auto flex gap-2">
                <button class="rounded-md bg-ink px-3 py-1.5 text-xs font-bold text-surface-1" @click="keepRestored">
                    احتفظ بها
                </button>
                <button
                    class="rounded-md bg-surface-1 px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-line-strong"
                    @click="discardRestored"
                >
                    ابدأ سلة جديدة
                </button>
            </div>
        </div>

        <!-- ════════ الجسم ════════ -->
        <div class="flex min-h-0 flex-1">
            <!-- ─── السلة: يمين الشاشة في العربية، حيث تقع العين أولًا ─── -->
            <section class="flex w-[38%] min-w-[370px] max-w-[520px] flex-col border-s border-line bg-surface-1">
                <div class="flex items-center justify-between border-b border-line px-3.5 py-2.5">
                    <h2 class="flex items-center gap-2 text-sm font-extrabold">
                        <AppIcon name="cart" :size="17" class="text-brand" />
                        سلة البيع
                        <span
                            v-if="cart.itemCount"
                            class="num rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-extrabold text-brand-deep"
                        >
                            {{ cart.itemCount }}
                        </span>
                    </h2>
                    <button
                        v-if="!cart.isEmpty"
                        class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-danger t-fast hover:bg-danger-soft"
                        @click="cart.reset()"
                    >
                        <AppIcon name="trash" :size="14" />
                        إفراغ
                    </button>
                </div>

                <div class="scroll-slim min-h-0 flex-1 overflow-y-auto">
                    <div v-if="cart.isEmpty" class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                        <span class="grid size-14 place-items-center rounded-full bg-surface-2 text-ink-subtle">
                            <AppIcon name="scan" :size="26" />
                        </span>
                        <p class="text-sm text-ink-subtle">ابدأ بمسح باركود أو اختيار صنف</p>
                    </div>

                    <ul v-else class="divide-y divide-line">
                        <li v-for="line in cart.lines" :key="line.key" class="px-3.5 py-3">
                            <div class="flex items-start gap-2">
                                <div class="min-w-0 flex-1">
                                    <p class="truncate text-[15px] font-bold leading-tight">{{ line.name }}</p>
                                    <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-subtle">
                                        <span class="num">{{ line.sku }}</span>
                                        <span class="text-line-strong">·</span>
                                        <span>{{ line.unit_name }}</span>
                                        <span
                                            v-if="line.tracking === 'serial'"
                                            class="rounded bg-warn-soft px-1.5 py-px font-bold text-warn"
                                        >
                                            سيريال
                                        </span>
                                        <span
                                            v-if="line.price_overridden"
                                            class="rounded bg-info-soft px-1.5 py-px font-bold text-info"
                                        >
                                            سعر معدّل
                                        </span>
                                    </p>
                                </div>
                                <button
                                    class="grid size-7 shrink-0 place-items-center rounded-md text-ink-subtle t-fast hover:bg-danger-soft hover:text-danger"
                                    :aria-label="`حذف ${line.name}`"
                                    @click="cart.removeLine(line.key)"
                                >
                                    <AppIcon name="close" :size="15" />
                                </button>
                            </div>

                            <div class="mt-2 flex items-center gap-2">
                                <div class="flex items-center overflow-hidden rounded-md border border-line-strong">
                                    <button
                                        class="grid size-8 place-items-center text-ink-muted t-fast hover:bg-surface-2"
                                        aria-label="إنقاص"
                                        @click="cart.increment(line.key, '-1')"
                                    >
                                        <AppIcon name="minus" :size="15" />
                                    </button>
                                    <input
                                        :value="line.qty"
                                        data-keep-focus="true"
                                        class="num w-16 border-x border-line-strong bg-transparent py-1.5 text-center text-sm font-extrabold text-ink outline-none"
                                        :aria-label="`كمية ${line.name}`"
                                        @change="cart.setQty(line.key, ($event.target as HTMLInputElement).value)"
                                    />
                                    <button
                                        class="grid size-8 place-items-center text-ink-muted t-fast hover:bg-surface-2"
                                        aria-label="زيادة"
                                        @click="cart.increment(line.key)"
                                    >
                                        <AppIcon name="plus" :size="15" />
                                    </button>
                                </div>

                                <span class="num text-[13px] text-ink-subtle">× {{ money(line.unit_price) }}</span>
                                <span class="num mr-auto text-base font-extrabold">
                                    {{ money(M.multiply(line.qty, line.unit_price)) }}
                                </span>
                            </div>
                        </li>
                    </ul>
                </div>

                <!-- ─── الإجماليات وزر الدفع: ثابتان، لا يتحركان أبدًا ─── -->
                <div class="safe-b shrink-0 border-t border-line bg-surface-2 px-3.5 pb-3 pt-3">
                    <dl class="space-y-1 text-[13px]">
                        <div class="flex justify-between text-ink-muted">
                            <dt>الإجمالي قبل الخصم</dt>
                            <dd class="num">{{ money(cart.totals.subtotal) }}</dd>
                        </div>
                        <div v-if="!M.isZero(cart.totals.discount_total)" class="flex justify-between text-danger">
                            <dt>الخصم</dt>
                            <dd class="num">− {{ money(cart.totals.discount_total) }}</dd>
                        </div>
                        <div v-if="!M.isZero(cart.totals.tax_total)" class="flex justify-between text-ink-muted">
                            <dt>الضريبة</dt>
                            <dd class="num">{{ money(cart.totals.tax_total) }}</dd>
                        </div>
                        <div v-if="!M.isZero(cart.totals.rounding_adjustment)" class="flex justify-between text-ink-subtle">
                            <dt>تقريب</dt>
                            <dd class="num">{{ money(cart.totals.rounding_adjustment) }}</dd>
                        </div>
                    </dl>

                    <div class="mt-2.5 flex items-baseline justify-between border-t border-line-strong pt-2.5">
                        <span class="text-[15px] font-extrabold">الإجمالي</span>
                        <span class="num text-[2rem] font-black leading-none text-brand-deep">
                            {{ money(cart.totals.grand_total) }}
                        </span>
                    </div>

                    <button
                        class="t-pop mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-cash py-4 text-lg font-black text-white shadow-md t-fast hover:bg-cash-strong disabled:cursor-not-allowed disabled:opacity-40"
                        :disabled="cart.isEmpty"
                        @click="openPayment"
                    >
                        <AppIcon name="wallet" :size="21" />
                        دفع
                        <kbd class="rounded bg-black/20 px-1.5 py-0.5 text-[11px] font-bold">F9</kbd>
                    </button>

                    <div class="mt-2 grid grid-cols-3 gap-2">
                        <button
                            class="t-pop flex flex-col items-center gap-0.5 rounded-lg bg-surface-1 py-2.5 text-[11px] font-bold text-ink ring-1 ring-line-strong t-fast hover:bg-surface-3 disabled:opacity-40"
                            :disabled="cart.isEmpty"
                            @click="holdCart"
                        >
                            <AppIcon name="pause" :size="16" />
                            تعليق<span class="text-ink-subtle">F7</span>
                        </button>
                        <button
                            class="t-pop flex flex-col items-center gap-0.5 rounded-lg bg-surface-1 py-2.5 text-[11px] font-bold text-ink ring-1 ring-line-strong t-fast hover:bg-surface-3"
                            @click="openPanel('held')"
                        >
                            <AppIcon name="layers" :size="16" />
                            المعلقة<span class="text-ink-subtle">F4</span>
                        </button>
                        <button
                            class="t-pop flex flex-col items-center gap-0.5 rounded-lg bg-surface-1 py-2.5 text-[11px] font-bold text-ink ring-1 ring-line-strong t-fast hover:bg-surface-3"
                            @click="openPanel('return')"
                        >
                            <AppIcon name="undo" :size="16" />
                            مرتجع<span class="text-ink-subtle">F8</span>
                        </button>
                    </div>
                </div>
            </section>

            <!-- ─── الأصناف ─── -->
            <section class="flex min-w-0 flex-1 flex-col">
                <div
                    v-if="boot?.categories?.length"
                    class="scroll-slim flex shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-surface-1 px-3 py-2"
                >
                    <button
                        class="shrink-0 rounded-md px-3 py-1.5 text-[13px] font-bold t-fast"
                        :class="activeCategory === null && !favoritesOnly
                            ? 'bg-brand text-white'
                            : 'bg-surface-2 text-ink-muted hover:bg-surface-3'"
                        @click="pickCategory(null)"
                    >
                        الكل
                    </button>
                    <button
                        v-for="category in boot.categories"
                        :key="category.id"
                        class="shrink-0 rounded-md px-3 py-1.5 text-[13px] font-bold t-fast"
                        :class="activeCategory === category.id
                            ? 'bg-brand text-white'
                            : 'bg-surface-2 text-ink-muted hover:bg-surface-3'"
                        @click="pickCategory(category.id)"
                    >
                        {{ category.name }}
                    </button>
                </div>

                <div class="scroll-slim min-h-0 flex-1 overflow-y-auto p-3">
                    <div
                        v-if="!results.length && !searching"
                        class="flex h-full flex-col items-center justify-center gap-3 text-center"
                    >
                        <span class="grid size-14 place-items-center rounded-full bg-surface-2 text-ink-subtle">
                            <AppIcon name="grid" :size="26" />
                        </span>
                        <p class="text-sm text-ink-subtle">
                            {{ gridMode ? 'لا توجد أصناف مطابقة' : 'ابحث أو امسح باركود لإضافة صنف' }}
                        </p>
                    </div>

                    <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                        <button
                            v-for="item in results"
                            :key="item.variant_id"
                            class="t-pop group flex flex-col rounded-lg border border-line bg-surface-1 p-3 text-right shadow-xs t-fast hover:border-brand hover:shadow-md"
                            @click="addFromGrid(item)"
                        >
                            <span class="clamp-2 min-h-[2.6rem] text-[13px] font-bold leading-snug">
                                {{ item.name }}
                            </span>
                            <span class="num mt-1 text-[11px] text-ink-subtle">{{ item.sku }}</span>

                            <span class="mt-2 flex items-end justify-between gap-1">
                                <span class="num text-base font-black text-brand-deep">
                                    {{ item.unit_price ? money(item.unit_price) : '—' }}
                                </span>
                                <span
                                    class="num rounded px-1.5 py-0.5 text-[10px] font-bold"
                                    :class="M.compare(item.available, '0') > 0
                                        ? 'bg-surface-2 text-ink-muted'
                                        : 'bg-danger-soft text-danger'"
                                >
                                    {{ M.formatQty(item.available) }}
                                </span>
                            </span>
                        </button>
                    </div>
                </div>
            </section>
        </div>

        <!-- ════════ تأكيد آخر فاتورة ════════ -->
        <div
            v-if="lastSale"
            class="safe-b flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-1 bg-cash px-4 py-2.5 text-white"
            role="status"
        >
            <span class="flex items-center gap-2 font-extrabold">
                <AppIcon name="check" :size="18" />
                تم اعتماد الفاتورة {{ lastSale.number }}
            </span>
            <span v-if="!M.isZero(lastSale.change)" class="flex items-baseline gap-2">
                <span class="text-sm opacity-90">الباقي للعميل</span>
                <span class="num text-2xl font-black">{{ money(lastSale.change) }}</span>
            </span>
            <span
                v-if="lastSale.provisional"
                class="flex items-center gap-1.5 rounded-md bg-warn px-2 py-1 text-[11px] font-bold"
            >
                <AppIcon name="alert" :size="13" />
                مستند غير متزامن — سيُعتمد عند عودة الخادم
            </span>
        </div>

        <!-- ════════ النوافذ ════════ -->
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

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { http, toApiError } from '@/lib/api';
import type { ApiError } from '@/types';

/**
 * First-run wizard.
 *
 * A shop can finish with one branch, one warehouse and one till. Nothing here
 * assumes a tax rate: tax is opt-in and the rate is the shop's own decision.
 */
const router = useRouter();
const step = ref(1);
const error = ref<ApiError | null>(null);
const status = ref<Record<string, any> | null>(null);
const busy = ref(false);

const store = ref({
    name: '', legal_name: '', business_profile: 'general_retail',
    currency: 'EGP', timezone: 'Africa/Cairo', locale: 'ar',
    phone: '', email: '', address: '', tax_number: '',
});

const branch = ref({ code: 'MAIN', name: 'الفرع الرئيسي', phone: '', address: '' });
const warehouse = ref({ code: 'WH-MAIN', name: 'المخزن الرئيسي', type: 'sales', is_default: true, branch_id: null as number | null });
const terminal = ref({ code: 'POS1', name: 'كاشير 1', offline_allowed: true, offline_max_hours: 12, offline_max_sale_amount: '5000', branch_id: null as number | null, warehouse_id: null as number | null });
const user = ref({ name: '', username: '', password: '', pin: '', role: 'cashier', max_discount_percent: '5', max_discount_amount: '50' });
const tax = ref({ enabled: false, rate: '', inclusive: false });
const taxNotice = ref('');

onMounted(async () => {
    const { data } = await http.get('/setup/status');
    status.value = data;
    if (data.store) Object.assign(store.value, {
        name: data.store.name ?? '', business_profile: data.store.business_profile ?? 'general_retail',
        currency: data.store.currency ?? 'EGP', timezone: data.store.timezone ?? 'Africa/Cairo',
    });
});

async function call<T>(url: string, payload: unknown): Promise<T | null> {
    busy.value = true;
    error.value = null;
    try {
        const { data } = await http.post(url, payload);
        return data as T;
    } catch (e) {
        error.value = toApiError(e);
        return null;
    } finally {
        busy.value = false;
    }
}

async function saveStore() {
    if (await call('/setup/store', store.value)) step.value = 2;
}

async function saveBranch() {
    const result = await call<{ branch: { id: number } }>('/setup/branch', branch.value);
    if (result) {
        warehouse.value.branch_id = result.branch.id;
        terminal.value.branch_id = result.branch.id;
        step.value = 3;
    }
}

async function saveWarehouse() {
    const result = await call<{ warehouse: { id: number } }>('/setup/warehouse', warehouse.value);
    if (result) {
        terminal.value.warehouse_id = result.warehouse.id;
        step.value = 4;
    }
}

async function saveTerminal() {
    if (await call('/setup/terminal', terminal.value)) step.value = 5;
}

async function saveUser() {
    if (await call('/setup/user', { ...user.value, branch_id: terminal.value.branch_id })) step.value = 6;
}

async function saveTax() {
    const result = await call<{ notice: string }>('/setup/tax', {
        enabled: tax.value.enabled,
        groups: tax.value.enabled && tax.value.rate
            ? [{ code: 'STANDARD', name: 'ضريبة قياسية', rate: tax.value.rate, is_inclusive: tax.value.inclusive }]
            : [],
    });
    if (result) {
        taxNotice.value = result.notice;
        step.value = 7;
    }
}

async function finish() {
    if (await call('/setup/complete', {})) router.push('/pos');
}
</script>

<template>
    <div dir="rtl" class="min-h-screen bg-ink-100 p-4">
        <div class="mx-auto max-w-2xl">
            <h1 class="mb-1 text-2xl font-black">معالج إعداد المحل</h1>
            <p class="mb-4 text-sm text-ink-500">يكفي محل واحد ومخزن واحد وكاشير واحد للبدء. الباقي اختياري ويمكن تعديله لاحقًا.</p>

            <ol class="mb-4 flex flex-wrap gap-1 text-xs">
                <li v-for="(label, i) in ['المحل', 'الفرع', 'المخزن', 'الكاشير', 'المستخدمون', 'الضرائب', 'إنهاء']" :key="i"
                    class="rounded-full px-3 py-1 font-bold"
                    :class="step === i + 1 ? 'bg-brand-600 text-white' : step > i + 1 ? 'bg-cash-600/20 text-cash-600' : 'bg-white text-ink-400'">
                    {{ i + 1 }}. {{ label }}
                </li>
            </ol>

            <div class="rounded-2xl bg-white p-5 ring-1 ring-ink-200">
                <!-- 1: store -->
                <form v-if="step === 1" class="grid gap-3 sm:grid-cols-2" @submit.prevent="saveStore">
                    <label class="text-sm font-bold sm:col-span-2">اسم المحل<input v-model="store.name" required class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">نوع النشاط
                        <select v-model="store.business_profile" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2">
                            <option v-for="profile in status?.profiles ?? []" :key="profile.key" :value="profile.key">{{ profile.label }}</option>
                        </select>
                    </label>
                    <label class="text-sm font-bold">العملة<input v-model="store.currency" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">المنطقة الزمنية<input v-model="store.timezone" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">لغة الواجهة
                        <select v-model="store.locale" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2">
                            <option value="ar">العربية (RTL)</option>
                            <option value="en">English</option>
                        </select>
                    </label>
                    <label class="text-sm font-bold">الهاتف<input v-model="store.phone" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">البريد<input v-model="store.email" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold sm:col-span-2">العنوان<input v-model="store.address" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <p class="text-xs text-ink-500 sm:col-span-2">
                        اختيار النشاط يفعّل المزايا المناسبة له فقط (مثلًا: المقاسات للملابس، الصلاحية للبقالة)، ويمكن تغييرها لاحقًا دون فقد البيانات.
                    </p>
                    <button class="rounded-lg bg-brand-600 px-6 py-2.5 font-bold text-white sm:col-span-2" :disabled="busy">التالي</button>
                </form>

                <!-- 2: branch -->
                <form v-else-if="step === 2" class="grid gap-3 sm:grid-cols-2" @submit.prevent="saveBranch">
                    <label class="text-sm font-bold">كود الفرع<input v-model="branch.code" required class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">اسم الفرع<input v-model="branch.name" required class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">الهاتف<input v-model="branch.phone" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">العنوان<input v-model="branch.address" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <button class="rounded-lg bg-brand-600 px-6 py-2.5 font-bold text-white sm:col-span-2" :disabled="busy">التالي</button>
                </form>

                <!-- 3: warehouse -->
                <form v-else-if="step === 3" class="grid gap-3 sm:grid-cols-2" @submit.prevent="saveWarehouse">
                    <label class="text-sm font-bold">كود المخزن<input v-model="warehouse.code" required class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">اسم المخزن<input v-model="warehouse.name" required class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">النوع
                        <select v-model="warehouse.type" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2">
                            <option value="sales">مخزن بيع</option>
                            <option value="storage">مخزن تخزين</option>
                            <option value="returns">مخزن مرتجعات</option>
                            <option value="damaged">مخزن تالف</option>
                        </select>
                    </label>
                    <button class="rounded-lg bg-brand-600 px-6 py-2.5 font-bold text-white sm:col-span-2" :disabled="busy">التالي</button>
                </form>

                <!-- 4: terminal -->
                <form v-else-if="step === 4" class="grid gap-3 sm:grid-cols-2" @submit.prevent="saveTerminal">
                    <label class="text-sm font-bold">كود الكاشير<input v-model="terminal.code" required class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">اسم الكاشير<input v-model="terminal.name" required class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="flex items-center gap-2 text-sm font-bold sm:col-span-2">
                        <input v-model="terminal.offline_allowed" type="checkbox" class="h-4 w-4" />
                        السماح بالبيع النقدي عند فقد الخادم (اعتماد صريح لهذا الجهاز)
                    </label>
                    <label v-if="terminal.offline_allowed" class="text-sm font-bold">أقصى مدة (ساعات)<input v-model.number="terminal.offline_max_hours" type="number" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label v-if="terminal.offline_allowed" class="text-sm font-bold">أقصى قيمة فاتورة<input v-model="terminal.offline_max_sale_amount" class="num mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <button class="rounded-lg bg-brand-600 px-6 py-2.5 font-bold text-white sm:col-span-2" :disabled="busy">التالي</button>
                </form>

                <!-- 5: user -->
                <form v-else-if="step === 5" class="grid gap-3 sm:grid-cols-2" @submit.prevent="saveUser">
                    <label class="text-sm font-bold">الاسم<input v-model="user.name" required class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">اسم المستخدم<input v-model="user.username" required class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">كلمة المرور<input v-model="user.password" type="password" required minlength="8" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">رمز PIN (لفتح الشاشة)<input v-model="user.pin" class="num mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <label class="text-sm font-bold">الدور
                        <select v-model="user.role" class="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2">
                            <option value="cashier">كاشير</option>
                            <option value="branch_manager">مدير فرع</option>
                            <option value="accountant">محاسب</option>
                            <option value="storekeeper">أمين مخزن</option>
                            <option value="owner">مالك</option>
                        </select>
                    </label>
                    <label class="text-sm font-bold">أقصى نسبة خصم %<input v-model="user.max_discount_percent" class="num mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" /></label>
                    <div class="sm:col-span-2 flex gap-2">
                        <button class="rounded-lg bg-brand-600 px-6 py-2.5 font-bold text-white" :disabled="busy">حفظ والتالي</button>
                        <button type="button" class="rounded-lg bg-ink-100 px-6 py-2.5 font-bold" @click="step = 6">تخطي</button>
                    </div>
                </form>

                <!-- 6: tax -->
                <form v-else-if="step === 6" class="grid gap-3" @submit.prevent="saveTax">
                    <label class="flex items-center gap-2 text-sm font-bold">
                        <input v-model="tax.enabled" type="checkbox" class="h-4 w-4" /> تفعيل حساب الضريبة
                    </label>
                    <template v-if="tax.enabled">
                        <label class="text-sm font-bold">النسبة %<input v-model="tax.rate" class="num mt-1 w-full rounded-lg border border-ink-300 px-3 py-2" placeholder="أدخل النسبة المطبقة على نشاطك" /></label>
                        <label class="flex items-center gap-2 text-sm"><input v-model="tax.inclusive" type="checkbox" class="h-4 w-4" /> الأسعار شاملة الضريبة</label>
                    </template>
                    <p class="rounded-lg bg-warn-500/10 px-3 py-2 text-xs text-warn-500">
                        النظام لا يفترض نسبة ضريبة ولا التزامًا قانونيًا معينًا. تفعيل الحساب لا يعني الامتثال لمنظومة الفواتير الإلكترونية؛ ذلك يحتاج تكاملًا منفصلًا ومختبرًا.
                    </p>
                    <button class="rounded-lg bg-brand-600 px-6 py-2.5 font-bold text-white" :disabled="busy">التالي</button>
                </form>

                <!-- 7: done -->
                <div v-else class="text-center">
                    <p class="text-lg font-black text-cash-600">الإعداد الأساسي جاهز</p>
                    <p v-if="taxNotice" class="mt-2 text-xs text-ink-500">{{ taxNotice }}</p>
                    <p class="mt-3 text-sm text-ink-600">
                        الخطوة التالية: أضف الأصناف يدويًا أو استوردها، ثم سجّل الأرصدة الافتتاحية عبر استلام بضاعة.
                    </p>
                    <button class="mt-4 rounded-lg bg-cash-600 px-8 py-3 font-black text-white" :disabled="busy" @click="finish">
                        ابدأ البيع
                    </button>
                </div>

                <p v-if="error" class="mt-3 rounded-lg bg-danger-500/10 px-3 py-2 text-sm font-bold text-danger-600">{{ error.message }}</p>
            </div>
        </div>
    </div>
</template>

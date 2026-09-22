<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { http, toApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/types';

const auth = useAuthStore();
const status = ref<Record<string, any> | null>(null);
const features = ref<Record<string, boolean>>({});
const error = ref<ApiError | null>(null);
const saved = ref('');

const labels: Record<string, string> = {
    variants: 'المتغيرات (لون / مقاس)',
    weighted_items: 'الأصناف الموزونة والموازين',
    serials: 'الأرقام التسلسلية والضمان',
    batches: 'الدفعات وتواريخ الصلاحية',
    multi_unit: 'وحدات متعددة (كرتونة / علبة / قطعة)',
    taxes: 'حساب الضريبة',
    credit_sales: 'البيع الآجل',
    loyalty: 'نقاط الولاء',
    promotions: 'العروض',
    quotes: 'عروض الأسعار',
    reservations: 'الحجوزات',
    delivery: 'التوصيل',
    customer_display: 'شاشة العميل',
    warranty: 'الضمان',
    offline_mode: 'العمل دون خادم',
    return_without_invoice: 'مرتجع بدون فاتورة (عالي الخطورة)',
    negative_stock: 'السماح بالمخزون السالب (عالي الخطورة)',
};

onMounted(async () => {
    const { data } = await http.get('/setup/status');
    status.value = data;
    features.value = { ...data.features };
});

async function save() {
    error.value = null;
    saved.value = '';
    try {
        const { data } = await http.post('/setup/features', { features: features.value });
        features.value = data.features;
        saved.value = 'تم الحفظ. تعطيل ميزة يخفي واجهتها فقط ولا يحذف البيانات المسجلة بها.';
        await auth.fetchMe();
    } catch (e) {
        error.value = toApiError(e);
    }
}
</script>

<template>
    <div>
        <h1 class="mb-3 text-xl font-black">الإعدادات</h1>

        <div v-if="status" class="mb-4 rounded-2xl bg-white p-4 ring-1 ring-ink-200">
            <h2 class="mb-2 font-black">بيانات المنشأة</h2>
            <dl class="grid gap-2 text-sm sm:grid-cols-3">
                <div><dt class="text-ink-500">الاسم</dt><dd class="font-bold">{{ status.store?.name }}</dd></div>
                <div><dt class="text-ink-500">النشاط</dt><dd class="font-bold">{{ status.store?.business_profile }}</dd></div>
                <div><dt class="text-ink-500">العملة</dt><dd class="font-bold">{{ status.store?.currency }}</dd></div>
                <div><dt class="text-ink-500">المنطقة الزمنية</dt><dd class="font-bold">{{ status.store?.timezone }}</dd></div>
                <div><dt class="text-ink-500">حالة الإعداد</dt><dd class="font-bold">{{ status.completed ? 'مكتمل' : 'غير مكتمل' }}</dd></div>
            </dl>
            <RouterLink v-if="auth.can('settings.manage')" to="/setup" class="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white">
                فتح معالج الإعداد
            </RouterLink>
        </div>

        <div class="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
            <h2 class="mb-1 font-black">مزايا النشاط</h2>
            <p class="mb-3 text-xs text-ink-500">
                فعّل ما يناسب نشاطك فقط. إخفاء ميزة لا يحذف البيانات المسجلة بها، ويمكن إعادة تفعيلها لاحقًا.
            </p>

            <div class="grid gap-2 sm:grid-cols-2">
                <label v-for="(value, key) in features" :key="key" class="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm">
                    <input v-model="features[key]" type="checkbox" :disabled="!auth.can('settings.manage')" class="h-4 w-4" />
                    <span :class="key === 'return_without_invoice' || key === 'negative_stock' ? 'font-bold text-danger-600' : ''">
                        {{ labels[key] ?? key }}
                    </span>
                </label>
            </div>

            <button
                v-if="auth.can('settings.manage')"
                class="mt-3 rounded-lg bg-brand-600 px-6 py-2.5 font-bold text-white"
                @click="save"
            >
                حفظ
            </button>

            <p v-if="saved" class="mt-2 rounded-lg bg-cash-600/10 px-3 py-2 text-sm font-bold text-cash-600">{{ saved }}</p>
            <p v-if="error" class="mt-2 rounded-lg bg-danger-500/10 px-3 py-2 text-sm font-bold text-danger-600">{{ error.message }}</p>
        </div>
    </div>
</template>

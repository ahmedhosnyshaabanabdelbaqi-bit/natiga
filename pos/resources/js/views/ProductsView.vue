<script setup lang="ts">
import * as L from '@/lib/labels';
import AppIcon from '@/components/AppIcon.vue';
import { computed, onMounted, ref } from 'vue';
import { http, toApiError } from '@/lib/api';
import * as M from '@/lib/money';
import DataTable from '@/components/DataTable.vue';
import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/types';

const auth = useAuthStore();
const search = ref('');
const showForm = ref(false);
const lookups = ref<Record<string, any[]>>({});
const error = ref<ApiError | null>(null);
const saved = ref('');
const table = ref<InstanceType<typeof DataTable> | null>(null);

const form = ref({
    sku: '',
    name: '',
    name_en: '',
    base_unit: 'piece',
    type: 'standard',
    tracking: 'none',
    category_id: null as number | null,
    tax_group_id: null as number | null,
    min_stock: '0',
    barcode: '',
    price: '',
    wholesale_price: '',
    carton_factor: '',
    warranty_months: null as number | null,
});

const params = computed(() => ({ q: search.value || undefined }));

const columns = [
    { key: 'sku', label: 'الكود' },
    { key: 'name', label: 'الاسم' },
    { key: 'category.name', label: 'التصنيف' },
    { key: 'base_unit.name', label: 'الوحدة' },
    { key: 'type', label: 'النوع', format: (r: Record<string, unknown>) => L.productType(r.type) },
    { key: 'tracking', label: 'التتبع', format: (r: Record<string, unknown>) => L.tracking(r.tracking) },
    { key: 'is_active', label: 'الحالة', format: (r: Record<string, unknown>) => (r.is_active ? 'مفعل' : 'معطل') },
];

onMounted(async () => {
    const { data } = await http.get('/products/lookups');
    lookups.value = data;
});

async function submit() {
    error.value = null;
    saved.value = '';

    const payload: Record<string, unknown> = {
        sku: form.value.sku,
        name: form.value.name,
        name_en: form.value.name_en || undefined,
        base_unit: form.value.base_unit,
        type: form.value.type,
        tracking: form.value.tracking,
        category_id: form.value.category_id ?? undefined,
        tax_group_id: form.value.tax_group_id ?? undefined,
        min_stock: form.value.min_stock,
        warranty_months: form.value.warranty_months ?? undefined,
        barcodes: form.value.barcode ? [{ code: form.value.barcode }] : [],
        prices: [] as unknown[],
        units: [] as unknown[],
    };

    if (form.value.price) (payload.prices as unknown[]).push({ price_list: 'RETAIL', price: form.value.price });
    if (form.value.wholesale_price) (payload.prices as unknown[]).push({ price_list: 'WHOLESALE', price: form.value.wholesale_price });
    if (form.value.carton_factor) {
        (payload.units as unknown[]).push({ unit: 'carton', factor: form.value.carton_factor });
    }

    try {
        await http.post('/products', payload);
        saved.value = 'تم حفظ الصنف.';
        showForm.value = false;
        form.value.sku = '';
        form.value.name = '';
        form.value.barcode = '';
        form.value.price = '';
        table.value?.reload();
    } catch (e) {
        error.value = toApiError(e);
    }
}
</script>

<template>
    <div>
        <div class="mb-3 flex flex-wrap items-center gap-2">
            <h1 class="flex items-center gap-2 text-xl font-black">
                <span class="grid size-8 place-items-center rounded-md bg-brand-soft text-brand-deep">
                    <AppIcon name="tag" :size="17" />
                </span>
                الأصناف
            </h1>
            <input v-model="search" placeholder="بحث بالاسم أو الكود" class="rounded-lg border border-line-strong px-3 py-2 text-sm" />
            <button
                v-if="auth.can('catalog.manage')"
                class="mr-auto rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
                @click="showForm = !showForm"
            >
                {{ showForm ? 'إغلاق' : 'صنف جديد' }}
            </button>
        </div>

        <p v-if="saved" class="mb-3 rounded-lg bg-cash/10 px-3 py-2 text-sm font-bold text-cash">{{ saved }}</p>

        <form v-if="showForm" class="card mb-4 grid gap-3 p-4 sm:grid-cols-3" @submit.prevent="submit">
            <label class="text-sm font-bold">الكود (SKU)<input v-model="form.sku" required class="mt-1 w-full rounded-lg border border-line-strong px-3 py-2" /></label>
            <label class="text-sm font-bold">الاسم بالعربية<input v-model="form.name" required class="mt-1 w-full rounded-lg border border-line-strong px-3 py-2" /></label>
            <label class="text-sm font-bold">الاسم بالإنجليزية<input v-model="form.name_en" class="mt-1 w-full rounded-lg border border-line-strong px-3 py-2" /></label>

            <label class="text-sm font-bold">الوحدة الأساسية
                <select v-model="form.base_unit" class="mt-1 w-full rounded-lg border border-line-strong px-3 py-2">
                    <option v-for="unit in lookups.units ?? []" :key="unit.id" :value="unit.code">{{ unit.name }}</option>
                </select>
            </label>

            <label class="text-sm font-bold">النوع
                <select v-model="form.type" class="mt-1 w-full rounded-lg border border-line-strong px-3 py-2">
                    <option value="standard">عادي</option>
                    <option value="weighted">موزون</option>
                    <option value="service">خدمة (غير مخزني)</option>
                    <option value="bundle">باقة</option>
                </select>
            </label>

            <label class="text-sm font-bold">التتبع
                <select v-model="form.tracking" class="mt-1 w-full rounded-lg border border-line-strong px-3 py-2">
                    <option value="none">بدون</option>
                    <option v-if="auth.feature('serials')" value="serial">رقم تسلسلي</option>
                    <option v-if="auth.feature('batches')" value="batch">دفعات وصلاحية</option>
                </select>
            </label>

            <label class="text-sm font-bold">التصنيف
                <select v-model="form.category_id" class="mt-1 w-full rounded-lg border border-line-strong px-3 py-2">
                    <option :value="null">—</option>
                    <option v-for="category in lookups.categories ?? []" :key="category.id" :value="category.id">{{ category.name }}</option>
                </select>
            </label>

            <label class="text-sm font-bold">الباركود<input v-model="form.barcode" class="mt-1 w-full rounded-lg border border-line-strong px-3 py-2" /></label>
            <label class="text-sm font-bold">سعر التجزئة<input v-model="form.price" class="num mt-1 w-full rounded-lg border border-line-strong px-3 py-2" /></label>
            <label class="text-sm font-bold">سعر الجملة<input v-model="form.wholesale_price" class="num mt-1 w-full rounded-lg border border-line-strong px-3 py-2" /></label>

            <label v-if="auth.feature('multi_unit')" class="text-sm font-bold">
                عدد القطع في الكرتونة
                <input v-model="form.carton_factor" class="num mt-1 w-full rounded-lg border border-line-strong px-3 py-2" />
            </label>

            <label class="text-sm font-bold">الحد الأدنى للمخزون<input v-model="form.min_stock" class="num mt-1 w-full rounded-lg border border-line-strong px-3 py-2" /></label>

            <label v-if="form.tracking === 'serial'" class="text-sm font-bold">
                مدة الضمان (شهور)
                <input v-model.number="form.warranty_months" type="number" class="num mt-1 w-full rounded-lg border border-line-strong px-3 py-2" />
            </label>

            <div class="sm:col-span-3">
                <button type="submit" class="t-pop rounded-lg bg-brand px-6 py-2.5 font-bold text-white t-fast hover:bg-brand-strong">حفظ الصنف</button>
                <span v-if="error" class="mr-3 text-sm font-bold text-danger">{{ error.message }}</span>
            </div>
        </form>

        <DataTable ref="table" url="/products" :params="params" :columns="columns" />
    </div>
</template>

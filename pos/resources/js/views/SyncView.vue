<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { http, toApiError } from '@/lib/api';
import * as M from '@/lib/money';
import { useConnectionStore } from '@/stores/connection';
import type { ApiError } from '@/types';

/**
 * Manager review of operations that could not be applied as sent.
 *
 * Nothing here deletes a record or edits an amount collected from a customer:
 * the manager either accepts the operation (re-run under their authority, with
 * the server recalculating prices) or files it with a reason.
 */
const connection = useConnectionStore();
const rows = ref<Array<Record<string, any>>>([]);
const error = ref<ApiError | null>(null);
const note = ref('');
const busy = ref(false);

onMounted(load);

async function load() {
    try {
        const { data } = await http.get('/sync/conflicts');
        rows.value = data.data ?? [];
    } catch (e) {
        error.value = toApiError(e);
    }
    await connection.refreshLocalCounts();
}

async function resolve(row: Record<string, any>, decision: 'accept' | 'reject') {
    busy.value = true;
    error.value = null;
    try {
        await http.post(`/sync/conflicts/${row.id}/resolve`, { decision, note: note.value || undefined });
        note.value = '';
        await load();
    } catch (e) {
        error.value = toApiError(e);
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <div>
        <h1 class="mb-3 text-xl font-black">المزامنة والتعارضات</h1>

        <div class="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-200">
            <span class="text-sm font-bold">{{ connection.statusLabel }}</span>
            <span class="text-sm">بانتظار الإرسال: <b class="num">{{ connection.pendingCount }}</b></span>
            <span class="text-sm">تعارضات: <b class="num text-danger-600">{{ connection.conflictCount }}</b></span>
            <span v-if="connection.catalogCachedAt" class="text-xs text-ink-500">
                نسخة الأصناف المحلية: {{ new Date(connection.catalogCachedAt).toLocaleString('ar-EG') }}
            </span>

            <div class="mr-auto flex gap-2">
                <button class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white" @click="connection.flush()">إرسال المعلق الآن</button>
                <button class="rounded-lg bg-ink-800 px-4 py-2 text-sm font-bold text-white" @click="connection.pullCatalog()">تحديث النسخة المحلية</button>
                <button class="rounded-lg bg-white px-4 py-2 text-sm font-bold ring-1 ring-ink-300" @click="connection.exportQueue()">تصدير العمليات المعلقة</button>
            </div>
        </div>

        <p v-if="connection.storageError" class="mb-3 rounded-lg bg-danger-500/10 px-3 py-2 text-sm font-bold text-danger-600">
            {{ connection.storageError }}
        </p>

        <p class="mb-3 rounded-lg bg-warn-500/10 px-3 py-2 text-xs text-warn-500">
            تخزين المتصفح ليس نسخة احتياطية: قد يُمسح بتنظيف بيانات الموقع أو في وضع التصفح الخاص.
            صدّر العمليات المعلقة قبل إعادة ضبط الجهاز.
        </p>

        <div class="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200">
            <table class="w-full text-sm">
                <thead class="bg-ink-50 text-xs">
                    <tr>
                        <th class="px-3 py-2 text-right">الجهاز</th>
                        <th class="px-3 py-2 text-right">النوع</th>
                        <th class="px-3 py-2 text-right">وقت الإنشاء</th>
                        <th class="px-3 py-2 text-right">المبلغ المحصل</th>
                        <th class="px-3 py-2 text-right">سبب التعارض</th>
                        <th class="px-3 py-2 text-right">إجراء</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="!rows.length"><td colspan="6" class="py-8 text-center text-ink-400">لا توجد عمليات معلقة للمراجعة</td></tr>
                    <tr v-for="row in rows" :key="row.id" class="border-t border-ink-100 align-top">
                        <td class="px-3 py-2">{{ row.terminal?.name }}</td>
                        <td class="px-3 py-2">{{ row.type }}</td>
                        <td class="px-3 py-2">{{ row.client_created_at ? new Date(row.client_created_at).toLocaleString('ar-EG') : '—' }}</td>
                        <td class="num px-3 py-2 font-black">
                            {{ M.formatMoney(row.payload?.expected_grand_total ?? '0') }}
                        </td>
                        <td class="px-3 py-2">
                            <ul class="space-y-0.5 text-xs">
                                <li v-for="(conflict, i) in (row.conflicts ?? [])" :key="i" class="text-danger-600">
                                    {{ conflict.message }}
                                </li>
                            </ul>
                        </td>
                        <td class="px-3 py-2">
                            <div class="flex gap-1">
                                <button class="rounded bg-cash-600 px-2 py-1 text-xs font-bold text-white" :disabled="busy" @click="resolve(row, 'accept')">اعتماد</button>
                                <button class="rounded bg-danger-600 px-2 py-1 text-xs font-bold text-white" :disabled="busy" @click="resolve(row, 'reject')">رفض</button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <input v-model="note" placeholder="ملاحظة التسوية (تُسجَّل في سجل التدقيق)" class="mt-3 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm" />

        <p v-if="error" class="mt-3 rounded-lg bg-danger-500/10 px-3 py-2 text-sm font-bold text-danger-600">{{ error.message }}</p>
    </div>
</template>

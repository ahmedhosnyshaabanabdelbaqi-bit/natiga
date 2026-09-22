<script setup lang="ts">
import { computed } from 'vue';
import { useConnectionStore } from '@/stores/connection';

/**
 * Always-visible connection state. The cashier must never have to guess whether
 * a sale reached the server.
 */
const connection = useConnectionStore();

const tone = computed(() => {
    if (connection.status === 'online') return 'bg-cash-600';
    return connection.status === 'degraded' ? 'bg-warn-500' : 'bg-danger-600';
});

const lastSync = computed(() => {
    if (!connection.lastSyncAt) return 'لم تتم مزامنة بعد';
    const date = new Date(connection.lastSyncAt);
    return `آخر مزامنة ${date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
});
</script>

<template>
    <div class="flex items-center gap-2 text-xs font-semibold text-white">
        <span :class="[tone, 'flex items-center gap-1.5 rounded-full px-2.5 py-1 fade-fast']">
            <span class="inline-block h-2 w-2 rounded-full bg-white/90"></span>
            {{ connection.statusLabel }}
        </span>

        <span
            v-if="connection.pendingCount > 0"
            class="rounded-full bg-ink-700 px-2.5 py-1"
            :title="'عمليات محلية لم تصل الخادم بعد'"
        >
            بانتظار المزامنة: {{ connection.pendingCount }}
        </span>

        <span
            v-if="connection.conflictCount > 0"
            class="rounded-full bg-danger-600 px-2.5 py-1"
            title="عمليات تحتاج مراجعة المدير"
        >
            تعارضات: {{ connection.conflictCount }}
        </span>

        <span class="hidden text-ink-300 sm:inline">{{ lastSync }}</span>
    </div>
</template>

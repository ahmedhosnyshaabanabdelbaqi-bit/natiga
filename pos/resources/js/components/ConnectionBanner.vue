<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { useConnectionStore } from '@/stores/connection';

/**
 * حالة الاتصال، ظاهرة دائمًا.
 *
 * الكاشير يجب ألا يخمّن أبدًا هل وصلت الفاتورة إلى الخادم أم لا، ولا كم عملية
 * ما زالت محلية على جهازه.
 */
/**
 * `on` يخبر المكوّن بخلفيته: الشريط الداكن أم سطح الصفحة. الرقائق الثانوية
 * غير مقروءة لو افترضنا خلفية واحدة.
 */
const props = withDefaults(defineProps<{ on?: 'chrome' | 'surface' }>(), { on: 'chrome' });

const connection = useConnectionStore();

const chipClass = computed(() =>
    props.on === 'chrome' ? 'bg-white/10 text-white/85' : 'bg-surface-2 text-ink-muted',
);

const mutedClass = computed(() => (props.on === 'chrome' ? 'text-white/45' : 'text-ink-subtle'));

const tone = computed(() =>
    ({
        online: 'bg-cash text-white',
        degraded: 'bg-warn text-white',
        offline: 'bg-danger text-white',
    })[connection.status],
);

const icon = computed(() => (connection.status === 'online' ? 'wifi' : 'wifiOff'));

const lastSync = computed(() => {
    if (!connection.lastSyncAt) return 'لم تتم مزامنة بعد';
    const at = new Date(connection.lastSyncAt);
    return `آخر مزامنة ${at.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
});
</script>

<template>
    <div class="flex items-center gap-1.5 text-[11px] font-bold">
        <span :class="[tone, 'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 t-fast']">
            <AppIcon :name="icon" :size="13" />
            {{ connection.statusLabel }}
        </span>

        <span
            v-if="connection.pendingCount > 0"
            :class="chipClass"
            class="flex items-center gap-1 rounded-md px-2.5 py-1.5"
            title="عمليات محلية لم تصل الخادم بعد"
        >
            <AppIcon name="sync" :size="13" />
            <span class="num">{{ connection.pendingCount }}</span>
            <span class="hidden md:inline">بانتظار المزامنة</span>
        </span>

        <span
            v-if="connection.conflictCount > 0"
            class="flex items-center gap-1 rounded-md bg-danger px-2.5 py-1.5 text-white"
            title="عمليات تحتاج مراجعة المدير"
        >
            <AppIcon name="alert" :size="13" />
            <span class="num">{{ connection.conflictCount }}</span>
            <span class="hidden md:inline">تعارض</span>
        </span>

        <span :class="mutedClass" class="hidden lg:inline">{{ lastSync }}</span>
    </div>
</template>

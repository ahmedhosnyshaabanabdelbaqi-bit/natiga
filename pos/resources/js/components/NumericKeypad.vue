<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';

/** لوحة أرقام لمسية. أهداف لمس كبيرة تُصاب دون النظر إليها. */
const props = defineProps<{ modelValue: string; allowDecimal?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [string]; enter: [] }>();

const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', '.'];

function press(key: string) {
    if (key === '.' && (!props.allowDecimal || props.modelValue.includes('.'))) return;
    const next = props.modelValue === '0' && key !== '.' ? key : props.modelValue + key;
    emit('update:modelValue', next);
}

function backspace() {
    emit('update:modelValue', props.modelValue.slice(0, -1) || '0');
}
</script>

<template>
    <div class="grid grid-cols-3 gap-1.5">
        <button
            v-for="key in keys"
            :key="key"
            type="button"
            class="num t-pop rounded-lg border border-line bg-surface-1 py-3.5 text-xl font-extrabold text-ink shadow-xs t-fast hover:bg-surface-2"
            @click="press(key)"
        >
            {{ key }}
        </button>

        <button
            type="button"
            class="t-pop flex items-center justify-center gap-1.5 rounded-lg bg-surface-3 py-3.5 text-sm font-bold text-ink-muted t-fast hover:bg-line-strong"
            @click="backspace"
        >
            <AppIcon name="chevronRight" :size="16" />
            مسح
        </button>
        <button
            type="button"
            class="t-pop col-span-2 flex items-center justify-center gap-2 rounded-lg bg-brand py-3.5 text-base font-extrabold text-white t-fast hover:bg-brand-strong"
            @click="emit('enter')"
        >
            <AppIcon name="check" :size="18" />
            تأكيد
        </button>
    </div>
</template>

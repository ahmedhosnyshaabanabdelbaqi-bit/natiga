<script setup lang="ts">
/** Touch keypad for payment entry. Kept large enough to hit without looking. */
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
    <div class="grid grid-cols-3 gap-2">
        <button
            v-for="key in keys"
            :key="key"
            type="button"
            class="rounded-xl bg-white py-4 text-xl font-bold text-ink-800 shadow-sm ring-1 ring-ink-200 active:bg-ink-100 fade-fast"
            @click="press(key)"
        >
            {{ key }}
        </button>
        <button
            type="button"
            class="rounded-xl bg-ink-200 py-4 text-lg font-bold text-ink-700 active:bg-ink-300 fade-fast"
            @click="backspace"
        >
            مسح
        </button>
        <button
            type="button"
            class="col-span-2 rounded-xl bg-brand-600 py-4 text-lg font-bold text-white active:bg-brand-700 fade-fast"
            @click="emit('enter')"
        >
            تأكيد
        </button>
    </div>
</template>

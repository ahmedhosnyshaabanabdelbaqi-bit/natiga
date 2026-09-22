<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';

/**
 * الهيكل الموحّد لكل نوافذ شاشة البيع.
 *
 * رأس ثابت، جسم يتمرر، وتذييل ثابت — حتى لا يضطر الكاشير لتعلّم تخطيط جديد
 * مع كل نافذة. تُغلق بـ Esc أو بالنقر خارجها.
 */
withDefaults(
    defineProps<{ title: string; icon?: string; width?: 'sm' | 'md' | 'lg' }>(),
    { icon: 'info', width: 'md' },
);

const emit = defineEmits<{ close: [] }>();

const widths = { sm: 'max-w-lg', md: 'max-w-2xl', lg: 'max-w-4xl' } as const;
</script>

<template>
    <div
        class="fixed inset-0 z-50 flex items-end justify-center bg-chrome/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
        @click.self="emit('close')"
    >
        <div
            class="safe-b flex max-h-full w-full flex-col overflow-hidden rounded-t-xl border border-line bg-surface-1 shadow-panel sm:rounded-xl"
            :class="widths[width]"
        >
            <header class="flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-3">
                <span class="grid size-8 place-items-center rounded-md bg-brand-soft text-brand-deep">
                    <AppIcon :name="icon" :size="17" />
                </span>
                <h2 class="text-base font-extrabold">{{ title }}</h2>

                <button
                    class="mr-auto flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs font-bold text-ink-muted t-fast hover:bg-surface-3"
                    @click="emit('close')"
                >
                    <AppIcon name="close" :size="14" />
                    إغلاق
                    <kbd class="rounded bg-surface-1 px-1 text-[10px]">Esc</kbd>
                </button>
            </header>

            <slot />
        </div>
    </div>
</template>

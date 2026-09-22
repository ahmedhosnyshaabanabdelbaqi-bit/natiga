<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useConnectionStore } from '@/stores/connection';
import { useThemeStore } from '@/stores/theme';

const connection = useConnectionStore();
const auth = useAuthStore();
const theme = useThemeStore();

// الوضع مطبّق مبكرًا في app.ts قبل الرسم؛ هنا نتابع تغيّر تفضيل النظام فقط.
theme.apply();

onMounted(async () => {
    await auth.fetchMe();
    connection.listen();
    void connection.check();

    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (theme.theme === 'system') theme.apply();
    });
});
</script>

<template>
    <RouterView />
</template>

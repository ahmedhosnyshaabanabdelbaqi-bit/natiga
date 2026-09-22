<script setup lang="ts">
import { onMounted } from 'vue';
import { useConnectionStore } from '@/stores/connection';
import { useAuthStore } from '@/stores/auth';

const connection = useConnectionStore();
const auth = useAuthStore();

onMounted(async () => {
    await auth.fetchMe();
    connection.listen();
    void connection.check();
});
</script>

<template>
    <RouterView />
</template>

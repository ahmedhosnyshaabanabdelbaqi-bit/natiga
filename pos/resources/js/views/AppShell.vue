<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import ConnectionBanner from '@/components/ConnectionBanner.vue';

const auth = useAuthStore();

const links = computed(() =>
    [
        { to: '/app/dashboard', label: 'لوحة المالك', permission: 'reports.view' },
        { to: '/app/sales', label: 'الفواتير', permission: null },
        { to: '/app/products', label: 'الأصناف', permission: 'catalog.view' },
        { to: '/app/inventory', label: 'المخزون', permission: 'inventory.view' },
        { to: '/app/purchasing', label: 'المشتريات', permission: 'purchasing.view' },
        { to: '/app/customers', label: 'العملاء', permission: 'customers.view' },
        { to: '/app/shifts', label: 'الورديات', permission: null },
        { to: '/app/reports', label: 'التقارير', permission: 'reports.view' },
        { to: '/app/sync', label: 'المزامنة', permission: 'sales.view_all' },
        { to: '/app/settings', label: 'الإعدادات', permission: 'settings.view' },
    ].filter((link) => !link.permission || auth.can(link.permission)),
);
</script>

<template>
    <div dir="rtl" class="flex min-h-screen bg-ink-100">
        <aside class="w-56 shrink-0 bg-ink-900 p-3 text-white">
            <RouterLink to="/pos" class="mb-4 block rounded-xl bg-brand-600 px-3 py-3 text-center font-black">
                ← شاشة البيع
            </RouterLink>
            <nav class="space-y-1">
                <RouterLink
                    v-for="link in links"
                    :key="link.to"
                    :to="link.to"
                    class="block rounded-lg px-3 py-2 text-sm font-bold text-ink-300 hover:bg-ink-800"
                    active-class="bg-ink-800 text-white"
                >
                    {{ link.label }}
                </RouterLink>
            </nav>
            <button class="mt-6 w-full rounded-lg bg-ink-800 px-3 py-2 text-sm font-bold" @click="auth.logout()">
                تسجيل الخروج
            </button>
        </aside>

        <main class="min-w-0 flex-1">
            <header class="flex items-center gap-3 border-b border-ink-200 bg-white px-4 py-2.5">
                <span class="text-sm font-black">{{ auth.user?.name }}</span>
                <ConnectionBanner class="mr-auto" />
            </header>
            <div class="p-4">
                <RouterView />
            </div>
        </main>
    </div>
</template>

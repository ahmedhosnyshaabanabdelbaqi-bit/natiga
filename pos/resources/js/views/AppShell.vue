<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

const auth = useAuthStore();
const theme = useThemeStore();
const mobileNavOpen = ref(false);

/** القائمة تُبنى من صلاحيات المستخدم فعليًا، لا تُعرض ثم تُرفض. */
const links = computed(() =>
    [
        { to: '/app/dashboard', label: 'لوحة المالك', icon: 'gauge', permission: 'reports.view' },
        { to: '/app/sales', label: 'الفواتير', icon: 'receipt', permission: null },
        { to: '/app/products', label: 'الأصناف', icon: 'tag', permission: 'catalog.view' },
        { to: '/app/inventory', label: 'المخزون', icon: 'box', permission: 'inventory.view' },
        { to: '/app/purchasing', label: 'المشتريات', icon: 'truck', permission: 'purchasing.view' },
        { to: '/app/customers', label: 'العملاء', icon: 'users', permission: 'customers.view' },
        { to: '/app/shifts', label: 'الورديات', icon: 'clock', permission: null },
        { to: '/app/reports', label: 'التقارير', icon: 'chart', permission: 'reports.view' },
        { to: '/app/sync', label: 'المزامنة', icon: 'sync', permission: 'sales.view_all' },
        { to: '/app/settings', label: 'الإعدادات', icon: 'settings', permission: 'settings.view' },
    ].filter((link) => !link.permission || auth.can(link.permission)),
);
</script>

<template>
    <div dir="rtl" class="flex min-h-screen bg-surface-0">
        <!-- ─── القائمة الجانبية ─── -->
        <aside
            class="fixed inset-y-0 end-0 z-40 flex w-60 shrink-0 flex-col bg-chrome p-3 text-ink-invert transition-transform lg:static lg:translate-x-0"
            :class="mobileNavOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'"
        >
            <RouterLink
                to="/pos"
                class="t-pop mb-4 flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-3 font-black text-white shadow-md t-fast hover:bg-brand-strong"
            >
                <AppIcon name="cart" :size="19" />
                شاشة البيع
            </RouterLink>

            <nav class="scroll-slim min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                <RouterLink
                    v-for="link in links"
                    :key="link.to"
                    :to="link.to"
                    class="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-bold text-white/60 t-fast hover:bg-white/10 hover:text-white"
                    active-class="!bg-white/15 !text-white"
                    @click="mobileNavOpen = false"
                >
                    <AppIcon :name="link.icon" :size="17" />
                    {{ link.label }}
                </RouterLink>
            </nav>

            <div class="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                <div class="flex items-center gap-2 px-2 py-1">
                    <span class="grid size-8 place-items-center rounded-full bg-white/10 text-white/70">
                        <AppIcon name="user" :size="16" />
                    </span>
                    <div class="min-w-0 leading-tight">
                        <p class="truncate text-xs font-bold">{{ auth.user?.name }}</p>
                        <p class="truncate text-[10px] text-white/45">{{ auth.user?.roles?.[0] }}</p>
                    </div>
                </div>
                <button
                    class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-bold text-white/60 t-fast hover:bg-white/10 hover:text-white"
                    @click="theme.toggle()"
                >
                    <AppIcon :name="theme.isDark ? 'sun' : 'moon'" :size="17" />
                    {{ theme.isDark ? 'الوضع النهاري' : 'الوضع الليلي' }}
                </button>
                <button
                    class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-bold text-white/60 t-fast hover:bg-danger hover:text-white"
                    @click="auth.logout()"
                >
                    <AppIcon name="logout" :size="17" />
                    تسجيل الخروج
                </button>
            </div>
        </aside>

        <div
            v-if="mobileNavOpen"
            class="fixed inset-0 z-30 bg-chrome/50 lg:hidden"
            @click="mobileNavOpen = false"
        ></div>

        <!-- ─── المحتوى ─── -->
        <main class="flex min-w-0 flex-1 flex-col">
            <!-- شريط داكن على الجوال (مع زر القائمة)، وفاتح على الشاشات الكبيرة -->
            <header class="on-chrome flex shrink-0 items-center gap-3 bg-chrome px-4 py-2.5 text-ink-invert lg:hidden">
                <button
                    class="grid size-9 place-items-center rounded-md bg-white/10 text-white"
                    aria-label="القائمة"
                    @click="mobileNavOpen = true"
                >
                    <AppIcon name="grid" :size="18" />
                </button>
                <div class="mr-auto">
                    <ConnectionBanner on="chrome" />
                </div>
            </header>

            <header class="hidden shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-5 py-2.5 lg:flex">
                <span class="text-sm font-extrabold">{{ auth.user?.name }}</span>
                <div class="mr-auto">
                    <ConnectionBanner on="surface" />
                </div>
            </header>

            <div class="min-w-0 flex-1 p-4 lg:p-5">
                <RouterView />
            </div>
        </main>
    </div>
</template>

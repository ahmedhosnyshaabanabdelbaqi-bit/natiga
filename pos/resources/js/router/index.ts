import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
    { path: '/', redirect: '/pos' },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/setup', name: 'setup', component: () => import('@/views/SetupView.vue'), meta: { permission: 'settings.manage' } },

    // The till is a standalone screen with its own chrome.
    { path: '/pos', name: 'pos', component: () => import('@/views/PosView.vue'), meta: { permission: 'pos.use', bare: true } },

    {
        path: '/app',
        component: () => import('@/views/AppShell.vue'),
        children: [
            { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { permission: 'reports.view' } },
            { path: 'sales', name: 'sales', component: () => import('@/views/SalesView.vue') },
            { path: 'sales/:id', name: 'sale-detail', component: () => import('@/views/SaleDetailView.vue'), props: true },
            { path: 'products', name: 'products', component: () => import('@/views/ProductsView.vue'), meta: { permission: 'catalog.view' } },
            { path: 'inventory', name: 'inventory', component: () => import('@/views/InventoryView.vue'), meta: { permission: 'inventory.view' } },
            { path: 'customers', name: 'customers', component: () => import('@/views/CustomersView.vue'), meta: { permission: 'customers.view' } },
            { path: 'purchasing', name: 'purchasing', component: () => import('@/views/PurchasingView.vue'), meta: { permission: 'purchasing.view' } },
            { path: 'shifts', name: 'shifts', component: () => import('@/views/ShiftsView.vue') },
            { path: 'reports', name: 'reports', component: () => import('@/views/ReportsView.vue'), meta: { permission: 'reports.view' } },
            { path: 'sync', name: 'sync', component: () => import('@/views/SyncView.vue'), meta: { permission: 'sales.view_all' } },
            { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { permission: 'settings.view' } },
        ],
    },

    { path: '/:pathMatch(.*)*', redirect: '/pos' },
];

export const router = createRouter({
    history: createWebHistory(),
    routes,
});

router.beforeEach(async (to) => {
    const auth = useAuthStore();

    if (to.meta.public) return true;

    if (!auth.isAuthenticated) {
        const restored = await auth.fetchMe();
        if (!restored) return { name: 'login', query: { redirect: to.fullPath } };
    }

    // A UI-level guard only. Every one of these routes is also gated on the
    // server, which is what actually protects the data.
    const permission = to.meta.permission as string | undefined;
    if (permission && !auth.can(permission)) {
        return { name: 'pos' };
    }

    return true;
});

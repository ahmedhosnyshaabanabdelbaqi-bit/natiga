import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.ts'],
            refresh: true,
        }),
        vue(),
        tailwindcss(),
        /*
         * PWA: the shell is precached so the till screen still loads when the
         * server is unreachable. API calls are NEVER cached — sales must reach
         * the server or go into the IndexedDB queue, never be answered from a
         * stale cache.
         */
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            workbox: {
                globPatterns: ['**/*.{js,css,woff2}'],
                navigateFallbackDenylist: [/^\/api/],
                runtimeCaching: [
                    {
                        urlPattern: /\/api\/v1\/sync\/pull/,
                        handler: 'NetworkFirst',
                        options: { cacheName: 'pos-catalog', networkTimeoutSeconds: 5 },
                    },
                ],
            },
            manifest: {
                name: 'نظام نقاط البيع',
                short_name: 'POS',
                description: 'نظام إدارة المحلات الصغيرة — نقطة البيع',
                dir: 'rtl',
                lang: 'ar',
                display: 'standalone',
                orientation: 'any',
                background_color: '#0f172a',
                theme_color: '#0f172a',
                start_url: '/pos',
                icons: [
                    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                ],
            },
        }),
    ],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'resources/js') },
    },
    server: {
        watch: { ignored: ['**/storage/framework/views/**'] },
    },
});

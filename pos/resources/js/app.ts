import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { router } from '@/router';
import '../css/app.css';

/*
 * الوضع الليلي يُطبَّق قبل إنشاء التطبيق لتفادي وميضة بيضاء عند الإقلاع على
 * شاشة كاشير معتمة.
 */
try {
    const stored = localStorage.getItem('pos.theme');
    if (stored === 'dark' || stored === 'light') {
        document.documentElement.setAttribute('data-theme', stored);
    }
} catch {
    /* التخزين محجوب: يبقى تفضيل النظام */
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

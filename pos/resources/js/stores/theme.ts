import { defineStore } from 'pinia';
import { readStorage, writeStorage } from '@/lib/api';

const KEY = 'pos.theme';
type Theme = 'system' | 'light' | 'dark';

/**
 * الوضع الليلي.
 *
 * الافتراضي يتبع النظام. اختيار المستخدم يُحفظ لكل جهاز — الكاشير الليلي
 * والكاشير النهاري قد يفضّلان وضعين مختلفين على نفس المنشأة.
 */
export const useThemeStore = defineStore('theme', {
    state: () => ({
        theme: (readStorage(KEY) as Theme | null) ?? 'system',
    }),

    getters: {
        isDark(state): boolean {
            if (state.theme === 'dark') return true;
            if (state.theme === 'light') return false;
            return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
        },
    },

    actions: {
        apply() {
            const root = document.documentElement;
            if (this.theme === 'system') root.removeAttribute('data-theme');
            else root.setAttribute('data-theme', this.theme);
        },

        set(theme: Theme) {
            this.theme = theme;
            writeStorage(KEY, theme === 'system' ? null : theme);
            this.apply();
        },

        toggle() {
            this.set(this.isDark ? 'light' : 'dark');
        },
    },
});

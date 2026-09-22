import { defineStore } from 'pinia';
import { http, readStorage, writeStorage, TOKEN_KEY, TERMINAL_KEY, toApiError } from '@/lib/api';
import type { AuthUser } from '@/types';

export const useAuthStore = defineStore('auth', {
    state: () => ({
        user: null as AuthUser | null,
        terminalCode: readStorage(TERMINAL_KEY) ?? '',
        loading: false,
        error: '' as string,
        locked: false,
    }),

    getters: {
        isAuthenticated: (state) => state.user !== null,
        /** Permission checks mirror the server so the UI can hide what the user
         *  cannot do. The SERVER is what actually enforces it. */
        can: (state) => (permission: string) => state.user?.permissions.includes(permission) ?? false,
        feature: (state) => (name: string) => state.user?.features?.[name] ?? false,
    },

    actions: {
        async login(username: string, password: string, terminalCode: string) {
            this.loading = true;
            this.error = '';
            try {
                const { data } = await http.post('/auth/login', {
                    username,
                    password,
                    terminal_code: terminalCode || undefined,
                    device_name: navigator.userAgent.slice(0, 80),
                });
                writeStorage(TOKEN_KEY, data.token);
                if (terminalCode) writeStorage(TERMINAL_KEY, terminalCode);
                this.terminalCode = terminalCode;
                this.user = data.user;
                this.locked = false;
                return true;
            } catch (error) {
                const api = toApiError(error);
                this.error = api.errors?.username?.[0] ?? api.message;
                return false;
            } finally {
                this.loading = false;
            }
        },

        /** Quick return after the till screen was locked. */
        async unlock(username: string, pin: string) {
            this.loading = true;
            this.error = '';
            try {
                const { data } = await http.post('/auth/unlock', {
                    username,
                    pin,
                    terminal_code: this.terminalCode,
                });
                writeStorage(TOKEN_KEY, data.token);
                this.user = data.user;
                this.locked = false;
                return true;
            } catch (error) {
                const api = toApiError(error);
                this.error = api.errors?.pin?.[0] ?? api.message;
                return false;
            } finally {
                this.loading = false;
            }
        },

        async fetchMe() {
            if (!readStorage(TOKEN_KEY)) return false;
            try {
                const { data } = await http.get('/auth/me');
                this.user = data.user;
                return true;
            } catch {
                return false;
            }
        },

        lock() {
            this.locked = true;
        },

        async logout() {
            try {
                await http.post('/auth/logout');
            } catch {
                /* the token is discarded locally either way */
            }
            writeStorage(TOKEN_KEY, null);
            this.user = null;
            this.locked = false;
        },
    },
});

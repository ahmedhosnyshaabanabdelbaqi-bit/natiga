import { defineStore } from 'pinia';
import { http, isNetworkError, readStorage, TOKEN_KEY } from '@/lib/api';
import {
    allOperations, cacheCatalog, catalogMeta, clearSentOperations, enqueue,
    exportPending, pendingOperations, updateOperation, type QueuedOperation,
} from '@/lib/offlineDb';

/**
 * Connectivity and the offline queue.
 *
 * Deliberately distinguishes:
 *   online   - the SERVER answers (the shop's own server counts, even with no
 *              internet: selling must not stop because the ADSL is down)
 *   degraded - the server is unreachable; queue locally under policy
 *   offline  - the browser itself reports no network
 */
export const useConnectionStore = defineStore('connection', {
    state: () => ({
        serverReachable: true,
        browserOnline: navigator.onLine,
        lastSyncAt: null as string | null,
        pendingCount: 0,
        conflictCount: 0,
        syncing: false,
        catalogCachedAt: null as string | null,
        storageError: '' as string,
    }),

    getters: {
        status(state): 'online' | 'degraded' | 'offline' {
            if (state.serverReachable) return 'online';
            return state.browserOnline ? 'degraded' : 'offline';
        },
        statusLabel(): string {
            return {
                online: 'متصل بالخادم',
                degraded: 'الخادم غير متاح — وضع محدود',
                offline: 'لا يوجد اتصال — وضع محدود',
            }[this.status];
        },
    },

    actions: {
        listen() {
            window.addEventListener('online', () => {
                this.browserOnline = true;
                void this.check();
            });
            window.addEventListener('offline', () => {
                this.browserOnline = false;
            });
            // A light heartbeat so the banner reflects reality without spamming.
            window.setInterval(() => void this.check(), 20000);
        },

        async check() {
            // Polling before sign-in only produces a pointless 401.
            if (!readStorage(TOKEN_KEY)) return;

            try {
                const { data } = await http.get('/sync/status', { timeout: 6000 });
                this.serverReachable = true;
                this.pendingCount = data.pending_operations ?? 0;
                this.conflictCount = data.conflicts ?? 0;
                this.lastSyncAt = data.last_push_at ?? this.lastSyncAt;
                if (this.pendingCount === 0) await this.flush();
            } catch (error) {
                if (isNetworkError(error)) this.serverReachable = false;
            }
            await this.refreshLocalCounts();
        },

        async refreshLocalCounts() {
            const all = await allOperations();
            this.pendingCount = all.filter((o) => o.status === 'pending').length;
            this.conflictCount = all.filter((o) => o.status === 'conflict' || o.status === 'rejected').length;
            const meta = await catalogMeta();
            this.catalogCachedAt = meta?.cached_at ?? null;
        },

        async queue(operation: QueuedOperation) {
            try {
                await enqueue(operation);
                this.storageError = '';
            } catch (error) {
                this.storageError = (error as Error).message;
                throw error;
            }
            await this.refreshLocalCounts();
        },

        /** Push everything queued. Re-sending a uuid is safe by design. */
        async flush() {
            if (this.syncing) return;
            const operations = await pendingOperations();
            if (operations.length === 0) return;

            this.syncing = true;
            try {
                const { data } = await http.post('/sync/push', {
                    operations: operations.map((o) => ({
                        uuid: o.uuid,
                        type: o.type,
                        payload: o.payload,
                        client_created_at: o.client_created_at,
                    })),
                });

                for (const result of data.results ?? []) {
                    if (result.status === 'applied' || result.status === 'duplicate') {
                        await updateOperation(result.uuid, { status: 'sent' });
                    } else {
                        // Parked for a manager. The record and its amount stay.
                        await updateOperation(result.uuid, {
                            status: result.status === 'conflict' ? 'conflict' : 'rejected',
                            conflicts: result.conflicts,
                        });
                    }
                }

                this.lastSyncAt = new Date().toISOString();
                await clearSentOperations();
                this.serverReachable = true;
            } catch (error) {
                if (isNetworkError(error)) this.serverReachable = false;
            } finally {
                this.syncing = false;
                await this.refreshLocalCounts();
            }
        },

        /** Refresh the local catalogue used in degraded mode. */
        async pullCatalog() {
            try {
                const { data } = await http.get('/sync/pull');
                await cacheCatalog(data.products ?? [], data.barcodes ?? [], data.catalog_version);
                await this.refreshLocalCounts();
                this.serverReachable = true;
                return true;
            } catch (error) {
                if (isNetworkError(error)) this.serverReachable = false;
                return false;
            }
        },

        async exportQueue() {
            const blob = await exportPending();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `pos-pending-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`;
            link.click();
            URL.revokeObjectURL(url);
        },
    },
});

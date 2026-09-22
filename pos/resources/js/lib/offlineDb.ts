import { openDB, type IDBPDatabase } from 'idb';
import type { CartLine, CartPayment } from '@/types';

/**
 * Local storage for degraded mode.
 *
 * IndexedDB, not localStorage, and explicitly NOT a backup: browser storage can
 * be cleared by the user, by private mode, or by the OS reclaiming space. It is
 * a short-lived queue, and the app says so and offers an export.
 */

export interface QueuedOperation {
    uuid: string;
    type: 'sale';
    payload: Record<string, unknown>;
    client_created_at: string;
    status: 'pending' | 'sent' | 'conflict' | 'rejected';
    attempts: number;
    last_error?: string | null;
    conflicts?: unknown;
    /** What the customer actually handed over. Never altered by a sync. */
    collected_amount?: string;
}

export interface CartDraft {
    id: string;
    lines: CartLine[];
    payments: CartPayment[];
    customer_id: number | null;
    invoice_discount_type: 'amount' | 'percent' | null;
    invoice_discount_value: string;
    updated_at: string;
}

export interface CachedProduct {
    variant_id: number;
    product_id: number;
    product_unit_id: number;
    sku: string;
    name: string;
    variant_name: string | null;
    type: string;
    allow_fractional_qty: boolean;
    unit_price: string | null;
}

export interface CachedBarcode {
    code: string;
    variant_id: number;
    product_unit_id: number | null;
    type: string;
}

const DB_NAME = 'pos-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function db(): Promise<IDBPDatabase> {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(database) {
                if (!database.objectStoreNames.contains('operations')) {
                    const store = database.createObjectStore('operations', { keyPath: 'uuid' });
                    store.createIndex('status', 'status');
                }
                if (!database.objectStoreNames.contains('drafts')) {
                    database.createObjectStore('drafts', { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains('products')) {
                    database.createObjectStore('products', { keyPath: 'variant_id' });
                }
                if (!database.objectStoreNames.contains('barcodes')) {
                    database.createObjectStore('barcodes', { keyPath: 'code' });
                }
                if (!database.objectStoreNames.contains('meta')) {
                    database.createObjectStore('meta', { keyPath: 'key' });
                }
            },
        });
    }
    return dbPromise;
}

/** Storage can be full or blocked; the caller must be told, not surprised. */
export class OfflineStorageError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
    }
}

export async function enqueue(operation: QueuedOperation): Promise<void> {
    try {
        const database = await db();
        await database.put('operations', operation);
    } catch (error) {
        throw new OfflineStorageError(
            'تعذر حفظ العملية محليًا (قد تكون مساحة التخزين ممتلئة). لا تغلق الشاشة قبل تصدير العمليات المعلقة.',
            error,
        );
    }
}

export async function pendingOperations(): Promise<QueuedOperation[]> {
    const database = await db();
    const all = (await database.getAll('operations')) as QueuedOperation[];
    return all.filter((o) => o.status === 'pending');
}

export async function allOperations(): Promise<QueuedOperation[]> {
    const database = await db();
    return (await database.getAll('operations')) as QueuedOperation[];
}

export async function updateOperation(uuid: string, patch: Partial<QueuedOperation>): Promise<void> {
    const database = await db();
    const existing = (await database.get('operations', uuid)) as QueuedOperation | undefined;
    if (!existing) return;
    await database.put('operations', { ...existing, ...patch });
}

export async function clearSentOperations(): Promise<number> {
    const database = await db();
    const all = (await database.getAll('operations')) as QueuedOperation[];
    const sent = all.filter((o) => o.status === 'sent');
    const tx = database.transaction('operations', 'readwrite');
    await Promise.all(sent.map((o) => tx.store.delete(o.uuid)));
    await tx.done;
    return sent.length;
}

// ---- cart drafts: survive a reload or an accidental close ------------------

export async function saveDraft(draft: CartDraft): Promise<void> {
    try {
        const database = await db();
        await database.put('drafts', draft);
    } catch {
        /* a lost draft is an inconvenience, never a lost sale */
    }
}

export async function loadDraft(id: string): Promise<CartDraft | undefined> {
    try {
        const database = await db();
        return (await database.get('drafts', id)) as CartDraft | undefined;
    } catch {
        return undefined;
    }
}

export async function clearDraft(id: string): Promise<void> {
    try {
        const database = await db();
        await database.delete('drafts', id);
    } catch {
        /* ignore */
    }
}

// ---- catalogue cache for degraded mode ------------------------------------

export async function cacheCatalog(products: CachedProduct[], barcodes: CachedBarcode[], version: string): Promise<void> {
    const database = await db();
    const tx = database.transaction(['products', 'barcodes', 'meta'], 'readwrite');
    await Promise.all([
        ...products.map((p) => tx.objectStore('products').put(p)),
        ...barcodes.map((b) => tx.objectStore('barcodes').put(b)),
        tx.objectStore('meta').put({ key: 'catalog_version', value: version, cached_at: new Date().toISOString() }),
    ]);
    await tx.done;
}

export async function findCachedBarcode(code: string): Promise<{ product: CachedProduct; barcode: CachedBarcode } | null> {
    const database = await db();
    const barcode = (await database.get('barcodes', code)) as CachedBarcode | undefined;
    if (!barcode) return null;
    const product = (await database.get('products', barcode.variant_id)) as CachedProduct | undefined;
    if (!product) return null;
    return { product, barcode };
}

export async function catalogMeta(): Promise<{ value: string; cached_at: string } | undefined> {
    const database = await db();
    return (await database.get('meta', 'catalog_version')) as { value: string; cached_at: string } | undefined;
}

/** Export pending work as a file the shop can hand to support. */
export async function exportPending(): Promise<Blob> {
    const operations = await allOperations();
    return new Blob([JSON.stringify({ exported_at: new Date().toISOString(), operations }, null, 2)], {
        type: 'application/json',
    });
}

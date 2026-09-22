import { usePage } from '@inertiajs/react';
import type { Auth } from '@/types/auth';

/**
 * UI-only permission helpers. The server always enforces authorization.
 */
export function useAuth(): Auth {
    return usePage().props.auth;
}

export function can(permission: string | string[], auth?: Auth): boolean {
    const current = auth ?? readAuth();
    if (!current?.user) {
        return false;
    }
    const list = Array.isArray(permission) ? permission : [permission];
    return list.some((p) => current.permissions.includes(p));
}

export function canAll(permissions: string[], auth?: Auth): boolean {
    const current = auth ?? readAuth();
    if (!current?.user) {
        return false;
    }
    return permissions.every((p) => current.permissions.includes(p));
}

export function hasRole(role: string | string[], auth?: Auth): boolean {
    const current = auth ?? readAuth();
    if (!current?.user) {
        return false;
    }
    const list = Array.isArray(role) ? role : [role];
    return list.some((r) => current.roles.includes(r));
}

export function useCan(): (permission: string | string[]) => boolean {
    const auth = useAuth();
    return (permission) => can(permission, auth);
}

function readAuth(): Auth | null {
    try {
        return usePage().props.auth;
    } catch {
        return null;
    }
}

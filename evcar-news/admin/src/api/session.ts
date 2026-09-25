import type { AuthUser } from './types';

export type SessionEvent =
  { type: 'refreshed'; user: AuthUser } | { type: 'expired' } | { type: 'logged-out' };

type Listener = (event: SessionEvent) => void;
const listeners = new Set<Listener>();

export function onSessionEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitSessionEvent(event: SessionEvent): void {
  for (const listener of [...listeners]) listener(event);
}

export type DiffKind = 'added' | 'removed' | 'changed';

export interface DiffEntry {
  /** Dotted path, array indexes in brackets: `specs[2].value`. */
  path: string;
  kind: DiffKind;
  before?: unknown;
  after?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function join(base: string, key: string | number): string {
  if (typeof key === 'number') return `${base}[${key}]`;
  return base ? `${base}.${key}` : key;
}

function equalLeaf(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  // Compare non-plain structures (dates serialized as strings, etc.) by JSON.
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Structural diff between two JSON values (audit `before` / `after`).
 * Objects are compared key by key, arrays index by index; anything deeper
 * than `maxDepth` is compared as a whole.
 */
export function computeDiff(before: unknown, after: unknown, maxDepth = 8): DiffEntry[] {
  const out: DiffEntry[] = [];

  const walk = (a: unknown, b: unknown, path: string, depth: number) => {
    if (a === undefined && b === undefined) return;
    if (a === undefined) {
      out.push({ path: path || '(root)', kind: 'added', after: b });
      return;
    }
    if (b === undefined) {
      out.push({ path: path || '(root)', kind: 'removed', before: a });
      return;
    }
    if (depth < maxDepth && isPlainObject(a) && isPlainObject(b)) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
      for (const key of keys) walk(a[key], b[key], join(path, key), depth + 1);
      return;
    }
    if (depth < maxDepth && Array.isArray(a) && Array.isArray(b)) {
      const len = Math.max(a.length, b.length);
      for (let i = 0; i < len; i += 1) walk(a[i], b[i], join(path, i), depth + 1);
      return;
    }
    if (!equalLeaf(a, b))
      out.push({ path: path || '(root)', kind: 'changed', before: a, after: b });
  };

  walk(before ?? undefined, after ?? undefined, '', 0);
  return out;
}

/** Compact one-line rendering of a JSON value for diff tables. */
export function previewValue(value: unknown, max = 200): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  const text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Helpers that make arbitrary values safe and bounded for audit_logs JSON
 * columns: secrets are redacted, dates/bigints/decimals become strings and
 * oversized payloads are replaced by a marker.
 */

const SECRET_KEY =
  /(pass(word)?|secret|token|hash|api[-_]?key|authorization|cookie|private[-_]?key|credential)/i;

export const REDACTED = '[REDACTED]';
export const MAX_AUDIT_JSON_BYTES = 32 * 1024;
const MAX_DEPTH = 8;

function sanitize(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== 'object') return null; // functions, symbols
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (Buffer.isBuffer(value)) return `[binary ${value.length} bytes]`;
  // Prisma.Decimal and similar value objects
  const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
  if (ctor === 'Decimal') return (value as { toString(): string }).toString();
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[key] = SECRET_KEY.test(key) ? REDACTED : sanitize(v, depth + 1);
  }
  return out;
}

/**
 * JSON-safe, secret-free copy of `value` (undefined stays undefined).
 * Payloads above MAX_AUDIT_JSON_BYTES are replaced by `{ truncated, bytes }`.
 */
export function toAuditJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  const clean = sanitize(value, 0);
  const bytes = Buffer.byteLength(JSON.stringify(clean) ?? 'null', 'utf8');
  if (bytes > MAX_AUDIT_JSON_BYTES) return { truncated: true, bytes };
  return clean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Shallow field diff `{ field: { from, to } }` between two (sanitized)
 * objects; undefined when either side is missing or nothing changed.
 */
export function computeAuditDiff(
  before: unknown,
  after: unknown,
): Record<string, { from: unknown; to: unknown }> | undefined {
  if (!isPlainObject(before) || !isPlainObject(after)) return undefined;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) diff[key] = { from, to };
  }
  return Object.keys(diff).length > 0 ? diff : undefined;
}

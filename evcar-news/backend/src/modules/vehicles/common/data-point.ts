/**
 * Source / reliability / verification of a catalog data point (contract §3:
 * every important value carries sourceId, verifiedAt, reliability).
 *
 * Rules (shared by specs, ranges, consumption, charging data, inlets,
 * market availability and prices):
 *  - Marking a value verified (reliability "verified" or a verifiedAt date)
 *    needs the `specs.verify` permission — unless the verification state is
 *    left exactly as it was and the value did not change.
 *  - "verified" needs a source; verifiedAt defaults to now and cannot be in
 *    the future.
 *  - Changing the value (or the source) of a verified data point without
 *    re-verifying it resets it to "unverified" with no verifiedAt: a
 *    verification never silently covers a value nobody checked.
 */
import { Reliability } from '../../../generated/prisma/enums';
import { CatalogErrors, fieldError, Msg } from './catalog-errors';
import { VERIFY_PERMISSION } from './catalog-constants';

export interface DataPointInput {
  sourceId?: string | null;
  /** A Reliability value (validated by the DTO). */
  reliability?: string;
  verifiedAt?: string | null;
}

export interface DataPointState {
  sourceId: string | null;
  reliability: Reliability;
  verifiedAt: Date | null;
}

/** The caller of an admin write (permissions decide verification / publishing). */
export interface Actor {
  id: string | null;
  permissions: ReadonlySet<string>;
}

export function actorOf(user: { id: string; permissions: string[] } | undefined): Actor {
  return { id: user?.id ?? null, permissions: new Set(user?.permissions ?? []) };
}

export const SYSTEM_ACTOR: Actor = { id: null, permissions: new Set(['*']) };

export function can(actor: Actor, permission: string): boolean {
  return actor.permissions.has('*') || actor.permissions.has(permission);
}

export function isVerifiedState(s: Pick<DataPointState, 'reliability' | 'verifiedAt'>): boolean {
  return s.reliability === Reliability.verified || s.verifiedAt !== null;
}

const CLOCK_SKEW_MS = 5 * 60_000;

export interface ResolveOptions {
  /** True when the value itself changed on update (ignored on create). */
  valueChanged: boolean;
  actor: Actor;
  /** Prefix for field names in validation errors (e.g. "items.3."). */
  fieldPrefix?: string;
  now?: Date;
}

/** Computes the stored verification fields of a create (existing = null) or update. */
export function resolveDataPoint(
  input: DataPointInput,
  existing: DataPointState | null,
  opts: ResolveOptions,
): DataPointState {
  const now = opts.now ?? new Date();
  const prefix = opts.fieldPrefix ?? '';
  const next: DataPointState = {
    sourceId: input.sourceId !== undefined ? input.sourceId : (existing?.sourceId ?? null),
    reliability:
      (input.reliability as Reliability | undefined) ??
      existing?.reliability ??
      Reliability.unverified,
    verifiedAt:
      input.verifiedAt !== undefined
        ? input.verifiedAt === null
          ? null
          : new Date(input.verifiedAt)
        : (existing?.verifiedAt ?? null),
  };
  const touched = input.reliability !== undefined || input.verifiedAt !== undefined;
  const sourceChanged = existing !== null && next.sourceId !== existing.sourceId;
  const changed = existing !== null && (opts.valueChanged || sourceChanged);

  if (existing && changed && !touched && isVerifiedState(existing)) {
    next.reliability =
      existing.reliability === Reliability.verified ? Reliability.unverified : existing.reliability;
    next.verifiedAt = null;
  }
  if (next.reliability === Reliability.verified && next.verifiedAt === null) {
    next.verifiedAt = now;
  }
  if (next.verifiedAt && next.verifiedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    throw fieldError(`${prefix}verifiedAt`, 'notFuture', Msg.futureDate);
  }
  if (isVerifiedState(next) && !next.sourceId) {
    throw fieldError(`${prefix}sourceId`, 'verifiedNeedsSource', Msg.verifiedNeedsSource);
  }
  if (isVerifiedState(next) && !can(opts.actor, VERIFY_PERMISSION)) {
    const unchanged =
      existing !== null &&
      !changed &&
      existing.reliability === next.reliability &&
      (existing.verifiedAt?.getTime() ?? null) === (next.verifiedAt?.getTime() ?? null);
    if (!unchanged) throw CatalogErrors.verifyPermission();
  }
  return next;
}

import { AppException } from '../../../common/errors/app.exception';
import { resolveDataPoint, type Actor, type DataPointState } from './data-point';

const verifier: Actor = { id: 'v', permissions: new Set(['vehicles.write', 'specs.verify']) };
const writer: Actor = { id: 'w', permissions: new Set(['vehicles.write']) };
const NOW = new Date('2026-09-25T10:00:00Z');

function errorOf(fn: () => unknown): AppException {
  try {
    fn();
  } catch (e) {
    return e as AppException;
  }
  throw new Error('expected an error');
}

describe('resolveDataPoint', () => {
  const verified: DataPointState = {
    sourceId: 's1',
    reliability: 'verified',
    verifiedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('defaults to unverified without a source', () => {
    expect(resolveDataPoint({}, null, { valueChanged: true, actor: writer, now: NOW })).toEqual({
      sourceId: null,
      reliability: 'unverified',
      verifiedAt: null,
    });
  });

  it('verification needs specs.verify and a source; verifiedAt defaults to now', () => {
    expect(
      errorOf(() =>
        resolveDataPoint({ sourceId: 's1', reliability: 'verified' }, null, {
          valueChanged: true,
          actor: writer,
          now: NOW,
        }),
      ).code,
    ).toBe('VERIFY_PERMISSION_REQUIRED');
    const noSource = errorOf(() =>
      resolveDataPoint({ reliability: 'verified' }, null, {
        valueChanged: true,
        actor: verifier,
        now: NOW,
      }),
    );
    expect(noSource.getStatus()).toBe(422);
    expect(
      resolveDataPoint({ sourceId: 's1', reliability: 'verified' }, null, {
        valueChanged: true,
        actor: verifier,
        now: NOW,
      }),
    ).toEqual({ sourceId: 's1', reliability: 'verified', verifiedAt: NOW });
    // A verification date alone also needs the permission.
    expect(
      errorOf(() =>
        resolveDataPoint({ sourceId: 's1', verifiedAt: '2026-01-01T00:00:00Z' }, null, {
          valueChanged: true,
          actor: writer,
          now: NOW,
        }),
      ).code,
    ).toBe('VERIFY_PERMISSION_REQUIRED');
  });

  it('refuses verification dates in the future', () => {
    const e = errorOf(() =>
      resolveDataPoint({ sourceId: 's1', verifiedAt: '2030-01-01T00:00:00Z' }, null, {
        valueChanged: true,
        actor: verifier,
        now: NOW,
      }),
    );
    expect(e.getStatus()).toBe(422);
  });

  it('keeps a verification when nothing changed (no permission needed)', () => {
    expect(
      resolveDataPoint({}, verified, { valueChanged: false, actor: writer, now: NOW }),
    ).toEqual(verified);
    expect(
      resolveDataPoint(
        { reliability: 'verified', verifiedAt: '2026-01-01T00:00:00.000Z', sourceId: 's1' },
        verified,
        { valueChanged: false, actor: writer, now: NOW },
      ),
    ).toEqual(verified);
  });

  it('resets a verified value that changes without re-verification', () => {
    expect(resolveDataPoint({}, verified, { valueChanged: true, actor: writer, now: NOW })).toEqual(
      {
        sourceId: 's1',
        reliability: 'unverified',
        verifiedAt: null,
      },
    );
    // A new source counts as a change too.
    expect(
      resolveDataPoint({ sourceId: 's2' }, verified, {
        valueChanged: false,
        actor: writer,
        now: NOW,
      }),
    ).toMatchObject({
      sourceId: 's2',
      reliability: 'unverified',
      verifiedAt: null,
    });
    // Re-sending "verified" with a new value needs the permission.
    expect(
      errorOf(() =>
        resolveDataPoint({ reliability: 'verified' }, verified, {
          valueChanged: true,
          actor: writer,
          now: NOW,
        }),
      ).code,
    ).toBe('VERIFY_PERMISSION_REQUIRED');
  });

  it('manufacturer claims and disputes do not need specs.verify', () => {
    expect(
      resolveDataPoint({ reliability: 'disputed' }, null, {
        valueChanged: true,
        actor: writer,
        now: NOW,
      }),
    ).toMatchObject({ reliability: 'disputed', verifiedAt: null });
  });
});

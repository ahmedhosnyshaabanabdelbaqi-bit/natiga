import { Prisma } from '../../generated/prisma/client';
import { fromPostgresCode } from './all-exceptions.filter';

function dbError(originalCode: string, originalMessage: string) {
  return new Prisma.PrismaClientKnownRequestError(`Database error. Code: ${originalCode}`, {
    code: 'P2010',
    clientVersion: 'test',
    meta: {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: { originalCode, originalMessage, kind: 'postgres', code: originalCode },
      },
    },
  });
}

describe('fromPostgresCode (database rules → client errors, never 500)', () => {
  it('NUL bytes / invalid UTF-8 → 422', () => {
    expect(
      fromPostgresCode(dbError('22021', 'invalid byte sequence for encoding "UTF8": 0x00')),
    ).toEqual({
      status: 422,
      code: 'VALIDATION_FAILED',
      details: { reason: 'invalid_characters' },
    });
  });

  it('CHECK / trigger rule → 422 with the rule name', () => {
    expect(
      fromPostgresCode(
        dbError(
          '23514',
          'price_history_local_currency_chk: official_msrp prices in market EG must be in EGP',
        ),
      ),
    ).toEqual({
      status: 422,
      code: 'VALIDATION_FAILED',
      details: { reason: 'constraint_violation', constraint: 'price_history_local_currency_chk' },
    });
    expect(
      fromPostgresCode(
        dbError(
          '23514',
          'new row for relation "connectors" violates check constraint "connectors_quantity_chk"',
        ),
      ),
    ).toMatchObject({ details: { constraint: 'connectors_quantity_chk' } });
  });

  it('exclusion constraint (overlapping official price periods) → 409', () => {
    expect(
      fromPostgresCode(
        dbError(
          '23P01',
          'conflicting key value violates exclusion constraint "price_history_official_no_overlap"',
        ),
      ),
    ).toEqual({
      status: 409,
      code: 'CONFLICT',
      details: { reason: 'overlapping_period', constraint: 'price_history_official_no_overlap' },
    });
  });

  it('anything else stays unexpected', () => {
    expect(fromPostgresCode(dbError('XX000', 'internal error'))).toBeUndefined();
  });
});

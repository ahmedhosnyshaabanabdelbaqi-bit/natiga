import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorFromBody, getFieldErrors } from './errors';

const validation = (details: unknown) =>
  new ApiError({ status: 422, code: 'VALIDATION_FAILED', message: 'invalid', details });

describe('getFieldErrors', () => {
  it('reads the backend shape [{ field, constraints }]', () => {
    expect(
      getFieldErrors(
        validation([
          { field: 'value.appName', constraints: { isNotEmpty: 'appName should not be empty' } },
          {
            field: 'items.0.name',
            constraints: { maxLength: 'too long', isString: 'not a string' },
          },
        ]),
      ),
    ).toEqual({ 'value.appName': 'appName should not be empty', 'items.0.name': 'too long' });
  });

  it('reads { fields: { name: [...] } } and { errors: [...] } shapes', () => {
    expect(getFieldErrors(validation({ fields: { email: ['taken'] } }))).toEqual({
      email: 'taken',
    });
    expect(getFieldErrors(validation({ errors: [{ property: 'code', message: 'bad' }] }))).toEqual({
      code: 'bad',
    });
  });

  it('ignores non-validation errors', () => {
    expect(getFieldErrors(new ApiError({ status: 403, code: 'FORBIDDEN', message: 'no' }))).toEqual(
      {},
    );
    expect(getFieldErrors(new Error('x'))).toEqual({});
  });
});

describe('apiErrorFromBody', () => {
  it('uses the x-request-id header when the body has none', () => {
    const e = apiErrorFromBody(
      500,
      { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
      'hdr-1',
    );
    expect(e.requestId).toBe('hdr-1');
    expect(e.code).toBe('INTERNAL_ERROR');
  });
});

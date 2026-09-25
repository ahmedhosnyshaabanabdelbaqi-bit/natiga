import { redactUrl } from './logging';

describe('redactUrl', () => {
  it('redacts sensitive query params only', () => {
    expect(redactUrl('/api/v1/auth/verify?token=abc&lang=ar')).toBe(
      '/api/v1/auth/verify?token=%5BREDACTED%5D&lang=ar',
    );
    expect(redactUrl('/x?api_key=1')).toContain('REDACTED');
    expect(redactUrl('/x?page=2')).toBe('/x?page=2');
    expect(redactUrl('/x')).toBe('/x');
  });
});

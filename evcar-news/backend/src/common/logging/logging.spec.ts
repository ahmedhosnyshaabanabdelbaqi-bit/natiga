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

describe('redactUrl (review 3: location + preview tokens)', () => {
  it('rounds device coordinates to 2 decimals (≈ 1 km)', () => {
    expect(redactUrl('/api/v1/stations?lat=30.0444&lng=31.2357&radiusKm=25&sort=distance')).toBe(
      '/api/v1/stations?lat=30.04&lng=31.24&radiusKm=25&sort=distance',
    );
    expect(redactUrl('/api/v1/stations/abc?lat=-33.86882&lng=151.20929')).toBe(
      '/api/v1/stations/abc?lat=-33.87&lng=151.21',
    );
    const bbox = redactUrl('/api/v1/stations?bbox=31.1234,29.9876,31.5555,30.1111');
    expect(decodeURIComponent(bbox!)).toBe('/api/v1/stations?bbox=31.12,29.99,31.56,30.11');
    expect(redactUrl('/api/v1/home?userLat=30.04441&userLng=31.23571')).toBe(
      '/api/v1/home?userLat=30.04&userLng=31.24',
    );
  });

  it('never logs an article preview token', () => {
    expect(redactUrl('/api/v1/articles/preview/v1.eyJhIjoieCJ9.SIGNATURE')).toBe(
      '/api/v1/articles/preview/[REDACTED]',
    );
    expect(redactUrl('/api/v1/articles/preview/v1.eyJhIjoieCJ9.SIG?lang=ar')).toBe(
      '/api/v1/articles/preview/[REDACTED]?lang=ar',
    );
    expect(redactUrl('/api/v1/articles/some-slug?lang=ar')).toBe(
      '/api/v1/articles/some-slug?lang=ar',
    );
  });
});

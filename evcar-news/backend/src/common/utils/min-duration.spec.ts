import { withMinimumDuration } from './min-duration';

describe('withMinimumDuration', () => {
  it('pads fast successes and failures to the floor', async () => {
    let t = performance.now();
    await expect(withMinimumDuration(80, () => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(performance.now() - t).toBeGreaterThanOrEqual(78);

    t = performance.now();
    await expect(withMinimumDuration(80, () => Promise.reject(new Error('x')))).rejects.toThrow(
      'x',
    );
    expect(performance.now() - t).toBeGreaterThanOrEqual(78);
  });

  it('does not add time to work that is already slower, and 0 disables it', async () => {
    const slow = () => new Promise<number>((r) => setTimeout(() => r(1), 60));
    let t = performance.now();
    await withMinimumDuration(20, slow);
    expect(performance.now() - t).toBeLessThan(200);

    t = performance.now();
    await withMinimumDuration(0, () => Promise.resolve(1));
    expect(performance.now() - t).toBeLessThan(20);
  });
});

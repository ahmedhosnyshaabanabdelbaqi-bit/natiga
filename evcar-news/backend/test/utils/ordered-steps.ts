/**
 * Ordered workflow steps inside one Jest test (review 3).
 *
 * Some e2e blocks are workflows by nature (create → list → report → delete,
 * draft → review → publish): each step needs the state the previous one
 * left. As separate `it()`s they broke under `jest --randomize`. Such blocks
 * register their steps with `step(name, fn)` and run them in order with one
 * `it(..., run, run.timeout)`; a failure names the step:
 *
 *   const { step, run } = orderedSteps();
 *   step('creates a draft', async () => { … });
 *   step('publishes it', async () => { … });
 *   it('workflow: steps above in order', () => run(), run.timeout);
 *
 * Tests that do not depend on each other stay separate `it()`s.
 */
export function orderedSteps(defaultStepTimeoutMs = 60_000) {
  const steps: { name: string; fn: () => unknown; timeout: number }[] = [];
  const run = async (): Promise<void> => {
    for (const s of steps) {
      try {
        await s.fn();
      } catch (err) {
        if (err instanceof Error) err.message = `[step: ${s.name}]\n${err.message}`;
        throw err;
      }
    }
  };
  return {
    step(name: string, fn: () => unknown, timeout = defaultStepTimeoutMs): void {
      steps.push({ name, fn, timeout });
    },
    run: Object.assign(run, {
      /** Sum of the step timeouts (read when `it()` is registered, after the steps). */
      get timeout(): number {
        return steps.reduce((sum, s) => sum + s.timeout, 0) || defaultStepTimeoutMs;
      },
    }),
  };
}

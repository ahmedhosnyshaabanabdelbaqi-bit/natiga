import '@testing-library/jest-dom/vitest';
import { notifications } from '@mantine/notifications';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import i18n from '@/app/i18n';
import { __resetClientStateForTests } from '@/api/client';

// findBy*/waitFor default to 1 s. The first render of a lazily loaded route
// has to transform and import the page module, which takes longer on a busy
// machine (e.g. while backend e2e tests run in parallel) → flaky failures.
configure({ asyncUtilTimeout: 10_000 });

// jsdom lacks these browser APIs used by Mantine.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!('ResizeObserver' in window)) {
  (window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}
if (!('fonts' in document)) {
  // Used by Mantine's autosize Textarea.
  Object.defineProperty(document, 'fonts', {
    value: {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      ready: Promise.resolve(),
    },
  });
}
// ProseMirror (TipTap) measures ranges for scrolling/selection.
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
if (!Range.prototype.getClientRects) Range.prototype.getClientRects = emptyRects;
if (!Range.prototype.getBoundingClientRect)
  Range.prototype.getBoundingClientRect = () => new DOMRect();
if (!document.elementFromPoint) document.elementFromPoint = () => null;
if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => undefined;

beforeEach(async () => {
  __resetClientStateForTests();
  localStorage.clear();
  await i18n.changeLanguage('en');
});

afterEach(() => {
  cleanup();
  notifications.clean();
});

import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router';
import { getFieldErrors } from '@/api/errors';

/**
 * Copies 422 VALIDATION_FAILED field errors from the API onto a @mantine/form
 * instance. `prefix` maps nested forms (e.g. "branding."). Returns true when at
 * least one field error was applied.
 */
export function applyServerErrors(
  form: { setFieldError: (path: string, error: ReactNode) => void },
  error: unknown,
  prefix = '',
): boolean {
  const fields = getFieldErrors(error);
  const entries = Object.entries(fields);
  for (const [field, message] of entries) {
    const path = prefix && field.startsWith(prefix) ? field.slice(prefix.length) : field;
    form.setFieldError(path, message);
  }
  return entries.length > 0;
}

/** Warns before leaving the page (in-app navigation or tab close) with unsaved edits. */
export function useUnsavedChangesGuard(dirty: boolean) {
  const { t } = useTranslation('common');
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(t('form.unsavedChanges'))) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

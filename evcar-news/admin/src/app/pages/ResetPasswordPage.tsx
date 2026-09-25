import { Alert, Anchor, Button, PasswordInput, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { authApi } from '@/api/auth';
import { describeError } from '@/api/describeError';
import { getFieldErrors, isApiError } from '@/api/errors';
import { AuthLayout } from '@/app/auth/AuthLayout';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Handles both "reset password" links and the first-owner "set up password"
 * link printed by `npm run create-owner` (same endpoint, POST /auth/reset-password).
 */
export default function ResetPasswordPage({ mode = 'reset' }: { mode?: 'reset' | 'setup' }) {
  const { t } = useTranslation(['auth', 'common']);
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() ?? '';
  const effectiveMode = params.get('mode') === 'setup' ? 'setup' : mode;
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({
    initialValues: { password: '', confirm: '' },
    validate: {
      password: (v) =>
        v.length >= MIN_PASSWORD_LENGTH
          ? null
          : t('auth:validation.passwordMin', { min: MIN_PASSWORD_LENGTH }),
      confirm: (v, values) =>
        v === values.password ? null : t('auth:validation.passwordMismatch'),
    },
  });

  const title = t(effectiveMode === 'setup' ? 'auth:setup.title' : 'auth:reset.title');

  if (!token) {
    return (
      <AuthLayout title={title}>
        <Stack>
          <Alert color="red" icon={<IconAlertCircle aria-hidden />} role="alert">
            {t('auth:reset.missingToken')}
          </Alert>
          <Anchor component={Link} to="/forgot-password" size="sm">
            {t('auth:reset.requestNew')}
          </Anchor>
        </Stack>
      </AuthLayout>
    );
  }

  const onSubmit = form.onSubmit(async ({ password }) => {
    setError(null);
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (e) {
      const fields = getFieldErrors(e);
      if (fields.password) form.setFieldError('password', fields.password);
      setError(e);
    } finally {
      setSubmitting(false);
    }
  });

  const tokenRejected =
    isApiError(error) &&
    !error.isValidation &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429;

  return (
    <AuthLayout title={title}>
      {done ? (
        <Stack>
          <Alert color="teal" icon={<IconCircleCheck aria-hidden />} role="status">
            {t(effectiveMode === 'setup' ? 'auth:setup.done' : 'auth:reset.done')}
          </Alert>
          <Anchor component={Link} to="/login" size="sm">
            {t('auth:backToLogin')}
          </Anchor>
        </Stack>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <Stack>
            <Text size="sm" c="dimmed">
              {t(effectiveMode === 'setup' ? 'auth:setup.intro' : 'auth:reset.intro')}
            </Text>
            {error ? (
              <Alert color="red" icon={<IconAlertCircle aria-hidden />} role="alert">
                <Stack gap={4}>
                  <span>
                    {tokenRejected ? t('auth:reset.invalidToken') : describeError(error, t).message}
                  </span>
                  {tokenRejected ? (
                    <Anchor component={Link} to="/forgot-password" size="sm">
                      {t('auth:reset.requestNew')}
                    </Anchor>
                  ) : null}
                </Stack>
              </Alert>
            ) : null}
            <PasswordInput
              label={t('auth:fields.newPassword')}
              description={t('auth:validation.passwordMin', { min: MIN_PASSWORD_LENGTH })}
              autoComplete="new-password"
              required
              {...form.getInputProps('password')}
            />
            <PasswordInput
              label={t('auth:fields.confirmPassword')}
              autoComplete="new-password"
              required
              {...form.getInputProps('confirm')}
            />
            <Button type="submit" loading={submitting}>
              {t(effectiveMode === 'setup' ? 'auth:setup.submit' : 'auth:reset.submit')}
            </Button>
          </Stack>
        </form>
      )}
    </AuthLayout>
  );
}

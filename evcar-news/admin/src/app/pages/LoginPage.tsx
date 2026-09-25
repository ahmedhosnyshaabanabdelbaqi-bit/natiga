import { Alert, Anchor, Button, Group, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconClock, IconWifiOff } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { isApiError } from '@/api/errors';
import { useAuth } from '@/app/auth/AuthContext';
import { AuthLayout } from '@/app/auth/AuthLayout';
import { safeNextPath } from '@/app/auth/redirects';
import { describeError } from '@/api/describeError';
import { LoadingState } from '@/components/StateViews';

export default function LoginPage() {
  const { t } = useTranslation(['auth', 'common']);
  const { state, login, retryBootstrap } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNextPath(params.get('next'));
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({
    mode: 'controlled',
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? null : t('auth:validation.email')),
      password: (v) => (v.length > 0 ? null : t('auth:validation.passwordRequired')),
    },
  });

  if (state.status === 'loading') return <LoadingState minHeight={320} />;
  if (state.status === 'authenticated') return <Navigate to={next} replace />;

  const expired = params.get('reason') === 'expired' || state.reason === 'expired';
  const bootstrapFailed = state.reason === 'bootstrap-failed';

  const onSubmit = form.onSubmit(async (values) => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await login(values.email.trim(), values.password);
      void navigate(next, { replace: true });
    } catch (error) {
      setSubmitError(error);
      form.setFieldValue('password', '');
    } finally {
      setSubmitting(false);
    }
  });

  let errorMessage: string | null = null;
  if (submitError) {
    if (
      isApiError(submitError) &&
      (submitError.status === 401 || submitError.code === 'INVALID_CREDENTIALS')
    ) {
      errorMessage = t('auth:login.invalidCredentials');
    } else if (isApiError(submitError) && submitError.code === 'ACCOUNT_DISABLED') {
      errorMessage = t('auth:login.accountDisabled');
    } else {
      errorMessage = describeError(submitError, t).message;
    }
  }

  return (
    <AuthLayout title={t('auth:login.title')}>
      <form onSubmit={onSubmit} noValidate>
        <Stack>
          {expired ? (
            <Alert color="yellow" icon={<IconClock aria-hidden />} role="status">
              {t('auth:login.sessionExpired')}
            </Alert>
          ) : null}
          {bootstrapFailed ? (
            <Alert color="red" icon={<IconWifiOff aria-hidden />} role="alert">
              <Stack gap="xs">
                {t('auth:login.serverUnreachable')}
                <Group>
                  <Button size="xs" variant="light" color="red" onClick={retryBootstrap}>
                    {t('common:actions.retry')}
                  </Button>
                </Group>
              </Stack>
            </Alert>
          ) : null}
          {errorMessage ? (
            <Alert color="red" icon={<IconAlertCircle aria-hidden />} role="alert">
              {errorMessage}
            </Alert>
          ) : null}
          <TextInput
            label={t('auth:fields.email')}
            type="email"
            autoComplete="username"
            dir="ltr"
            required
            data-autofocus
            {...form.getInputProps('email')}
          />
          <PasswordInput
            label={t('auth:fields.password')}
            autoComplete="current-password"
            required
            {...form.getInputProps('password')}
          />
          <Group justify="space-between" align="center">
            <Anchor component={Link} to="/forgot-password" size="sm">
              {t('auth:login.forgotLink')}
            </Anchor>
            <Button type="submit" loading={submitting}>
              {t('auth:login.submit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </AuthLayout>
  );
}

import { Alert, Anchor, Button, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconMailCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { authApi } from '@/api/auth';
import { describeError } from '@/api/describeError';
import { AuthLayout } from '@/app/auth/AuthLayout';

export default function ForgotPasswordPage() {
  const { t } = useTranslation(['auth', 'common']);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm({
    initialValues: { email: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? null : t('auth:validation.email')),
    },
  });

  const onSubmit = form.onSubmit(async ({ email }) => {
    setError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <AuthLayout title={t('auth:forgot.title')}>
      {sent ? (
        <Stack>
          <Alert color="teal" icon={<IconMailCheck aria-hidden />} role="status">
            {t('auth:forgot.sent')}
          </Alert>
          <Anchor component={Link} to="/login" size="sm">
            {t('auth:backToLogin')}
          </Anchor>
        </Stack>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <Stack>
            <Text size="sm" c="dimmed">
              {t('auth:forgot.intro')}
            </Text>
            {error ? (
              <Alert color="red" icon={<IconAlertCircle aria-hidden />} role="alert">
                {describeError(error, t).message}
              </Alert>
            ) : null}
            <TextInput
              label={t('auth:fields.email')}
              type="email"
              autoComplete="email"
              dir="ltr"
              required
              {...form.getInputProps('email')}
            />
            <Button type="submit" loading={submitting}>
              {t('auth:forgot.submit')}
            </Button>
            <Anchor component={Link} to="/login" size="sm">
              {t('auth:backToLogin')}
            </Anchor>
          </Stack>
        </form>
      )}
    </AuthLayout>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Alert, Button, Field } from '../components/ui';
import { useI18n } from '../lib/i18n';

export default function Login() {
  const { login, error } = useAuth();
  const { t, lang, toggle } = useI18n();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<{ username?: boolean; password?: boolean }>({});

  const usernameError = touched.username && !username.trim() ? t('login.usernameRequired') : undefined;
  const passwordError = touched.password && !password ? t('login.passwordRequired') : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ username: true, password: true });
    if (!username.trim() || !password) return;

    setSubmitting(true);
    const ok = await login(username.trim(), password);
    setSubmitting(false);
    if (ok) navigate('/');
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 4 }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={toggle}>
            ⇄ {lang === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>

        <div className="brand">
          <div className="mark">{t('app.mark')}</div>
          <h1>{t('app.name')}</h1>
          <p>{t('login.title')}</p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <Field label={t('login.username')} required error={usernameError}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, username: true }))}
            autoComplete="username"
            autoFocus
            dir="ltr"
          />
        </Field>

        <Field label={t('login.password')} required error={passwordError}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            autoComplete="current-password"
            dir="ltr"
          />
        </Field>

        <Button type="submit" variant="primary" loading={submitting} style={{ width: '100%', marginTop: 6 }}>
          {submitting ? t('login.submitting') : t('login.submit')}
        </Button>

        <p className="tiny faint center mt-4">
          {t('login.installNote', { cmd: '' })}
          <span className="kbd">php artisan erp:install</span>
        </p>
      </form>
    </div>
  );
}

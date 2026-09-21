import { useState } from 'react';
import { api, toApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Button, Field } from '../components/ui';
import { useI18n } from '../lib/i18n';

const MIN_LENGTH = 12;

/**
 * شاشة إجبارية تظهر بدل النظام كله ما دامت كلمة المرور مؤقتة.
 * السيرفر يرفض أي مسار آخر في هذه الحالة، فالشاشة ليست حارس الأمان
 * بل الطريق الوحيد المتاح للمستخدم للخروج منها.
 */
export default function ChangePassword() {
  const { t, lang, toggle } = useI18n();
  const { logout, clearPasswordFlag } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const sameAsOld = next.length > 0 && next === current;
  const blocked = tooShort || mismatch || sameAsOld || !current || !next || !confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;

    setSubmitting(true);
    setError(null);
    try {
      await api.post('/auth/change-password', {
        current_password: current,
        new_password: next,
        new_password_confirmation: confirm,
      });
      clearPasswordFlag();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
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
          <h1>{t('pwd.title')}</h1>
          <p>{t('pwd.intro')}</p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <Field label={t('pwd.current')} required>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            autoFocus
            dir="ltr"
          />
        </Field>

        <Field
          label={t('pwd.new')}
          required
          help={t('pwd.rule')}
          error={tooShort ? t('pwd.tooShort') : sameAsOld ? t('pwd.sameAsOld') : undefined}
        >
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            dir="ltr"
          />
        </Field>

        <Field label={t('pwd.confirm')} required error={mismatch ? t('pwd.mismatch') : undefined}>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            dir="ltr"
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          loading={submitting}
          disabled={blocked}
          style={{ width: '100%', marginTop: 6 }}
        >
          {submitting ? t('pwd.submitting') : t('pwd.submit')}
        </Button>

        <button
          type="button"
          className="btn btn-sm btn-ghost"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => void logout()}
        >
          {t('pwd.signOut')}
        </button>
      </form>
    </div>
  );
}

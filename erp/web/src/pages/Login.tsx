import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../hooks/useAuth';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div
            className="brand-mark"
            style={{ width: 42, height: 42, margin: '0 auto 10px', fontSize: 17 }}
            aria-hidden="true"
          >
            ت
          </div>
          <h1 style={{ fontSize: 18, margin: 0 }}>نظام إدارة التوزيع</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0' }}>
            سجّل الدخول للمتابعة
          </p>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="field">
          <label className="field-label" htmlFor="email">
            البريد الإلكتروني
          </label>
          <input
            id="email"
            className="input"
            type="email"
            dir="ltr"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="password">
            كلمة المرور
          </label>
          <input
            id="password"
            className="input"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? <span className="spinner" /> : 'دخول'}
        </button>
      </form>
    </div>
  );
}

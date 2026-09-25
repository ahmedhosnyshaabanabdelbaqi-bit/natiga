import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth } from '@/app/auth/AuthContext';
import { LoadingState } from '@/components/StateViews';

export default function LogoutPage() {
  const { t } = useTranslation('auth');
  const { logout, state } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    // Wait for the startup session restore so it cannot sign us back in.
    if (started.current || state.status === 'loading') return;
    started.current = true;
    // Even if the server call fails the local session is cleared.
    void logout()
      .catch(() => undefined)
      .finally(() => void navigate('/login', { replace: true }));
  }, [logout, navigate, state.status]);

  return <LoadingState label={t('logout.inProgress')} minHeight={320} />;
}

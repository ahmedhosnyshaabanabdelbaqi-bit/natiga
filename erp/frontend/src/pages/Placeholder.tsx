import { Link } from 'react-router-dom';
import { Alert, EmptyState } from '../components/ui';
import { useI18n } from '../lib/i18n';

/**
 * شاشة لوظيفة مخطّطة لم تُنفَّذ بعد في هذه المرحلة.
 * تُعلن ذلك صراحةً بدل عرض شاشة فارغة أو زر لا يعمل.
 */
export default function Placeholder({
  title, phase, available,
}: {
  title: string;
  phase: string;
  available?: Array<{ label: string; path: string }>;
}) {
  const { t } = useI18n();

  return (
    <div>
      <div className="page-head"><h1>{title}</h1></div>

      <Alert tone="info">{t('placeholder.notice', { phase, file: 'erp/docs/STATUS.md' })}</Alert>

      <div className="card">
        <EmptyState
          title={t('placeholder.title')}
          description={t('placeholder.desc')}
          action={
            available && available.length > 0 ? (
              <div className="row" style={{ justifyContent: 'center' }}>
                {available.map((a) => (
                  <Link key={a.path} to={a.path} className="btn">{a.label}</Link>
                ))}
              </div>
            ) : (
              <Link to="/" className="btn btn-primary">{t('placeholder.backHome')}</Link>
            )
          }
        />
      </div>
    </div>
  );
}

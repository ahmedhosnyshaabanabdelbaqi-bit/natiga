import { Link } from 'react-router-dom';
import { Alert, EmptyState } from '../components/ui';

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
  return (
    <div>
      <div className="page-head"><h1>{title}</h1></div>

      <Alert tone="info">
        هذه الشاشة ضمن <strong>{phase}</strong> ولم تُنفَّذ في هذه المرحلة.
        الوظيفة الخلفية والـ API قد تكون جاهزة — راجع ملف الحالة في <code>erp/docs/STATUS.md</code>.
      </Alert>

      <div className="card">
        <EmptyState
          title="غير متاحة بعد"
          description="لم نبنِ واجهة لهذه الوظيفة حتى الآن. الشاشات المتاحة حاليًا مذكورة أدناه."
          action={
            available && available.length > 0 ? (
              <div className="row" style={{ justifyContent: 'center' }}>
                {available.map((a) => (
                  <Link key={a.path} to={a.path} className="btn">{a.label}</Link>
                ))}
              </div>
            ) : (
              <Link to="/" className="btn btn-primary">العودة للوحة التحكم</Link>
            )
          }
        />
      </div>
    </div>
  );
}

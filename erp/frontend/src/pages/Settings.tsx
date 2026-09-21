import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Alert, Badge, LoadingState } from '../components/ui';
import { useAuth } from '../lib/auth';

export default function Settings() {
  const { user } = useAuth();
  const [health, setHealth] = useState<Record<string, string> | null>(null);
  const [dictionary, setDictionary] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      api.get('/health').then(({ data }) => setHealth(data)).catch(() => undefined),
      api.get('/dashboard/dictionary').then(({ data }) => setDictionary(data.data)).catch(() => undefined),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>الإعدادات</h1>
          <div className="desc">اسم النظام والشركة والهوية قابلة للتغيير من إعدادات الشركة.</div>
        </div>
      </div>

      <div className="grid cols-2 mb-4">
        <div className="card">
          <div className="card-head"><h2>النظام</h2></div>
          <div className="card-body stack">
            <div className="row"><span className="muted" style={{ width: 140 }}>اسم النظام</span><span className="bold">{health?.system ?? '—'}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>الشركة</span><span className="bold">{user?.company_name ?? '—'}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>العملة</span><span>الجنيه المصري (EGP)</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>المنطقة الزمنية</span><span className="num">Africa/Cairo</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>طريقة التقييم</span><span>المتوسط المرجح المتحرك</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>حالة الخادم</span>
              <Badge tone={health?.status === 'ok' ? 'success' : 'danger'}>{health?.status === 'ok' ? 'متصل' : 'غير متاح'}</Badge></div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>حسابك وصلاحياتك</h2></div>
          <div className="card-body stack">
            <div className="row"><span className="muted" style={{ width: 140 }}>الاسم</span><span className="bold">{user?.name}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>اسم المستخدم</span><span className="num">{user?.username}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>الأدوار</span>
              <span className="row tight">{user?.roles.map((r) => <Badge key={r.id} tone="info">{r.name_ar}</Badge>)}</span></div>
            <div className="row"><span className="muted" style={{ width: 140 }}>مشاهدة التكلفة</span>
              {user?.can_see_cost ? <Badge tone="success">مسموح</Badge> : <Badge>غير مسموح</Badge>}</div>
            <div className="row"><span className="muted" style={{ width: 140 }}>عدد الصلاحيات</span>
              <span className="num">{user?.permissions.length ?? 0}</span></div>
          </div>
        </div>
      </div>

      <Alert tone="warn">
        <strong>قبل التشغيل الفعلي:</strong> يجب أن يراجع المحاسب المسؤول مصفوفة الترحيل (الحساب المقابل لكل مستند)
        ويعتمدها، وأن تُضبط النسب الضريبية المؤرخة. القواعد الافتراضية أُنشئت للتجهيز فقط.
      </Alert>

      {dictionary && (
        <div className="card">
          <div className="card-head">
            <h2>قاموس المؤشرات</h2>
            <span className="small muted">التعريف الحسابي لكل رقم يظهر في اللوحات والتقارير</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>المؤشر</th><th>التعريف الحسابي</th><th>ملاحظة</th></tr></thead>
              <tbody>
                {Object.entries(dictionary).map(([key, def]: [string, any]) => (
                  <tr key={key}>
                    <td className="bold">{def.label}</td>
                    <td className="small">{def.formula}</td>
                    <td className="small muted">{def.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

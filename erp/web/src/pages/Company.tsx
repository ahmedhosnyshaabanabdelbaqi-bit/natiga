import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, fieldErrors } from '../api/client';
import { Alert, Field, LoadingState, PageHeader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';

interface Company {
  id: number;
  name: string;
  name_en: string | null;
  legal_name: string | null;
  tax_id: string | null;
  commercial_reg: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency_code: string;
  timezone: string;
  logo_path: string | null;
}

/**
 * Company identity.
 *
 * The product name, logo and colours all live here. Nothing in the codebase
 * hard-codes a company name — changing it is a settings change, not a release.
 */
export function CompanySettings() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<Company>>({});
  const [saved, setSaved] = useState(false);
  const editable = can('admin.company.update');

  const { data, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: async () => (await api.get<{ company: Company }>('/admin/company')).data.company,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => api.put('/admin/company', form),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['company'] });
    },
  });

  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [saved]);

  if (isLoading) return <LoadingState rows={8} />;

  const errors = fieldErrors(save.error);
  const set = (key: keyof Company) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <>
      <PageHeader
        title="بيانات الشركة"
        subtitle="الاسم والهوية وبيانات التواصل — قابلة للتغيير بالكامل"
        breadcrumb={['الإعدادات', 'الشركة']}
      />

      {saved && <Alert tone="ok">تم حفظ البيانات.</Alert>}
      {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
      {!editable && <Alert tone="warn">لديك صلاحية الاطلاع فقط على هذه الشاشة.</Alert>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="card-body">
          <div className="grid-2">
            <Field label="اسم الشركة" error={errors.name}>
              <input
                className="input"
                value={form.name ?? ''}
                onChange={set('name')}
                disabled={!editable}
                required
              />
            </Field>

            <Field label="الاسم بالإنجليزية" error={errors.name_en}>
              <input
                className="input"
                dir="ltr"
                value={form.name_en ?? ''}
                onChange={set('name_en')}
                disabled={!editable}
              />
            </Field>

            <Field label="الاسم القانوني" error={errors.legal_name}>
              <input
                className="input"
                value={form.legal_name ?? ''}
                onChange={set('legal_name')}
                disabled={!editable}
              />
            </Field>

            <Field
              label="الرقم الضريبي"
              error={errors.tax_id}
              hint="مطلوب قبل تفعيل أي ربط مع منظومة الفاتورة الإلكترونية."
            >
              <input
                className="input"
                dir="ltr"
                value={form.tax_id ?? ''}
                onChange={set('tax_id')}
                disabled={!editable}
              />
            </Field>

            <Field label="السجل التجاري" error={errors.commercial_reg}>
              <input
                className="input"
                dir="ltr"
                value={form.commercial_reg ?? ''}
                onChange={set('commercial_reg')}
                disabled={!editable}
              />
            </Field>

            <Field label="الهاتف" error={errors.phone}>
              <input
                className="input"
                dir="ltr"
                value={form.phone ?? ''}
                onChange={set('phone')}
                disabled={!editable}
              />
            </Field>

            <Field label="البريد الإلكتروني" error={errors.email}>
              <input
                className="input"
                type="email"
                dir="ltr"
                value={form.email ?? ''}
                onChange={set('email')}
                disabled={!editable}
              />
            </Field>

            <Field label="العملة" error={errors.currency_code} hint="رمز من ثلاثة أحرف، مثل EGP.">
              <input
                className="input"
                dir="ltr"
                maxLength={3}
                value={form.currency_code ?? ''}
                onChange={set('currency_code')}
                disabled={!editable}
              />
            </Field>

            <Field label="المنطقة الزمنية" error={errors.timezone}>
              <input
                className="input"
                dir="ltr"
                value={form.timezone ?? ''}
                onChange={set('timezone')}
                disabled={!editable}
              />
            </Field>
          </div>

          <Field label="العنوان" error={errors.address}>
            <textarea
              className="input"
              rows={3}
              value={form.address ?? ''}
              onChange={set('address')}
              disabled={!editable}
            />
          </Field>
        </div>

        {editable && (
          <div className="modal-footer">
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? <span className="spinner" /> : 'حفظ'}
            </button>
          </div>
        )}
      </form>
    </>
  );
}

/* ------------------------------------------------------------------- users */

interface UserRow {
  id: number;
  code: string | null;
  name: string;
  email: string;
  job_title: string | null;
  is_active: boolean;
  roles: string[];
  last_login_at: string | null;
}

export function Users() {
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<{ data: UserRow[] }>('/admin/users')).data.data,
  });

  if (isLoading) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="المستخدمون"
        subtitle="الحسابات والأدوار المسندة إليها"
        breadcrumb={['الإعدادات', 'المستخدمون']}
      />

      <Alert tone="info">
        إيقاف مستخدم ينهي جلساته فورًا، لكنه لا يلغي مسؤوليته عن المستندات التي أنشأها — تبقى
        منسوبة إليه في سجل المراجعة.
      </Alert>

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>البريد</th>
                <th>الوظيفة</th>
                <th>الأدوار</th>
                <th>آخر دخول</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td dir="ltr" className="num">
                    {user.email}
                  </td>
                  <td>{user.job_title ?? '—'}</td>
                  <td>{user.roles.join('، ') || '—'}</td>
                  <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString('ar-EG') : 'لم يدخل بعد'}</td>
                  <td>
                    <span className={`badge badge-${user.is_active ? 'ok' : 'neutral'}`}>
                      {user.is_active ? 'نشط' : 'موقوف'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, UploadCloud, RefreshCw, PackageCheck, LoaderCircle, History } from 'lucide-react';
import { api, date, fmt, Section } from './shared';
import { t, useLanguage } from './i18n';
import './Updates.css';

type Job = { id: string; digest: string; version: string; sequence: number; schema: number; notes: string; files: number; bytes: number; status: string; actor_name: string; created_at: string; updated_at: string; logs: { at: string; code: string }[] };
type State = { enabled: boolean; ready: boolean; current: { version: string; sequence: number; schema: number }; maintenance: boolean; limits: { package_bytes: number }; jobs: Job[]; public_key_fingerprint?: string };
const running = new Set(['queued', 'preparing', 'installing', 'checking']);
const statuses: Record<string, string> = { staged: 'جاهز للمراجعة', queued: 'بانتظار المنفّذ', preparing: 'تجهيز الإصدار', installing: 'تثبيت الإصدار', checking: 'فحص الصحة', installed: 'تم التثبيت', rolled_back: 'تمت استعادة الإصدار السابق', failed: 'لم يكتمل التثبيت', rollback_failed: 'تحتاج الاستعادة تدخل مسؤول الخادم' };
const events: Record<string, string> = {
  PACKAGE_VERIFIED: 'تم التحقق من التوقيع وبصمات الملفات', INSTALL_REQUESTED: 'بدأ النظام طلب التثبيت تلقائيًا', MAINTENANCE_STARTED: 'بدأ وضع الصيانة', FILES_STAGED: 'جُهزت ملفات الإصدار', DEPENDENCIES_READY: 'اكتملت الاعتمادات وفحص الشفرة', DATABASE_BACKED_UP: 'حُفظت نسخة مشفرة من قاعدة البيانات', CODE_SWAP_STARTED: 'بدأ حفظ الشفرة السابقة واستبدالها', CODE_INSTALLED: 'ثُبتت الشفرة الجديدة', HEALTH_PASSED: 'اجتاز الإصدار الجديد فحص الصحة', ROLLBACK_STARTED: 'بدأ التراجع الآلي', PREVIOUS_CODE_RESTORED: 'استعيدت الشفرة السابقة', DATABASE_RESTORED: 'استعيدت قاعدة البيانات السابقة', ROLLBACK_AWAITING_HEALTH: 'بانتظار فحص الإصدار المستعاد', PREVIOUS_HEALTH_PASSED: 'اجتاز الإصدار السابق فحص الصحة', HEALTH_FAILED: 'فشل فحص الإصدار الجديد', DEPENDENCIES_FAILED: 'فشل تجهيز الاعتمادات أو فحص الشفرة', UPDATE_SCHEMA: 'تعارض في ترحيلات قاعدة البيانات', UPDATE_DISK: 'مساحة القرص غير كافية للتحديث والنسخ', UPDATE_FAILED: 'تعذّر إكمال التحديث؛ راجع سجل مسؤول الخادم', ROLLBACK_FAILED: 'تعذّرت الاستعادة الآلية', ROLLBACK_HEALTH_FAILED: 'لم يجتز الإصدار المستعاد فحص الصحة', UPDATE_SIGNATURE: 'توقيع الحزمة غير صالح', UPDATE_HASH: 'فشل التحقق من سلامة الملفات', UPDATE_RECOVERY_REQUIRED: 'استكمال التعافي من محاولة سابقة', UPDATE_RUNTIME: 'بيئة تشغيل منفّذ التحديث غير مكتملة',
};

export default function Updates() {
  useLanguage();
  const [state, setState] = useState<State | null>(null), [selectedId, setSelectedId] = useState('');
  const [selection, setSelection] = useState<{ file: File; key: string } | null>(null);
  const [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(''), [connectionError, setConnectionError] = useState('');
  const input = useRef<HTMLInputElement>(null), mounted = useRef(true), reading = useRef(false);
  const selected = state?.jobs.find(job => job.id === selectedId) || state?.jobs[0];
  const active = state?.jobs.some(job => running.has(job.status)) || state?.maintenance;

  async function refresh() {
    if (reading.current) return;
    reading.current = true; setRefreshing(true);
    try { const next: State = await api('/software-updates'); if (mounted.current) { setState(next); setConnectionError(''); } }
    catch (reason) { if (mounted.current) setConnectionError(reason instanceof Error ? reason.message : t('تعذّر الاتصال بالخادم')); }
    finally { reading.current = false; if (mounted.current) setRefreshing(false); }
  }
  useEffect(() => {
    mounted.current = true; void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => { setError(''); }, [selected?.id]);
  useEffect(() => {
    if (!selection) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [selection]);

  async function upload() {
    if (!selection || busy) return;
    const chosen = selection; setBusy(true); setError('');
    try {
      if (chosen.file.size > (state?.limits.package_bytes || 6 * 1024 * 1024)) throw Error(t('الحد الأقصى لحزمة التحديث 6 ميجابايت.'));
      let parsed: unknown;
      try { parsed = JSON.parse(await chosen.file.text()); } catch { throw Error(t('تعذّر قراءة الحزمة. اختر ملف تحديث صالحًا.')); }
      const job: Job = await api('/software-updates/upload', { package: parsed, idempotency_key: chosen.key });
      if (!mounted.current) return;
      setSelectedId(job.id); setSelection(null); if (input.current) input.current.value = '';
      setState(old => old ? { ...old, jobs: [job, ...old.jobs.filter(row => row.id !== job.id)] } : old);
      await refresh();
    } catch (reason) { if (mounted.current) setError((reason instanceof Error ? reason.message : t('تعذّر رفع الحزمة')) + ' ' + t('الملف المختار محفوظ لإعادة المحاولة.')); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="updates-page">
    <Section title={t('تحديث البرنامج')} sub={t('ارفع إصدارًا موثوقًا؛ يبدأ التثبيت والفحص تلقائيًا بعد التحقق، مع نسخة احتياطية وتراجع آلي عند الفشل.')} action={<button className="button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={16} />{t('تحديث الحالة')}</button>}>
      <div className="updates-summary"><div><PackageCheck size={24}/><span>{t('الإصدار المثبت')}<strong dir="ltr">{state?.current.version || '—'}</strong></span></div><div><ShieldCheck size={24}/><span>{t('مصدر الحزم')}<strong>{t('توقيع Ed25519 موثوق')}</strong></span></div><div><History size={24}/><span>{t('إصدار قاعدة البيانات')}<strong>{state ? fmt(state.current.schema) : '—'}</strong></span></div></div>
      {!state && !connectionError && <p className="updates-status" role="status"><LoaderCircle className="spin" size={18}/>{t('جارٍ تحميل الحالة')}</p>}
      {connectionError && <div className="updates-notice" role="status">{active ? t('الخادم يعيد التشغيل أثناء التحديث. ستتم إعادة الاتصال تلقائيًا؛ لا تغلق الصفحة حتى تظهر النتيجة.') : connectionError}</div>}
      {state && !state.enabled && <div className="updates-notice">{t('التحديثات غير مهيأة على هذا الخادم. يضبط مسؤول الخادم المفتاح الموثوق وخدمة التثبيت مرة واحدة.')}</div>}
      {state?.enabled && !state.ready && <div className="updates-notice">{t('لا يمكن رفع تحديث حتى تصبح خدمة التثبيت والرجوع التلقائي جاهزة على الخادم.')}</div>}
      {active && <div className="updates-notice updates-maintenance" role="status">{t('تحديث قيد التنفيذ. قد يتوقف الوصول مؤقتًا، وتُمنع التعديلات حتى اكتمال الفحص أو الاستعادة.')}</div>}
      {state?.enabled && <div className="updates-upload"><label htmlFor="update-package"><UploadCloud size={22}/><strong>{t('اختر حزمة تحديث موقعة')}</strong><span>{t('ملف .nicu-update، بحد أقصى 6 ميجابايت. يبدأ التثبيت تلقائيًا بعد التحقق.')}</span></label><input ref={input} id="update-package" type="file" accept=".nicu-update,application/json" disabled={busy || !!active || !state.ready} onChange={event => { const file = event.target.files?.[0]; setSelection(file ? { file, key: crypto.randomUUID() } : null); setError(''); }}/><button className="button primary" disabled={!selection || busy || !!active || !state.ready} onClick={() => void upload()}>{busy ? <LoaderCircle size={16} className="spin"/> : <ShieldCheck size={16}/>} {t('رفع وتثبيت تلقائي')}</button></div>}
      {error && <div className="error-box" role="alert">{error}</div>}
    </Section>
    {!!state?.jobs.length && <div className="updates-layout"><Section title={t('حزم التحديث')}><div className="updates-list">{state.jobs.map(job => <button key={job.id} className={selected?.id === job.id ? 'updates-job selected' : 'updates-job'} onClick={() => setSelectedId(job.id)}><strong dir="ltr">{job.version}</strong><span>{t(statuses[job.status] || job.status)}</span><small>{date(job.created_at, true)}</small></button>)}</div></Section>
      {selected && <Section title={t('مراجعة الإصدار {version}', { version: selected.version })} sub={selected.actor_name + ' · ' + date(selected.created_at, true)}>
        <dl className="updates-facts"><div><dt>{t('الحالة')}</dt><dd>{t(statuses[selected.status] || selected.status)}</dd></div><div><dt>{t('الملفات')}</dt><dd>{fmt(selected.files)}</dd></div><div><dt>{t('حجم المحتوى')}</dt><dd>{fmt(selected.bytes / 1024)} {t('كيلوبايت')}</dd></div><div><dt>{t('تسلسل الإصدار')}</dt><dd>{fmt(selected.sequence)}</dd></div></dl>
        {selected.notes && <p className="updates-notes">{selected.notes}</p>}
        <details className="updates-digest"><summary>{t('بصمة بيان الإصدار')}</summary><code dir="ltr">{selected.digest}</code></details>
        {selected.status === 'staged' && <div className="updates-notice">{t('تم حفظ الحزمة قبل اكتمال طلب التثبيت. أعد اختيار الملف نفسه ليكمل النظام الطلب تلقائيًا بنفس مفتاح المحاولة.')}</div>}
        <ol className="updates-events">{selected.logs.map((log, index) => <li key={log.at + index}><span>{t(events[log.code] || log.code)}</span><time dateTime={log.at}>{date(log.at, true)}</time></li>)}</ol>
      </Section>}
    </div>}
  </div>;
}

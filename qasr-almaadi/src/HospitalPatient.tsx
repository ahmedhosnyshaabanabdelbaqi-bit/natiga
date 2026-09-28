import { useEffect, useState } from 'react';
import { useLanguage } from './i18n';
import { api, date, Section, Table, type Row } from './shared';

export default function HospitalPatient({ patientId, admissionId, data, can }: { patientId: string; admissionId?: string; data: Row; can: (p:string)=>boolean }) {
  const english=useLanguage()==='en';
  const text=(ar:string,en:string)=>english?en:ar;
  const [events,setEvents]=useState<Row[]>([]),[error,setError]=useState('');
  useEffect(()=>{ let active=true; api(`/hospital/patients/${encodeURIComponent(patientId)}/timeline`).then(d=>{if(active)setEvents(d.events||[])}).catch(e=>{if(active)setError(e.message)}); return()=>{active=false} },[patientId,admissionId,data]);
  const serviceLink=(page:string)=>`#page=${page}&admission=${encodeURIComponent(admissionId||'')}`;
  const statusNames:Row={ordered:text('مطلوب','Ordered'),scheduled:text('مجدول','Scheduled'),performed:text('تم التنفيذ','Performed'),reported:text('تم التقرير','Reported'),reviewed:text('تمت المراجعة','Reviewed'),cancelled:text('ملغي','Cancelled'),in_progress:text('جارٍ التنفيذ','In progress'),completed:text('مكتمل','Completed')};
  return <div className="hospital-patient">
    {admissionId&&<div className="button-row">
      {can('radiology.read')&&<a className="button" href={serviceLink('radiology')}>{text('طلبات الأشعة','Radiology requests')}</a>}
      {can('surgery.read')&&<a className="button" href={serviceLink('surgery')}>{text('جدول العمليات','Surgery schedule')}</a>}
      {can('pharmacy.read')&&<a className="button" href={serviceLink('pharmacy')}>{text('صرف الصيدلية','Pharmacy dispensing')}</a>}
      {can('beds.write')&&<a className="button" href={serviceLink('inpatient')}>{text('التحويل بين الأقسام','Department transfer')}</a>}
    </div>}
    {(['radiology','surgeries'] as const).filter(k=>can('clinical.read')||can(k==='radiology'?'radiology.read':'surgery.read')).map(k=><Section key={k} title={k==='radiology'?text('طلبات وتقارير الأشعة','Radiology requests and reports'):text('العمليات والإجراءات','Surgeries and procedures')}>
      <Table headers={[text('الخدمة','Service'),text('الحالة','Status'),text('الموعد','Scheduled'),text('التقرير / الملاحظات','Report / notes')]} rows={(data[k]||[]).map((x:Row)=>[x.name,statusNames[x.status]||x.status,date(x.scheduled_at||x.created_at,true),x.result||x.notes||'—'])}/>
    </Section>)}
    {(can('clinical.read')||can('pharmacy.read'))&&<Section title={text('الأدوية المصروفة من الصيدلية','Pharmacy dispensing history')}><Table headers={[text('الدواء','Medication'),text('التشغيلة','Batch'),text('الكمية','Quantity'),text('التاريخ','Date')]} rows={(data.dispensations||[]).map((x:Row)=>[x.medication_name||x.item_name||x.name,x.batch||'—',`${x.quantity} ${x.unit||''}`,date(x.created_at,true)])}/></Section>}
    <Section title={text('مسار المريض بين الأقسام','Patient journey across departments')}>
      {error&&<div className="error-box">{error}</div>}
      <Table headers={[text('التاريخ','Date'),text('الحدث','Event'),text('القسم / التفاصيل','Department / details')]} rows={events.map(x=>[date(x.created_at||x.at||x.scheduled_at||x.admitted_at,true),x.title||x.label||({admission:text('فتح زيارة','Visit opened'),appointment:text('موعد عيادة','Appointment'),department_transfer:text('تحويل قسم','Department transfer'),discharge:text('خروج','Discharge'),triage:text('فرز طوارئ','Emergency triage')} as Row)[x.kind||x.type]||x.kind||x.type,x.department_name||x.to_department_name||x.details||x.reason||'—'])}/>
    </Section>
  </div>;
}

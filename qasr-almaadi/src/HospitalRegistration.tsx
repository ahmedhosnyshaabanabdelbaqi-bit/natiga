import { api, field, options, type FormSpec, type Row } from './shared';
import { getLanguage } from './i18n';

export async function hospitalRegistration(users: Row[], beds: Row[], onPatient: (id: string, admissionId?: string) => void): Promise<FormSpec> {
  const english = getLanguage() === 'en';
  const text = (ar: string, en: string) => english ? en : ar;
  const departments: Row[] = await api('/hospital/departments');
  const care = departments.filter(d => d.active && ['nicu','outpatient','emergency','inpatient','icu','surgery'].includes(d.type));
  return {
    title: text('تسجيل مريض في المستشفى', 'Register a hospital patient'),
    subtitle: text('ملف موحّد لكل الأعمار والزيارات والأقسام', 'One patient identity across all ages, visits and departments'),
    note: text('للحجز لاحقًا، اختر إنشاء الملف فقط. بيانات الولادة اختيارية لحديثي الولادة.', 'Choose registration only to book a visit later. Birth details are optional for newborns.'),
    fields: [
      field('name',text('اسم المريض بالكامل','Patient full name')),
      field('sex',text('الجنس','Sex'),'text',true,{options:options(['male','female','unknown'])}),
      field('birth_at',text('تاريخ الميلاد','Date of birth'),'date'),
      field('national_id',text('الرقم القومي / الهوية','National ID'),'text',false),
      field('phone',text('هاتف المريض','Patient phone'),'tel',false),
      field('address',text('العنوان','Address'),'textarea',false),
      field('guardian_name',text('اسم المرافق / ولي الأمر','Contact / guardian name'),'text',false),
      field('guardian_phone',text('هاتف المرافق','Contact phone'),'tel',false),
      field('blood_group',text('فصيلة الدم','Blood group'),'text',false,{value:'blood_unknown',options:options(['blood_unknown','A+','A-','B+','B-','AB+','AB-','O+','O-'])}),
      field('department_id',text('قسم الاستقبال','Receiving department'),'text',true,{value:'dept-outpatient',options:care.map(d=>({value:d.id,label:d.name}))}),
      field('registration_only',text('إنشاء الملف فقط للحجز لاحقًا، بدون فتح زيارة','Register only, without opening a visit'),'checkbox',false),
      field('bed_id',text('السرير إن احتاج المريض للتنويم','Bed if inpatient care is needed'),'text',false,{options:beds.filter(b=>b.status==='available').map(b=>({value:b.id,label:`${b.name} · ${b.room}`})),help:text('اختر سريرًا من نفس القسم؛ اتركه فارغًا للعيادات.','Choose a bed in the same department; leave empty for outpatient visits.')}),
      field('doctor_id',text('الطبيب المسؤول','Responsible doctor'),'text',false,{options:users.filter(u=>u.active&&['doctor','manager'].includes(u.role)).map(u=>({value:u.id,label:u.name}))}),
      field('nurse_id',text('الممرض المسؤول','Responsible nurse'),'text',false,{options:users.filter(u=>u.active&&['nurse','head_nurse'].includes(u.role)).map(u=>({value:u.id,label:u.name}))}),
      field('reason',text('سبب الزيارة','Reason for visit'),'textarea',false,{wide:true}),
      field('mother_name',text('اسم الأم (لحديثي الولادة)','Mother name (newborns)'),'text',false),
      field('gestation_weeks',text('العمر الحملي عند الولادة (أسبوع)','Gestation at birth (weeks)'),'number',false,{min:15,max:45}),
      field('birth_weight',text('وزن الولادة (جم)','Birth weight (g)'),'number',false,{min:100,max:10000}),
      field('twin_label',text('تمييز التوأم','Twin identifier'),'text',false),
      field('allow_duplicate',text('راجعت الهوية وأؤكد إنشاء ملف مستقل عند تشابه بيانات الولادة','I verified identity and confirm a separate record with matching birth details'),'checkbox',false),
    ],
    button:text('حفظ ملف المريض','Save patient record'),
    submit:async values=>{
      const dept = care.find(d=>d.id===values.department_id);
      if (!values.registration_only && !String(values.reason||'').trim()) throw new Error(text('أدخل سبب الزيارة','Enter the reason for the visit'));
      const result=await api('/patients',{...values,encounter_type:dept?.type==='surgery'?'inpatient':dept?.type});
      onPatient(result.id,result.admission_id||undefined);
      return result;
    },
  };
}

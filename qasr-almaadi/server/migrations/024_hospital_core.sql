CREATE TABLE hospital_departments (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('nicu','outpatient','emergency','inpatient','icu','surgery','lab','radiology','pharmacy')),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO hospital_departments(id,name,type) VALUES
('dept-nicu','الحضانات','nicu'),
('dept-outpatient','العيادات الخارجية','outpatient'),
('dept-emergency','الطوارئ','emergency'),
('dept-inpatient','الأقسام الداخلية','inpatient'),
('dept-icu','العناية المركزة','icu'),
('dept-surgery','العمليات','surgery'),
('dept-lab','المعمل','lab'),
('dept-radiology','الأشعة','radiology'),
('dept-pharmacy','الصيدلية','pharmacy');
ALTER TABLE patients ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE admissions ADD COLUMN department_id text NOT NULL DEFAULT 'dept-nicu' REFERENCES hospital_departments(id);
ALTER TABLE admissions ADD COLUMN encounter_type text NOT NULL DEFAULT 'nicu' CHECK (encounter_type IN ('nicu','outpatient','emergency','inpatient','icu'));
ALTER TABLE admissions ADD COLUMN triage_level text CHECK (triage_level IN ('immediate','very_urgent','urgent','standard','non_urgent'));
ALTER TABLE beds ADD COLUMN department_id text NOT NULL DEFAULT 'dept-nicu' REFERENCES hospital_departments(id);
CREATE INDEX admissions_department_active ON admissions(department_id,status);
CREATE INDEX beds_department ON beds(department_id);
CREATE TABLE hospital_appointments (
  id text PRIMARY KEY,
  patient_id text NOT NULL REFERENCES patients(id),
  department_id text NOT NULL REFERENCES hospital_departments(id),
  doctor_id text NOT NULL REFERENCES users(id),
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 240),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','arrived','cancelled','completed')),
  notes text,
  admission_id text REFERENCES admissions(id),
  created_by text NOT NULL REFERENCES users(id),
  arrived_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointments_schedule ON hospital_appointments(doctor_id,scheduled_at) WHERE status IN ('scheduled','arrived');
CREATE INDEX appointments_patient ON hospital_appointments(patient_id,scheduled_at);
CREATE TABLE hospital_department_movements (
  id text PRIMARY KEY,
  admission_id text NOT NULL REFERENCES admissions(id),
  from_department_id text NOT NULL REFERENCES hospital_departments(id),
  to_department_id text NOT NULL REFERENCES hospital_departments(id),
  from_encounter_type text NOT NULL,
  to_encounter_type text NOT NULL,
  from_bed_id text REFERENCES beds(id),
  to_bed_id text REFERENCES beds(id),
  reason text NOT NULL,
  actor_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hospital_movements_admission ON hospital_department_movements(admission_id,created_at);
CREATE TABLE hospital_triage_events (
  id text PRIMARY KEY,
  admission_id text NOT NULL REFERENCES admissions(id),
  triage_level text NOT NULL CHECK (triage_level IN ('immediate','very_urgent','urgent','standard','non_urgent')),
  notes text,
  actor_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hospital_triage_admission ON hospital_triage_events(admission_id,created_at);

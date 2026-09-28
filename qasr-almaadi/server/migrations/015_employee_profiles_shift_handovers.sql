ALTER TABLE hr_employees ADD COLUMN job_type text NOT NULL DEFAULT 'other'
  CHECK(job_type IN('doctor','nurse','reception','accountant','technician','worker','administration','other'));
ALTER TABLE hr_employees ADD COLUMN job_title text;
ALTER TABLE hr_employees ADD COLUMN department text NOT NULL DEFAULT 'حضّانات حديثي الولادة';
ALTER TABLE hr_employees ADD COLUMN phone text;
ALTER TABLE hr_employees ADD COLUMN hire_date date;
ALTER TABLE hr_employees ADD COLUMN daily_work_hours numeric(5,2) NOT NULL DEFAULT 8
  CHECK(daily_work_hours>0 AND daily_work_hours<=16);
ALTER TABLE hr_employees ADD COLUMN work_days_per_month integer NOT NULL DEFAULT 30
  CHECK(work_days_per_month BETWEEN 1 AND 31);
ALTER TABLE hr_employees ADD COLUMN absence_deduction numeric(14,2)
  CHECK(absence_deduction IS NULL OR absence_deduction>=0);
ALTER TABLE hr_employees ADD COLUMN overtime_hour_rate numeric(14,2)
  CHECK(overtime_hour_rate IS NULL OR overtime_hour_rate>=0);
ALTER TABLE hr_employees ADD COLUMN notes text;
ALTER TABLE users ADD COLUMN version integer NOT NULL DEFAULT 1;

CREATE TABLE attendance_shift_handovers(
 id text PRIMARY KEY,
 shift_id text NOT NULL UNIQUE REFERENCES attendance_shifts(id),
 from_employee_id text NOT NULL REFERENCES hr_employees(id),
 to_employee_id text NOT NULL REFERENCES hr_employees(id),
 summary text NOT NULL CHECK(char_length(summary) BETWEEN 1 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','acknowledged')),
 handed_over_by text NOT NULL REFERENCES users(id),
 handed_over_at timestamptz NOT NULL DEFAULT now(),
 acknowledged_by text REFERENCES users(id),
 acknowledged_at timestamptz,
 version integer NOT NULL DEFAULT 1,
 CHECK(from_employee_id<>to_employee_id)
);
CREATE INDEX attendance_handovers_people ON attendance_shift_handovers(to_employee_id,from_employee_id,handed_over_at DESC);

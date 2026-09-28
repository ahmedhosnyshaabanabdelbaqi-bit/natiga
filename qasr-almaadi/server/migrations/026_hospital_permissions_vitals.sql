ALTER TABLE vitals ADD COLUMN IF NOT EXISTS systolic numeric CHECK (systolic BETWEEN 0 AND 350);
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS diastolic numeric CHECK (diastolic BETWEEN 0 AND 250);
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS height_cm numeric CHECK (height_cm BETWEEN 10 AND 300);
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS pain_score numeric CHECK (pain_score BETWEEN 0 AND 10);
CREATE UNIQUE INDEX hospital_patient_identity ON patients(national_id) WHERE national_id IS NOT NULL AND national_id<>'';
UPDATE roles SET permissions=permissions || '["radiology.read","radiology.write","pharmacy.read","pharmacy.write","surgery.read","surgery.write"]'::jsonb WHERE name IN ('admin','manager');
UPDATE roles SET permissions=permissions || '["radiology.read","pharmacy.read","surgery.read","surgery.write"]'::jsonb WHERE name='doctor';
UPDATE roles SET permissions=permissions || '["radiology.read","surgery.read"]'::jsonb WHERE name IN ('nurse','head_nurse');
INSERT INTO roles(name,permissions) VALUES ('radiologist','["attendance.self","patients.read","radiology.read","radiology.write","print"]'),('pharmacist','["attendance.self","patients.read","pharmacy.read","pharmacy.write","stock.read","print"]') ON CONFLICT(name) DO NOTHING;

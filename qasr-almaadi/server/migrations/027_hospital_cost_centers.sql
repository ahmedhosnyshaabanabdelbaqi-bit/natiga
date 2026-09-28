ALTER TABLE hospital_departments ADD COLUMN cost_center_id text REFERENCES cost_centers(id);
INSERT INTO cost_centers(id,code,name_ar,name_en)
SELECT 'cc-hospital-' || id,'HOSP-' || upper(substr(md5(id),1,15)),name,name
FROM hospital_departments WHERE id<>'dept-nicu';
UPDATE hospital_departments SET cost_center_id=CASE WHEN id='dept-nicu' THEN 'cc-nicu' ELSE 'cc-hospital-' || id END;
ALTER TABLE hospital_departments ALTER COLUMN cost_center_id SET NOT NULL;
CREATE UNIQUE INDEX hospital_department_cost_center ON hospital_departments(cost_center_id);
CREATE INDEX hospital_department_movement_time ON hospital_department_movements(admission_id,created_at,id);
ALTER TABLE charges ADD COLUMN department_id_snapshot text REFERENCES hospital_departments(id);
ALTER TABLE payments ADD COLUMN department_id_snapshot text REFERENCES hospital_departments(id);
ALTER TABLE insurance_claims ADD COLUMN department_id_snapshot text REFERENCES hospital_departments(id);
ALTER TABLE stock_movements ADD COLUMN department_id_snapshot text REFERENCES hospital_departments(id);
UPDATE charges x SET department_id_snapshot=COALESCE((SELECT m.to_department_id FROM hospital_department_movements m WHERE m.admission_id=x.admission_id AND m.created_at<=x.created_at ORDER BY m.created_at DESC,m.id DESC LIMIT 1),(SELECT m.from_department_id FROM hospital_department_movements m WHERE m.admission_id=x.admission_id ORDER BY m.created_at,m.id LIMIT 1),(SELECT a.department_id FROM admissions a WHERE a.id=x.admission_id)) WHERE x.admission_id IS NOT NULL;
UPDATE payments x SET department_id_snapshot=COALESCE((SELECT m.to_department_id FROM hospital_department_movements m WHERE m.admission_id=x.admission_id AND m.created_at<=x.created_at ORDER BY m.created_at DESC,m.id DESC LIMIT 1),(SELECT m.from_department_id FROM hospital_department_movements m WHERE m.admission_id=x.admission_id ORDER BY m.created_at,m.id LIMIT 1),(SELECT a.department_id FROM admissions a WHERE a.id=x.admission_id)) WHERE x.admission_id IS NOT NULL;
UPDATE insurance_claims x SET department_id_snapshot=COALESCE((SELECT m.to_department_id FROM hospital_department_movements m WHERE m.admission_id=x.admission_id AND m.created_at<=x.created_at ORDER BY m.created_at DESC,m.id DESC LIMIT 1),(SELECT m.from_department_id FROM hospital_department_movements m WHERE m.admission_id=x.admission_id ORDER BY m.created_at,m.id LIMIT 1),(SELECT a.department_id FROM admissions a WHERE a.id=x.admission_id)) WHERE x.admission_id IS NOT NULL;
UPDATE stock_movements x SET department_id_snapshot=COALESCE((SELECT m.to_department_id FROM hospital_department_movements m WHERE m.admission_id=x.admission_id AND m.created_at<=x.created_at ORDER BY m.created_at DESC,m.id DESC LIMIT 1),(SELECT m.from_department_id FROM hospital_department_movements m WHERE m.admission_id=x.admission_id ORDER BY m.created_at,m.id LIMIT 1),(SELECT a.department_id FROM admissions a WHERE a.id=x.admission_id)) WHERE x.admission_id IS NOT NULL;

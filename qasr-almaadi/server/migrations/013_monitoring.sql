CREATE TABLE monitor_bindings(id text PRIMARY KEY,admission_id text NOT NULL REFERENCES admissions(id),equipment_id text NOT NULL REFERENCES equipment(id),bed_id text NOT NULL REFERENCES beds(id),bound_at timestamptz NOT NULL DEFAULT now(),actor_id text NOT NULL REFERENCES users(id),ended_at timestamptz,ended_by text REFERENCES users(id));
CREATE UNIQUE INDEX monitor_active_equipment ON monitor_bindings(equipment_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX monitor_active_admission ON monitor_bindings(admission_id) WHERE ended_at IS NULL;
ALTER TABLE vitals ADD COLUMN monitor_binding_id text REFERENCES monitor_bindings(id);
ALTER TABLE vitals ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK(source='manual');
CREATE INDEX vitals_monitor_binding ON vitals(monitor_binding_id,measured_at DESC);

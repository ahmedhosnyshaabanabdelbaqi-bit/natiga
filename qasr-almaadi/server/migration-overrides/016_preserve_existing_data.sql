ALTER TABLE patients ADD COLUMN birth_certificate_no text;
ALTER TABLE patients ADD COLUMN blood_group text NOT NULL DEFAULT 'blood_unknown'
  CHECK(blood_group IN('A+','A-','B+','B-','AB+','AB-','O+','O-','blood_unknown'));
ALTER TABLE patients ADD COLUMN delivery_type text NOT NULL DEFAULT 'delivery_unknown'
  CHECK(delivery_type IN('delivery_normal','delivery_cesarean','delivery_assisted','delivery_unknown'));
ALTER TABLE patients ADD COLUMN birth_place text;
ALTER TABLE patients ADD COLUMN mother_national_id text;
ALTER TABLE patients ADD COLUMN guardian_relation text;
ALTER TABLE patients ADD COLUMN guardian_national_id text;
ALTER TABLE patients ADD COLUMN emergency_phone text;
ALTER TABLE patients ADD COLUMN address text;

-- Schema upgrades must preserve existing records, accounts and sequences.
-- Demo fixtures are opt-in at startup, never removed by a schema migration.
INSERT INTO chat_conversations(id,kind) VALUES('department','group') ON CONFLICT DO NOTHING;
UPDATE settings SET data=jsonb_set(data - 'training','{mode}','"live"'::jsonb,true)
WHERE id='hospital';

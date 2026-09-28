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

TRUNCATE TABLE
  attachments, attendance_shift_handovers, attendance_shifts, attendance_punches,
  attendance_imports, attendance_devices, payroll_periods, hr_employees,
  consumption_movements, consumptions, consumable_prices, consumable_catalog,
  chat_messages, chat_conversations, insurance_claims, insurance_companies,
  money_transfers, equipment_usage, monitor_bindings, equipment,
  checkout_requests, checkout_clearances, maintenance_expenses, maintenance_jobs,
  purchase_order_lines, purchase_orders, administrations, order_versions, orders,
  lab_versions, labs, feedings, milk, vitals, notes, tasks, handovers,
  stock_movements, inventory, payments, charges, prices, cash_closures,
  bed_movements, records, idempotency, audit, admissions, patients, beds
RESTART IDENTITY CASCADE;

DELETE FROM sessions WHERE user_id NOT IN ('admin','manager');
DELETE FROM users WHERE id NOT IN ('admin','manager');
DELETE FROM money_accounts WHERE id <> 'cash';
UPDATE money_accounts SET opening_balance=0,active=true WHERE id='cash';
ALTER SEQUENCE purchase_order_number RESTART WITH 1;
INSERT INTO chat_conversations(id,kind) VALUES('department','group');
UPDATE settings SET data=jsonb_set(data - 'training','{mode}','"live"'::jsonb,true)
WHERE id='hospital';

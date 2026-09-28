ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK(status IN('pending','approved','reviewing','received','rejected'));
ALTER TABLE purchase_orders ADD COLUMN invoice_date date;
ALTER TABLE purchase_orders ADD COLUMN review_note text NOT NULL DEFAULT '';
ALTER TABLE purchase_orders ADD COLUMN reviewed_by text REFERENCES users(id);
ALTER TABLE purchase_orders ADD COLUMN reviewed_at timestamptz;

ALTER TABLE purchase_order_lines ADD COLUMN stock_section text NOT NULL DEFAULT 'medical_consumables' CHECK(stock_section IN('general_stock','medical_consumables','supplies'));
ALTER TABLE purchase_order_lines ADD COLUMN delivered_quantity numeric(16,3) CHECK(delivered_quantity IS NULL OR delivered_quantity>0);
ALTER TABLE purchase_order_lines ADD COLUMN delivered_unit_cost numeric(16,2) CHECK(delivered_unit_cost IS NULL OR delivered_unit_cost>=0);
ALTER TABLE purchase_order_lines ADD COLUMN delivered_batch text;
ALTER TABLE purchase_order_lines ADD COLUMN delivered_expires_at date;
ALTER TABLE purchase_order_lines ADD COLUMN delivered_location text;
ALTER TABLE purchase_order_lines ADD COLUMN delivered_min_quantity numeric(16,3) CHECK(delivered_min_quantity IS NULL OR delivered_min_quantity>=0);

ALTER TABLE inventory ADD COLUMN stock_section text NOT NULL DEFAULT 'medical_consumables' CHECK(stock_section IN('general_stock','medical_consumables','supplies'));
ALTER TABLE inventory ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_name_batch_location_key;
ALTER TABLE inventory ADD CONSTRAINT inventory_name_batch_location_section_key UNIQUE(name,batch,location,stock_section);

CREATE INDEX purchase_orders_reviewing ON purchase_orders(status,reviewed_at DESC);
CREATE INDEX inventory_stock_section ON inventory(stock_section,name);
INSERT INTO cost_centers(id,code,name_ar,name_en) VALUES
('cc-medical-consumables','MEDCONS','المستهلكات الطبية','Medical consumables'),
('cc-supplies','SUPPLIES','المستلزمات','Supplies') ON CONFLICT(code) DO NOTHING;

INSERT INTO roles(name,permissions) VALUES('purchasing','["stock.read","purchase.read","purchase.request","purchase.approve","reports.read","print","export"]') ON CONFLICT(name) DO NOTHING;
UPDATE roles SET permissions=permissions || '["purchase.request"]'::jsonb WHERE name='stock' AND NOT permissions @> '["purchase.request"]'::jsonb;

CREATE SEQUENCE stock_request_number START 1;
CREATE TABLE stock_requests(
 id text PRIMARY KEY,
 request_no text UNIQUE NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','fulfilled','rejected','converted_to_purchase')),
 department text NOT NULL,
 notes text NOT NULL DEFAULT '',
 requested_by text NOT NULL REFERENCES users(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 fulfilled_by text REFERENCES users(id),
 fulfilled_at timestamptz,
 rejection_reason text,
 purchase_order_id text REFERENCES purchase_orders(id),
 version integer NOT NULL DEFAULT 1
);
CREATE TABLE stock_request_lines(
 id text PRIMARY KEY,
 stock_request_id text NOT NULL REFERENCES stock_requests(id),
 consumable_id text NOT NULL REFERENCES consumable_catalog(id),
 name_snapshot text NOT NULL,
 unit_snapshot text NOT NULL,
 requested_quantity numeric(16,3) NOT NULL CHECK(requested_quantity>0),
 issued_quantity numeric(16,3) CHECK(issued_quantity IS NULL OR issued_quantity>=0),
 stock_section text NOT NULL CHECK(stock_section IN('general_stock','medical_consumables','supplies'))
);
CREATE TABLE stock_request_issues(
 stock_request_line_id text NOT NULL REFERENCES stock_request_lines(id),
 movement_id text PRIMARY KEY REFERENCES stock_movements(id)
);
CREATE INDEX stock_requests_status ON stock_requests(status,requested_at DESC);
CREATE INDEX stock_request_lines_request ON stock_request_lines(stock_request_id);

ALTER TABLE hr_employees DROP CONSTRAINT IF EXISTS hr_employees_job_type_check;
ALTER TABLE hr_employees ADD CONSTRAINT hr_employees_job_type_check CHECK(job_type IN('doctor','nurse','reception','accountant','purchasing','technician','worker','administration','other'));
ALTER TABLE hr_employees ADD COLUMN whatsapp_phone text;
ALTER TABLE hr_employees ADD COLUMN salary_transfer_method text CHECK(salary_transfer_method IS NULL OR salary_transfer_method IN('cash','bank','wallet','instapay'));
ALTER TABLE hr_employees ADD COLUMN salary_transfer_number text;
ALTER TABLE hr_employees ADD COLUMN fixed_allowance numeric(14,2) NOT NULL DEFAULT 0 CHECK(fixed_allowance>=0);
ALTER TABLE hr_employees ADD COLUMN transport_allowance numeric(14,2) NOT NULL DEFAULT 0 CHECK(transport_allowance>=0);
ALTER TABLE hr_employees ADD COLUMN meal_allowance numeric(14,2) NOT NULL DEFAULT 0 CHECK(meal_allowance>=0);
ALTER TABLE hr_employees ADD COLUMN fixed_incentive numeric(14,2) NOT NULL DEFAULT 0 CHECK(fixed_incentive>=0);
ALTER TABLE hr_employees ADD COLUMN night_shift_rate numeric(14,2) NOT NULL DEFAULT 0 CHECK(night_shift_rate>=0);
ALTER TABLE hr_employees ADD COLUMN fixed_deduction numeric(14,2) NOT NULL DEFAULT 0 CHECK(fixed_deduction>=0);

CREATE TABLE payroll_adjustments(
 id text PRIMARY KEY,
 employee_id text NOT NULL REFERENCES hr_employees(id),
 month text NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 type text NOT NULL CHECK(type IN('allowance','incentive','bonus','night_shift','deduction','advance','other_addition','other_deduction')),
 amount numeric(14,2) NOT NULL CHECK(amount>0),
 notes text NOT NULL,
 actor_id text NOT NULL REFERENCES users(id),
 voided boolean NOT NULL DEFAULT false,
 voided_by text REFERENCES users(id),
 voided_at timestamptz,
 void_reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payroll_adjustments_month_employee ON payroll_adjustments(month,employee_id,created_at);

INSERT INTO schema_migrations(version) VALUES (21) ON CONFLICT DO NOTHING;

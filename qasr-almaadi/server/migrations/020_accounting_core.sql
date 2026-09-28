CREATE TABLE chart_accounts(
 id text PRIMARY KEY,
 code text UNIQUE NOT NULL,
 name_ar text NOT NULL,
 name_en text NOT NULL,
 type text NOT NULL CHECK(type IN('asset','liability','equity','revenue','expense')),
 parent_code text,
 system_key text UNIQUE,
 active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,
 created_by text REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vitals ADD COLUMN bilirubin_total numeric CHECK(bilirubin_total BETWEEN 0 AND 50);
ALTER TABLE vitals ADD COLUMN bilirubin_direct numeric CHECK(bilirubin_direct BETWEEN 0 AND 30);
ALTER TABLE vitals ADD COLUMN bilirubin_method text CHECK(bilirubin_method IS NULL OR bilirubin_method IN('transcutaneous','serum','other'));

INSERT INTO chart_accounts(id,code,name_ar,name_en,type,system_key) VALUES
('acc-cash','1000','الخزنة والبنوك','Cash and banks','asset','money'),
('acc-patient-ar','1100','مدينو المرضى','Patient receivables','asset','patient_receivable'),
('acc-insurance-ar','1110','مدينو التأمين','Insurance receivables','asset','insurance_receivable'),
('acc-inventory','1200','المخزون الطبي','Medical inventory','asset','inventory'),
('acc-supplier-ap','2000','الموردون','Supplier payables','liability','supplier_payable'),
('acc-payroll-ap','2100','رواتب مستحقة','Payroll payable','liability','payroll_payable'),
('acc-equity','3000','حقوق الملكية والأرصدة الافتتاحية','Equity and opening balances','equity','equity'),
('acc-revenue','4000','إيرادات الخدمات والإقامة','Care and service revenue','revenue','revenue'),
('acc-supplies-exp','5000','تكلفة المستهلكات','Consumables expense','expense','consumables_expense'),
('acc-maintenance-exp','5100','مصروفات الصيانة','Maintenance expense','expense','maintenance_expense'),
('acc-payroll-exp','5200','مصروف الرواتب','Payroll expense','expense','payroll_expense'),
('acc-adjustment','5900','تسويات المخزون','Inventory adjustments','expense','inventory_adjustment');

CREATE TABLE cost_centers(
 id text PRIMARY KEY,
 code text UNIQUE NOT NULL,
 name_ar text NOT NULL,
 name_en text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,
 created_by text REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cost_centers(id,code,name_ar,name_en) VALUES
('cc-nicu','NICU','وحدة حديثي الولادة','Neonatal unit'),
('cc-stock','STOCK','المخزون والمشتريات','Inventory and purchasing'),
('cc-maintenance','MAINT','الصيانة','Maintenance'),
('cc-hr','HR','الموظفون والرواتب','Employees and payroll'),
('cc-admin','ADMIN','الإدارة العامة','Administration');

CREATE TABLE suppliers(
 id text PRIMARY KEY,
 code text UNIQUE NOT NULL,
 name text NOT NULL,
 tax_no text,
 contact_name text,
 phone text,
 email text,
 address text,
 payment_terms_days integer NOT NULL DEFAULT 0 CHECK(payment_terms_days BETWEEN 0 AND 3650),
 credit_limit numeric(16,2) NOT NULL DEFAULT 0 CHECK(credit_limit>=0),
 active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE purchase_orders ADD COLUMN supplier_id text REFERENCES suppliers(id);
ALTER TABLE purchase_orders ADD COLUMN settlement text CHECK(settlement IS NULL OR settlement IN('paid','credit'));
ALTER TABLE purchase_orders ADD COLUMN due_date date;

CREATE TABLE supplier_invoices(
 id text PRIMARY KEY,
 invoice_no text NOT NULL,
 supplier_id text NOT NULL REFERENCES suppliers(id),
 purchase_order_id text UNIQUE REFERENCES purchase_orders(id),
 invoice_date date NOT NULL,
 due_date date NOT NULL,
 amount numeric(16,2) NOT NULL CHECK(amount>0),
 notes text NOT NULL DEFAULT '',
 actor_id text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(supplier_id,invoice_no)
);
CREATE TABLE supplier_payments(
 id text PRIMARY KEY,
 supplier_invoice_id text NOT NULL REFERENCES supplier_invoices(id),
 money_account_id text NOT NULL REFERENCES money_accounts(id),
 amount numeric(16,2) NOT NULL CHECK(amount>0),
 method text NOT NULL CHECK(method IN('cash','card','transfer','instapay','wallet')),
 reference text NOT NULL,
 actor_id text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payroll_payments(
 id text PRIMARY KEY,
 payroll_period_id text NOT NULL REFERENCES payroll_periods(id),
 money_account_id text NOT NULL REFERENCES money_accounts(id),
 amount numeric(16,2) NOT NULL CHECK(amount>0),
 method text NOT NULL CHECK(method IN('cash','card','transfer','instapay','wallet')),
 reference text NOT NULL,
 actor_id text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounting_periods(
 id text PRIMARY KEY,
 month text UNIQUE NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','closed')),
 closed_by text REFERENCES users(id),
 closed_at timestamptz,
 close_note text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE manual_journals(
 id text PRIMARY KEY,
 journal_no text UNIQUE NOT NULL,
 journal_date date NOT NULL,
 description text NOT NULL,
 reference text,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','posted','reversed')),
 version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL REFERENCES users(id),
 approved_by text REFERENCES users(id),
 approved_at timestamptz,
 reversal_of text REFERENCES manual_journals(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE manual_journal_number START 1;
CREATE TABLE manual_journal_lines(
 id text PRIMARY KEY,
 journal_id text NOT NULL REFERENCES manual_journals(id) ON DELETE CASCADE,
 account_id text NOT NULL REFERENCES chart_accounts(id),
 cost_center_id text REFERENCES cost_centers(id),
 description text NOT NULL DEFAULT '',
 debit numeric(16,2) NOT NULL DEFAULT 0 CHECK(debit>=0),
 credit numeric(16,2) NOT NULL DEFAULT 0 CHECK(credit>=0),
 CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0))
);
CREATE INDEX supplier_invoice_due ON supplier_invoices(supplier_id,due_date);
CREATE INDEX supplier_payment_invoice ON supplier_payments(supplier_invoice_id,created_at);
CREATE INDEX payroll_payment_period ON payroll_payments(payroll_period_id,created_at);
CREATE INDEX journal_date_status ON manual_journals(journal_date,status);
CREATE INDEX journal_lines_account ON manual_journal_lines(account_id,journal_id);

INSERT INTO schema_migrations(version) VALUES (20) ON CONFLICT DO NOTHING;

CREATE TABLE maintenance_jobs (
 id text PRIMARY KEY,
 equipment_id text REFERENCES equipment(id),
 bed_id text REFERENCES beds(id),
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
 notes text NOT NULL DEFAULT '',
 due_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed')),
 assigned_to text REFERENCES users(id),
 version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 completed_at timestamptz,
 verified_note text,
 CHECK ((equipment_id IS NOT NULL)::integer + (bed_id IS NOT NULL)::integer = 1),
 CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND length(verified_note)>0))
);
CREATE UNIQUE INDEX maintenance_one_equipment_active ON maintenance_jobs(equipment_id) WHERE status='in_progress';
CREATE UNIQUE INDEX maintenance_one_bed_active ON maintenance_jobs(bed_id) WHERE status='in_progress';
CREATE INDEX maintenance_due ON maintenance_jobs(status,due_at);
CREATE TABLE maintenance_expenses (
 id text PRIMARY KEY,
 maintenance_job_id text NOT NULL REFERENCES maintenance_jobs(id),
 money_account_id text NOT NULL REFERENCES money_accounts(id),
 amount numeric(16,2) NOT NULL CHECK (amount>0),
 method text NOT NULL CHECK (method IN ('cash','card','transfer','instapay','wallet')),
 vendor text NOT NULL CHECK (length(vendor) BETWEEN 1 AND 200),
 reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 160),
 notes text NOT NULL DEFAULT '',
 actor_id text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_expense_account ON maintenance_expenses(money_account_id);
CREATE INDEX maintenance_expense_job ON maintenance_expenses(maintenance_job_id,created_at);

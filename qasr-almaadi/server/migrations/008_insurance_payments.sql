CREATE TABLE insurance_companies(id text PRIMARY KEY,code text UNIQUE NOT NULL,name text NOT NULL,contract_number text,contact_name text,phone text,email text,address text,terms text,active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,created_by text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE insurance_claims(id text PRIMARY KEY,admission_id text NOT NULL REFERENCES admissions(id),company_id text NOT NULL REFERENCES insurance_companies(id),company_snapshot jsonb NOT NULL,policy_number text NOT NULL,member_name text,approval_number text,amount numeric NOT NULL CHECK(amount>0),notes text,actor_id text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE payments ADD COLUMN insurance_claim_id text REFERENCES insurance_claims(id);
ALTER TABLE payments ADD COLUMN company_id text REFERENCES insurance_companies(id);
ALTER TABLE payments ADD COLUMN company_snapshot jsonb;
ALTER TABLE payments ADD COLUMN notes text;
CREATE INDEX insurance_claim_admission ON insurance_claims(admission_id,created_at);
CREATE INDEX insurance_collection_claim ON payments(insurance_claim_id);

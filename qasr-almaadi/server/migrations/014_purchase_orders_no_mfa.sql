UPDATE users SET mfa_secret=NULL,mfa_pending=NULL,mfa_enabled=false,mfa_last_counter=-1;

CREATE SEQUENCE purchase_order_number START 1;
CREATE TABLE purchase_orders(
 id text PRIMARY KEY,
 order_no text UNIQUE NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','received','rejected')),
 notes text NOT NULL DEFAULT '',
 approval_note text NOT NULL DEFAULT '',
 supplier text,
 requested_by text NOT NULL REFERENCES users(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 approved_by text REFERENCES users(id),
 approved_at timestamptz,
 received_by text REFERENCES users(id),
 received_at timestamptz,
 money_account_id text REFERENCES money_accounts(id),
 payment_method text CHECK(payment_method IS NULL OR payment_method IN('cash','card','transfer','instapay','wallet')),
 reference text,
 total_amount numeric(16,2) CHECK(total_amount IS NULL OR total_amount>=0),
 version integer NOT NULL DEFAULT 1
);
CREATE TABLE purchase_order_lines(
 id text PRIMARY KEY,
 purchase_order_id text NOT NULL REFERENCES purchase_orders(id),
 consumable_id text NOT NULL REFERENCES consumable_catalog(id),
 name_snapshot text NOT NULL,
 unit_snapshot text NOT NULL,
 requested_quantity numeric(16,3) NOT NULL CHECK(requested_quantity>0),
 received_quantity numeric(16,3) CHECK(received_quantity IS NULL OR received_quantity>0),
 unit_cost numeric(16,2) CHECK(unit_cost IS NULL OR unit_cost>=0),
 batch text,
 expires_at date,
 location text,
 inventory_id text REFERENCES inventory(id)
);
CREATE INDEX purchase_orders_status ON purchase_orders(status,requested_at DESC);
CREATE INDEX purchase_order_lines_order ON purchase_order_lines(purchase_order_id);
UPDATE roles SET permissions=permissions || '["purchase.read","purchase.request"]'::jsonb WHERE name='reception';
UPDATE roles SET permissions=permissions || '["purchase.read","purchase.request","purchase.approve"]'::jsonb WHERE name IN('manager','admin');
UPDATE roles SET permissions=permissions || '["purchase.read","purchase.approve"]'::jsonb WHERE name='accountant';
UPDATE roles SET permissions=permissions || '["purchase.read"]'::jsonb WHERE name='stock';

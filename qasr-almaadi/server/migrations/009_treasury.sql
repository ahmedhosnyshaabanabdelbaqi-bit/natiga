CREATE TABLE money_accounts(id text PRIMARY KEY,name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 160),kind text NOT NULL CHECK(kind IN('cash','bank')),bank_name text,account_number text,opening_balance numeric(16,2) NOT NULL DEFAULT 0 CHECK(opening_balance>=0),active boolean NOT NULL DEFAULT true,created_by text REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),CHECK((kind='cash' AND id='cash' AND bank_name IS NULL AND account_number IS NULL) OR (kind='bank' AND id<>'cash' AND bank_name IS NOT NULL)));
CREATE UNIQUE INDEX money_one_cash ON money_accounts(kind) WHERE kind='cash';
CREATE UNIQUE INDEX money_bank_number ON money_accounts(lower(bank_name),account_number) WHERE kind='bank' AND account_number IS NOT NULL;
INSERT INTO money_accounts(id,name,kind,opening_balance) VALUES('cash','الخزنة الرئيسية','cash',0);
ALTER TABLE payments ADD COLUMN money_account_id text REFERENCES money_accounts(id);
UPDATE payments SET money_account_id='cash' WHERE method='cash';
CREATE INDEX payments_money_account ON payments(money_account_id);
CREATE TABLE money_transfers(id text PRIMARY KEY,from_account_id text NOT NULL REFERENCES money_accounts(id),to_account_id text NOT NULL REFERENCES money_accounts(id),amount numeric(16,2) NOT NULL CHECK(amount>0),reference text NOT NULL CHECK(char_length(reference) BETWEEN 1 AND 160),notes text NOT NULL DEFAULT '',actor_id text NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),CHECK(from_account_id='cash' AND to_account_id<>'cash'));
CREATE INDEX money_transfers_account ON money_transfers(to_account_id,created_at);

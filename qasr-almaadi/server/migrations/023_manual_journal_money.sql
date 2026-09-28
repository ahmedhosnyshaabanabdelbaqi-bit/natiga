-- Legacy monetary lines remain unallocated, so no account balance is invented.
ALTER TABLE manual_journal_lines ADD COLUMN money_account_id text REFERENCES money_accounts(id);
CREATE INDEX manual_journal_money_account ON manual_journal_lines(money_account_id) WHERE money_account_id IS NOT NULL;

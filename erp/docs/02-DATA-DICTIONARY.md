# قاموس البيانات — نظام محمد فياض لإدارة التوزيع

> مولّد آليًا من مخطط قاعدة البيانات الفعلي.
> كل المبالغ `numeric(18,4)` وكل الكميات والتكاليف `numeric(20,6)` — لا يُستخدم `float` في أي نتيجة مالية.


## الأساس والصلاحيات

### `companies`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `code` | varchar(30) | لا | — |
| `name_ar` | varchar(255) | لا | — |
| `name_en` | varchar(255) | نعم | — |
| `legal_name` | varchar(255) | نعم | — |
| `tax_number` | varchar(50) | نعم | — |
| `commercial_register` | varchar(50) | نعم | — |
| `logo_path` | varchar(255) | نعم | — |
| `phone` | varchar(50) | نعم | — |
| `email` | varchar(255) | نعم | — |
| `address` | text | نعم | — |
| `currency_code` | varchar(3) | لا | — |
| `timezone` | varchar(64) | لا | — |
| `locale` | varchar(8) | لا | — |
| `cost_method` | varchar(20) | لا | — |
| `money_scale` | smallint | لا | — |
| `qty_scale` | smallint | لا | — |
| `settings` | jsonb | نعم | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `companies_pkey` (id)
- `companies_code_unique` (code)

### `branches`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `code` | varchar(30) | لا | — |
| `name` | varchar(255) | لا | — |
| `phone` | varchar(50) | نعم | — |
| `address` | text | نعم | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `branches_pkey` (id)
- `branches_company_id_code_unique` (company_id, code)

### `users`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | نعم | companies |
| `branch_id` | bigint | نعم | branches |
| `name` | varchar(255) | لا | — |
| `username` | varchar(60) | لا | — |
| `email` | varchar(255) | نعم | — |
| `phone` | varchar(50) | نعم | — |
| `email_verified_at` | timestamp without time zone | نعم | — |
| `password` | varchar(255) | لا | — |
| `is_active` | boolean | لا | — |
| `must_change_password` | boolean | لا | — |
| `is_super_admin` | boolean | لا | — |
| `locale` | varchar(8) | لا | — |
| `mfa_secret` | varchar(255) | نعم | — |
| `mfa_enabled` | boolean | لا | — |
| `last_login_at` | timestamp without time zone | نعم | — |
| `remember_token` | varchar(100) | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |
| `deleted_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `users_pkey` (id)
- `users_username_unique` (username)
- `users_email_unique` (email)

### `roles`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | نعم | companies |
| `code` | varchar(60) | لا | — |
| `name_ar` | varchar(255) | لا | — |
| `name_en` | varchar(255) | نعم | — |
| `is_system` | boolean | لا | — |
| `description` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `roles_pkey` (id)
- `roles_company_id_code_unique` (company_id, code)

### `permissions`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `code` | varchar(100) | لا | — |
| `module` | varchar(50) | لا | — |
| `name_ar` | varchar(255) | لا | — |
| `name_en` | varchar(255) | نعم | — |
| `is_sensitive` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `permissions_pkey` (id)
- `permissions_code_unique` (code)

### `permission_role`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `role_id` | bigint | لا | roles |
| `permission_id` | bigint | لا | permissions |

**قيود عدم التكرار:**
- `permission_role_pkey` (id)
- `permission_role_role_id_permission_id_unique` (role_id, permission_id)

### `role_user`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `role_id` | bigint | لا | roles |
| `user_id` | bigint | لا | users |

**قيود عدم التكرار:**
- `role_user_pkey` (id)
- `role_user_role_id_user_id_unique` (role_id, user_id)

### `user_scopes`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `user_id` | bigint | لا | users |
| `scope_type` | varchar(30) | لا | — |
| `scope_id` | bigint | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `user_scopes_pkey` (id)
- `user_scopes_user_id_scope_type_scope_id_unique` (user_id, scope_type, scope_id)

### `settings`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | نعم | companies |
| `key` | varchar(120) | لا | — |
| `value` | jsonb | نعم | — |
| `group` | varchar(60) | لا | — |
| `description` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `settings_pkey` (id)
- `settings_company_id_key_unique` (company_id, key)

### `document_sequences`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `doc_type` | varchar(50) | لا | — |
| `prefix` | varchar(20) | لا | — |
| `next_no` | bigint | لا | — |
| `padding` | smallint | لا | — |
| `reset_period` | varchar(20) | لا | — |
| `period_key` | varchar(20) | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `document_sequences_pkey` (id)
- `document_sequences_company_id_branch_id_doc_type_unique` (company_id, branch_id, doc_type)

### `audit_logs`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | نعم | companies |
| `user_id` | bigint | نعم | users |
| `user_label` | varchar(255) | نعم | — |
| `action` | varchar(60) | لا | — |
| `entity_type` | varchar(80) | لا | — |
| `entity_id` | bigint | نعم | — |
| `entity_no` | varchar(60) | نعم | — |
| `before` | jsonb | نعم | — |
| `after` | jsonb | نعم | — |
| `reason` | text | نعم | — |
| `ip_address` | varchar(45) | نعم | — |
| `user_agent` | varchar(500) | نعم | — |
| `created_at` | timestamp without time zone | لا | — |

**قيود عدم التكرار:**
- `audit_logs_pkey` (id)

### `attachments`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `entity_type` | varchar(80) | لا | — |
| `entity_id` | bigint | لا | — |
| `disk` | varchar(30) | لا | — |
| `path` | varchar(255) | لا | — |
| `original_name` | varchar(255) | لا | — |
| `mime_type` | varchar(120) | نعم | — |
| `size_bytes` | bigint | لا | — |
| `sha256` | varchar(64) | نعم | — |
| `uploaded_by` | bigint | نعم | users |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `attachments_pkey` (id)

### `personal_access_tokens`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `tokenable_type` | varchar(255) | لا | — |
| `tokenable_id` | bigint | لا | — |
| `name` | text | لا | — |
| `token` | varchar(64) | لا | — |
| `abilities` | text | نعم | — |
| `last_used_at` | timestamp without time zone | نعم | — |
| `expires_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `personal_access_tokens_pkey` (id)
- `personal_access_tokens_token_unique` (token)

### `sessions`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | varchar(255) | لا | — |
| `user_id` | bigint | نعم | — |
| `ip_address` | varchar(45) | نعم | — |
| `user_agent` | text | نعم | — |
| `payload` | text | لا | — |
| `last_activity` | integer | لا | — |

**قيود عدم التكرار:**
- `sessions_pkey` (id)

### `password_reset_tokens`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `email` | varchar(255) | لا | — |
| `token` | varchar(255) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `password_reset_tokens_pkey` (email)

## الحسابات

### `accounts`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `parent_id` | bigint | نعم | accounts |
| `code` | varchar(40) | لا | — |
| `name_ar` | varchar(255) | لا | — |
| `name_en` | varchar(255) | نعم | — |
| `type` | varchar(20) | لا | — |
| `nature` | varchar(10) | لا | — |
| `is_leaf` | boolean | لا | — |
| `is_active` | boolean | لا | — |
| `control_type` | varchar(30) | لا | — |
| `require_cost_center` | boolean | لا | — |
| `level` | smallint | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `accounts_pkey` (id)
- `accounts_company_id_code_unique` (company_id, code)

### `cost_centers`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `parent_id` | bigint | نعم | cost_centers |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `type` | varchar(30) | لا | — |
| `ref_id` | bigint | نعم | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `cost_centers_pkey` (id)
- `cost_centers_company_id_code_unique` (company_id, code)

### `fiscal_years`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `name` | varchar(40) | لا | — |
| `start_date` | date | لا | — |
| `end_date` | date | لا | — |
| `status` | varchar(20) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `fiscal_years_pkey` (id)
- `fiscal_years_company_id_name_unique` (company_id, name)

### `fiscal_periods`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `fiscal_year_id` | bigint | لا | fiscal_years |
| `name` | varchar(40) | لا | — |
| `start_date` | date | لا | — |
| `end_date` | date | لا | — |
| `status` | varchar(20) | لا | — |
| `closed_by` | bigint | نعم | users |
| `closed_at` | timestamp without time zone | نعم | — |
| `reopen_reason` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `fiscal_periods_pkey` (id)

### `journal_entries`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `fiscal_period_id` | bigint | نعم | fiscal_periods |
| `entry_no` | varchar(40) | لا | — |
| `entry_date` | date | لا | — |
| `doc_date` | date | نعم | — |
| `source_type` | varchar(60) | نعم | — |
| `source_id` | bigint | نعم | — |
| `source_no` | varchar(60) | نعم | — |
| `entry_type` | varchar(30) | لا | — |
| `reverses_entry_id` | bigint | نعم | journal_entries |
| `total_debit` | numeric(18,4) | لا | — |
| `total_credit` | numeric(18,4) | لا | — |
| `currency_code` | varchar(3) | لا | — |
| `description` | text | نعم | — |
| `status` | varchar(20) | لا | — |
| `created_by` | bigint | نعم | users |
| `posted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `journal_entries_pkey` (id)
- `journal_entries_company_id_entry_no_unique` (company_id, entry_no)
- `je_source_unique` (company_id, source_type, source_id, entry_type)

**قيود التحقق:**
- `je_balanced`: `CHECK ((((status)::text <> 'posted'::text) OR (total_debit = total_credit)))`

### `journal_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `journal_entry_id` | bigint | لا | journal_entries |
| `company_id` | bigint | لا | companies |
| `line_no` | smallint | لا | — |
| `account_id` | bigint | لا | accounts |
| `cost_center_id` | bigint | نعم | cost_centers |
| `debit` | numeric(18,4) | لا | — |
| `credit` | numeric(18,4) | لا | — |
| `partner_type` | varchar(30) | نعم | — |
| `partner_id` | bigint | نعم | — |
| `due_date` | date | نعم | — |
| `description` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `journal_lines_pkey` (id)

**قيود التحقق:**
- `jl_debit_xor_credit`: `CHECK (((debit >= (0)::numeric) AND (credit >= (0)::numeric) AND (NOT ((debit > (0)::numeric) AND (credit > (0)::numeric)))))`

### `cash_boxes`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `account_id` | bigint | لا | accounts |
| `code` | varchar(30) | لا | — |
| `name` | varchar(255) | لا | — |
| `currency_code` | varchar(3) | لا | — |
| `type` | varchar(20) | لا | — |
| `owner_user_id` | bigint | نعم | users |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `cash_boxes_pkey` (id)
- `cash_boxes_company_id_code_unique` (company_id, code)

### `bank_accounts`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `account_id` | bigint | لا | accounts |
| `code` | varchar(30) | لا | — |
| `name` | varchar(255) | لا | — |
| `bank_name` | varchar(255) | نعم | — |
| `account_number` | varchar(60) | نعم | — |
| `iban` | varchar(60) | نعم | — |
| `currency_code` | varchar(3) | لا | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `bank_accounts_pkey` (id)
- `bank_accounts_company_id_code_unique` (company_id, code)

### `cheques`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `direction` | varchar(10) | لا | — |
| `cheque_no` | varchar(60) | لا | — |
| `bank_name` | varchar(255) | نعم | — |
| `amount` | numeric(18,4) | لا | — |
| `issue_date` | date | لا | — |
| `due_date` | date | لا | — |
| `partner_type` | varchar(30) | نعم | — |
| `partner_id` | bigint | نعم | — |
| `bank_account_id` | bigint | نعم | bank_accounts |
| `status` | varchar(20) | لا | — |
| `source_type` | varchar(60) | نعم | — |
| `source_id` | bigint | نعم | — |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `cheques_pkey` (id)
- `cheques_company_id_direction_cheque_no_unique` (company_id, direction, cheque_no)

### `cheque_events`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `cheque_id` | bigint | لا | cheques |
| `from_status` | varchar(20) | نعم | — |
| `to_status` | varchar(20) | لا | — |
| `event_date` | date | لا | — |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `user_id` | bigint | نعم | users |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `cheque_events_pkey` (id)

### `tax_codes`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `code` | varchar(30) | لا | — |
| `name_ar` | varchar(255) | لا | — |
| `rate` | numeric(9,6) | لا | — |
| `is_inclusive` | boolean | لا | — |
| `valid_from` | date | لا | — |
| `valid_to` | date | نعم | — |
| `output_account_id` | bigint | نعم | accounts |
| `input_account_id` | bigint | نعم | accounts |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `tax_codes_pkey` (id)
- `tax_codes_company_id_code_valid_from_unique` (company_id, code, valid_from)

### `posting_rules`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `doc_type` | varchar(60) | لا | — |
| `role_key` | varchar(60) | لا | — |
| `account_id` | bigint | لا | accounts |
| `notes` | text | نعم | — |
| `is_reviewed` | boolean | لا | — |
| `reviewed_by` | bigint | نعم | users |
| `reviewed_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `posting_rules_pkey` (id)
- `posting_rules_company_id_doc_type_role_key_unique` (company_id, doc_type, role_key)

## الأصناف والتسعير

### `uoms`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `code` | varchar(30) | لا | — |
| `name_ar` | varchar(255) | لا | — |
| `name_en` | varchar(255) | نعم | — |
| `dimension` | varchar(20) | لا | — |
| `allow_fraction` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `uoms_pkey` (id)
- `uoms_company_id_code_unique` (company_id, code)

### `item_categories`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `parent_id` | bigint | نعم | item_categories |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `item_categories_pkey` (id)
- `item_categories_company_id_code_unique` (company_id, code)

### `brands`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `brands_pkey` (id)
- `brands_company_id_code_unique` (company_id, code)

### `items`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `code` | varchar(60) | لا | — |
| `name_ar` | varchar(255) | لا | — |
| `name_en` | varchar(255) | نعم | — |
| `category_id` | bigint | نعم | item_categories |
| `brand_id` | bigint | نعم | brands |
| `base_uom_id` | bigint | لا | uoms |
| `tax_code_id` | bigint | نعم | tax_codes |
| `track_batches` | boolean | لا | — |
| `track_serials` | boolean | لا | — |
| `track_expiry` | boolean | لا | — |
| `is_reel` | boolean | لا | — |
| `is_weighted` | boolean | لا | — |
| `has_variants` | boolean | لا | — |
| `shelf_life_days` | smallint | نعم | — |
| `block_sale_days_before_expiry` | smallint | لا | — |
| `reorder_point` | numeric(20,6) | لا | — |
| `reorder_qty` | numeric(20,6) | لا | — |
| `lead_time_days` | smallint | لا | — |
| `storage_condition` | varchar(60) | نعم | — |
| `image_path` | varchar(255) | نعم | — |
| `attributes` | jsonb | نعم | — |
| `is_active` | boolean | لا | — |
| `is_purchasable` | boolean | لا | — |
| `is_sellable` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |
| `deleted_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `items_pkey` (id)
- `items_company_id_code_unique` (company_id, code)

### `item_variants`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `item_id` | bigint | لا | items |
| `sku` | varchar(60) | لا | — |
| `color` | varchar(60) | نعم | — |
| `size` | varchar(60) | نعم | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `item_variants_pkey` (id)
- `item_variants_item_id_sku_unique` (item_id, sku)

### `item_uoms`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `factor` | numeric(20,6) | لا | — |
| `is_base` | boolean | لا | — |
| `is_sales_default` | boolean | لا | — |
| `is_purchase_default` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `item_uoms_pkey` (id)
- `item_uoms_item_id_uom_id_unique` (item_id, uom_id)

**قيود التحقق:**
- `iu_factor_positive`: `CHECK ((factor > (0)::numeric))`

### `item_barcodes`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `item_id` | bigint | لا | items |
| `item_uom_id` | bigint | نعم | item_uoms |
| `item_variant_id` | bigint | نعم | item_variants |
| `barcode` | varchar(80) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `item_barcodes_pkey` (id)
- `item_barcodes_company_id_barcode_unique` (company_id, barcode)

### `price_lists`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `type` | varchar(30) | لا | — |
| `currency_code` | varchar(3) | لا | — |
| `prices_include_tax` | boolean | لا | — |
| `priority` | smallint | لا | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `price_lists_pkey` (id)
- `price_lists_company_id_code_unique` (company_id, code)

### `price_list_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `price_list_id` | bigint | لا | price_lists |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `min_qty` | numeric(20,6) | لا | — |
| `price` | numeric(18,4) | لا | — |
| `max_discount_pct` | numeric(9,4) | لا | — |
| `valid_from` | date | لا | — |
| `valid_to` | date | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `price_list_lines_pkey` (id)

### `customer_prices`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `customer_id` | bigint | لا | customers |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `min_qty` | numeric(20,6) | لا | — |
| `price` | numeric(18,4) | لا | — |
| `valid_from` | date | لا | — |
| `valid_to` | date | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `customer_prices_pkey` (id)

### `promotions`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `type` | varchar(30) | لا | — |
| `valid_from` | date | لا | — |
| `valid_to` | date | نعم | — |
| `priority` | smallint | لا | — |
| `stackable` | boolean | لا | — |
| `conditions` | jsonb | نعم | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `promotions_pkey` (id)
- `promotions_company_id_code_unique` (company_id, code)

### `promotion_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `promotion_id` | bigint | لا | promotions |
| `item_id` | bigint | نعم | items |
| `category_id` | bigint | نعم | item_categories |
| `buy_uom_id` | bigint | نعم | uoms |
| `buy_qty` | numeric(20,6) | لا | — |
| `free_item_id` | bigint | نعم | items |
| `free_uom_id` | bigint | نعم | uoms |
| `free_qty` | numeric(20,6) | لا | — |
| `discount_pct` | numeric(9,4) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `promotion_lines_pkey` (id)

## العملاء والموردون والمناديب

### `regions`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `parent_id` | bigint | نعم | regions |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `regions_pkey` (id)
- `regions_company_id_code_unique` (company_id, code)

### `suppliers`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `account_id` | bigint | نعم | accounts |
| `tax_number` | varchar(50) | نعم | — |
| `phone` | varchar(50) | نعم | — |
| `email` | varchar(255) | نعم | — |
| `address` | text | نعم | — |
| `contact_person` | varchar(255) | نعم | — |
| `payment_term_days` | smallint | لا | — |
| `lead_time_days` | smallint | لا | — |
| `opening_balance` | numeric(18,4) | لا | — |
| `rating` | smallint | نعم | — |
| `is_active` | boolean | لا | — |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |
| `deleted_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `suppliers_pkey` (id)
- `suppliers_company_id_code_unique` (company_id, code)

### `item_suppliers`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `item_id` | bigint | لا | items |
| `supplier_id` | bigint | لا | suppliers |
| `supplier_item_code` | varchar(60) | نعم | — |
| `last_price` | numeric(18,4) | نعم | — |
| `is_preferred` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `item_suppliers_pkey` (id)
- `item_suppliers_item_id_supplier_id_unique` (item_id, supplier_id)

### `vehicles`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `code` | varchar(40) | لا | — |
| `plate_no` | varchar(40) | لا | — |
| `model` | varchar(255) | نعم | — |
| `capacity_weight_kg` | numeric(18,4) | نعم | — |
| `capacity_volume_m3` | numeric(18,4) | نعم | — |
| `cost_center_id` | bigint | نعم | cost_centers |
| `license_expiry` | date | نعم | — |
| `next_maintenance_date` | date | نعم | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `vehicles_pkey` (id)
- `vehicles_company_id_code_unique` (company_id, code)

### `vehicle_maintenance`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `vehicle_id` | bigint | لا | vehicles |
| `service_date` | date | لا | — |
| `type` | varchar(40) | لا | — |
| `cost` | numeric(18,4) | لا | — |
| `odometer` | bigint | نعم | — |
| `next_due_date` | date | نعم | — |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `vehicle_maintenance_pkey` (id)

### `salesmen`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `user_id` | bigint | نعم | users |
| `supervisor_id` | bigint | نعم | salesmen |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `phone` | varchar(50) | نعم | — |
| `primary_role` | varchar(20) | لا | — |
| `capabilities` | jsonb | نعم | — |
| `vehicle_id` | bigint | نعم | vehicles |
| `warehouse_id` | bigint | نعم | warehouses |
| `custody_cash_box_id` | bigint | نعم | cash_boxes |
| `max_discount_pct` | numeric(9,4) | لا | — |
| `cash_custody_limit` | numeric(18,4) | لا | — |
| `commission_base_pct` | numeric(9,4) | لا | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `salesmen_pkey` (id)
- `salesmen_company_id_code_unique` (company_id, code)

### `routes`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `region_id` | bigint | نعم | regions |
| `salesman_id` | bigint | نعم | salesmen |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `routes_pkey` (id)
- `routes_company_id_code_unique` (company_id, code)

### `customers`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `parent_id` | bigint | نعم | customers |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `account_id` | bigint | نعم | accounts |
| `business_type` | varchar(30) | لا | — |
| `region_id` | bigint | نعم | regions |
| `route_id` | bigint | نعم | routes |
| `salesman_id` | bigint | نعم | salesmen |
| `price_list_id` | bigint | نعم | price_lists |
| `default_discount_pct` | numeric(9,4) | لا | — |
| `payment_term_days` | smallint | لا | — |
| `credit_limit` | numeric(18,4) | لا | — |
| `credit_limit_enforced` | boolean | لا | — |
| `opening_balance` | numeric(18,4) | لا | — |
| `is_cash_customer` | boolean | لا | — |
| `is_blocked` | boolean | لا | — |
| `block_reason` | text | نعم | — |
| `tax_number` | varchar(50) | نعم | — |
| `phone` | varchar(50) | نعم | — |
| `email` | varchar(255) | نعم | — |
| `address` | text | نعم | — |
| `latitude` | numeric(10,7) | نعم | — |
| `longitude` | numeric(10,7) | نعم | — |
| `grade` | varchar(5) | نعم | — |
| `last_visit_date` | date | نعم | — |
| `last_sale_date` | date | نعم | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |
| `deleted_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `customers_pkey` (id)
- `customers_company_id_code_unique` (company_id, code)

### `customer_addresses`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `customer_id` | bigint | لا | customers |
| `label` | varchar(60) | لا | — |
| `address` | text | لا | — |
| `phone` | varchar(50) | نعم | — |
| `latitude` | numeric(10,7) | نعم | — |
| `longitude` | numeric(10,7) | نعم | — |
| `is_default` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `customer_addresses_pkey` (id)

### `customer_contacts`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `customer_id` | bigint | لا | customers |
| `name` | varchar(255) | لا | — |
| `position` | varchar(60) | نعم | — |
| `phone` | varchar(50) | نعم | — |
| `email` | varchar(255) | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `customer_contacts_pkey` (id)

### `customer_assignments`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `customer_id` | bigint | لا | customers |
| `salesman_id` | bigint | لا | salesmen |
| `from_date` | date | لا | — |
| `to_date` | date | نعم | — |
| `assigned_by` | bigint | نعم | users |
| `reason` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `customer_assignments_pkey` (id)

### `customer_complaints`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `customer_id` | bigint | لا | customers |
| `complaint_no` | varchar(40) | لا | — |
| `subject` | varchar(255) | لا | — |
| `body` | text | نعم | — |
| `status` | varchar(20) | لا | — |
| `priority` | varchar(20) | لا | — |
| `assigned_to` | bigint | نعم | users |
| `created_by` | bigint | نعم | users |
| `resolved_at` | timestamp without time zone | نعم | — |
| `resolution` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `customer_complaints_pkey` (id)
- `customer_complaints_company_id_complaint_no_unique` (company_id, complaint_no)

## المخازن

### `warehouses`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `type` | varchar(20) | لا | — |
| `vehicle_id` | bigint | نعم | vehicles |
| `salesman_id` | bigint | نعم | salesmen |
| `keeper_user_id` | bigint | نعم | users |
| `cost_center_id` | bigint | نعم | cost_centers |
| `is_sellable` | boolean | لا | — |
| `allow_negative` | boolean | لا | — |
| `address` | text | نعم | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `warehouses_pkey` (id)
- `warehouses_company_id_code_unique` (company_id, code)

### `warehouse_locations`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `warehouse_id` | bigint | لا | warehouses |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | نعم | — |
| `zone` | varchar(40) | نعم | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `warehouse_locations_pkey` (id)
- `warehouse_locations_warehouse_id_code_unique` (warehouse_id, code)

### `stock_batches`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `item_id` | bigint | لا | items |
| `batch_no` | varchar(60) | لا | — |
| `mfg_date` | date | نعم | — |
| `expiry_date` | date | نعم | — |
| `supplier_id` | bigint | نعم | suppliers |
| `source_doc_type` | varchar(60) | نعم | — |
| `source_doc_id` | bigint | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `stock_batches_pkey` (id)
- `stock_batches_company_id_item_id_batch_no_unique` (company_id, item_id, batch_no)

### `stock_serials`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `item_id` | bigint | لا | items |
| `batch_id` | bigint | نعم | stock_batches |
| `serial_no` | varchar(80) | لا | — |
| `warehouse_id` | bigint | نعم | warehouses |
| `status` | varchar(20) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `stock_serials_pkey` (id)
- `stock_serials_company_id_item_id_serial_no_unique` (company_id, item_id, serial_no)

### `stock_movements`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `item_id` | bigint | لا | items |
| `warehouse_id` | bigint | لا | warehouses |
| `location_id` | bigint | نعم | warehouse_locations |
| `batch_id` | bigint | نعم | stock_batches |
| `status_bucket` | varchar(20) | لا | — |
| `doc_type` | varchar(60) | لا | — |
| `doc_id` | bigint | لا | — |
| `doc_line_id` | bigint | نعم | — |
| `doc_no` | varchar(60) | نعم | — |
| `direction` | varchar(4) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `uom_id` | bigint | نعم | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `qty_in_uom` | numeric(20,6) | نعم | — |
| `unit_cost` | numeric(20,6) | لا | — |
| `total_cost` | numeric(18,4) | لا | — |
| `movement_date` | date | لا | — |
| `posted_at` | timestamp without time zone | لا | — |
| `created_by` | bigint | نعم | users |
| `notes` | text | نعم | — |

**قيود عدم التكرار:**
- `stock_movements_pkey` (id)

**قيود التحقق:**
- `sm_direction_valid`: `CHECK (((direction)::text = ANY ((ARRAY['in'::character varying, 'out'::character varying])::text[])))`
- `sm_qty_positive`: `CHECK ((qty_base > (0)::numeric))`

### `stock_balances`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `item_id` | bigint | لا | items |
| `warehouse_id` | bigint | لا | warehouses |
| `location_id` | bigint | نعم | warehouse_locations |
| `batch_id` | bigint | نعم | stock_batches |
| `status_bucket` | varchar(20) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `total_value` | numeric(18,4) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `stock_balances_pkey` (id)
- `stock_balances_key_unique` (company_id, item_id, warehouse_id, COALESCE(location_id, (0)::bigint), COALESCE(batch_id, (0)::bigint), status_bucket)

**قيود التحقق:**
- `stock_balances_non_negative`: `CHECK ((qty_base >= (0)::numeric))`

### `stock_reservations`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `item_id` | bigint | لا | items |
| `warehouse_id` | bigint | لا | warehouses |
| `batch_id` | bigint | نعم | stock_batches |
| `qty_base` | numeric(20,6) | لا | — |
| `doc_type` | varchar(60) | لا | — |
| `doc_id` | bigint | لا | — |
| `doc_line_id` | bigint | نعم | — |
| `status` | varchar(20) | لا | — |
| `expires_at` | timestamp without time zone | نعم | — |
| `created_by` | bigint | نعم | users |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `stock_reservations_pkey` (id)

**قيود التحقق:**
- `sr_qty_positive`: `CHECK ((qty_base > (0)::numeric))`

### `item_costs`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `item_id` | bigint | لا | items |
| `qty_on_hand` | numeric(20,6) | لا | — |
| `total_value` | numeric(18,4) | لا | — |
| `avg_cost` | numeric(20,6) | لا | — |
| `method` | varchar(20) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `item_costs_pkey` (id)
- `item_costs_company_id_item_id_unique` (company_id, item_id)

### `item_cost_history`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `item_id` | bigint | لا | items |
| `doc_type` | varchar(60) | لا | — |
| `doc_id` | bigint | لا | — |
| `qty_change` | numeric(20,6) | لا | — |
| `value_change` | numeric(18,4) | لا | — |
| `qty_after` | numeric(20,6) | لا | — |
| `value_after` | numeric(18,4) | لا | — |
| `avg_cost_before` | numeric(20,6) | لا | — |
| `avg_cost_after` | numeric(20,6) | لا | — |
| `created_at` | timestamp without time zone | لا | — |

**قيود عدم التكرار:**
- `item_cost_history_pkey` (id)

### `stock_transfers`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `transfer_no` | varchar(40) | لا | — |
| `transfer_date` | date | لا | — |
| `from_warehouse_id` | bigint | لا | warehouses |
| `to_warehouse_id` | bigint | لا | warehouses |
| `status` | varchar(30) | لا | — |
| `purpose` | varchar(30) | لا | — |
| `load_order_id` | bigint | نعم | load_orders |
| `driver_user_id` | bigint | نعم | users |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `sent_by` | bigint | نعم | users |
| `sent_at` | timestamp without time zone | نعم | — |
| `received_by` | bigint | نعم | users |
| `received_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `stock_transfers_pkey` (id)
- `stock_transfers_company_id_transfer_no_unique` (company_id, transfer_no)

**قيود التحقق:**
- `st_diff_warehouses`: `CHECK ((from_warehouse_id <> to_warehouse_id))`

### `stock_transfer_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `stock_transfer_id` | bigint | لا | stock_transfers |
| `line_no` | smallint | لا | — |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `batch_id` | bigint | نعم | stock_batches |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `received_qty_base` | numeric(20,6) | لا | — |
| `shortage_qty_base` | numeric(20,6) | لا | — |
| `excess_qty_base` | numeric(20,6) | لا | — |
| `received_status_bucket` | varchar(20) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `stock_transfer_lines_pkey` (id)

### `stock_adjustments`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `adjustment_no` | varchar(40) | لا | — |
| `adjustment_date` | date | لا | — |
| `warehouse_id` | bigint | لا | warehouses |
| `reason_type` | varchar(30) | لا | — |
| `status` | varchar(20) | لا | — |
| `reason` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `approved_by` | bigint | نعم | users |
| `approved_at` | timestamp without time zone | نعم | — |
| `posted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `stock_adjustments_pkey` (id)
- `stock_adjustments_company_id_adjustment_no_unique` (company_id, adjustment_no)

### `stock_adjustment_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `stock_adjustment_id` | bigint | لا | stock_adjustments |
| `line_no` | smallint | لا | — |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `batch_id` | bigint | نعم | stock_batches |
| `from_status_bucket` | varchar(20) | نعم | — |
| `to_status_bucket` | varchar(20) | نعم | — |
| `direction` | varchar(4) | لا | — |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `unit_cost` | numeric(20,6) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `stock_adjustment_lines_pkey` (id)

### `inventory_counts`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `count_no` | varchar(40) | لا | — |
| `count_date` | date | لا | — |
| `warehouse_id` | bigint | لا | warehouses |
| `type` | varchar(20) | لا | — |
| `is_blind` | boolean | لا | — |
| `status` | varchar(20) | لا | — |
| `frozen_at` | timestamp without time zone | نعم | — |
| `created_by` | bigint | نعم | users |
| `approved_by` | bigint | نعم | users |
| `approved_at` | timestamp without time zone | نعم | — |
| `stock_adjustment_id` | bigint | نعم | stock_adjustments |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `inventory_counts_pkey` (id)
- `inventory_counts_company_id_count_no_unique` (company_id, count_no)

### `inventory_count_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `inventory_count_id` | bigint | لا | inventory_counts |
| `item_id` | bigint | لا | items |
| `batch_id` | bigint | نعم | stock_batches |
| `location_id` | bigint | نعم | warehouse_locations |
| `status_bucket` | varchar(20) | لا | — |
| `system_qty_base` | numeric(20,6) | لا | — |
| `counted_qty_base` | numeric(20,6) | نعم | — |
| `movement_during_count` | numeric(20,6) | لا | — |
| `variance_qty_base` | numeric(20,6) | لا | — |
| `unit_cost` | numeric(20,6) | لا | — |
| `variance_value` | numeric(18,4) | لا | — |
| `counted_by` | bigint | نعم | users |
| `counted_at` | timestamp without time zone | نعم | — |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `inventory_count_lines_pkey` (id)

## المشتريات

### `purchase_requests`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `request_no` | varchar(40) | لا | — |
| `request_date` | date | لا | — |
| `warehouse_id` | bigint | نعم | warehouses |
| `status` | varchar(30) | لا | — |
| `source` | varchar(30) | لا | — |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `approved_by` | bigint | نعم | users |
| `approved_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `purchase_requests_pkey` (id)
- `purchase_requests_company_id_request_no_unique` (company_id, request_no)

### `purchase_request_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `purchase_request_id` | bigint | لا | purchase_requests |
| `line_no` | smallint | لا | — |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `ordered_qty_base` | numeric(20,6) | لا | — |
| `required_date` | date | نعم | — |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `purchase_request_lines_pkey` (id)

### `supplier_quotes`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `quote_no` | varchar(40) | لا | — |
| `quote_date` | date | لا | — |
| `supplier_id` | bigint | لا | suppliers |
| `purchase_request_id` | bigint | نعم | purchase_requests |
| `valid_until` | date | نعم | — |
| `lead_time_days` | smallint | لا | — |
| `total_amount` | numeric(18,4) | لا | — |
| `status` | varchar(20) | لا | — |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `supplier_quotes_pkey` (id)
- `supplier_quotes_company_id_quote_no_unique` (company_id, quote_no)

### `supplier_quote_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `supplier_quote_id` | bigint | لا | supplier_quotes |
| `line_no` | smallint | لا | — |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `qty_uom` | numeric(20,6) | لا | — |
| `unit_price` | numeric(18,4) | لا | — |
| `line_total` | numeric(18,4) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `supplier_quote_lines_pkey` (id)

### `purchase_orders`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `order_no` | varchar(40) | لا | — |
| `order_date` | date | لا | — |
| `expected_date` | date | نعم | — |
| `supplier_id` | bigint | لا | suppliers |
| `warehouse_id` | bigint | لا | warehouses |
| `purchase_request_id` | bigint | نعم | purchase_requests |
| `supplier_quote_id` | bigint | نعم | supplier_quotes |
| `payment_type` | varchar(20) | لا | — |
| `payment_term_days` | smallint | لا | — |
| `status` | varchar(30) | لا | — |
| `receipt_status` | varchar(30) | لا | — |
| `subtotal` | numeric(18,4) | لا | — |
| `discount_amount` | numeric(18,4) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `total_amount` | numeric(18,4) | لا | — |
| `currency_code` | varchar(3) | لا | — |
| `exchange_rate` | numeric(18,8) | لا | — |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `approved_by` | bigint | نعم | users |
| `approved_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `purchase_orders_pkey` (id)
- `purchase_orders_company_id_order_no_unique` (company_id, order_no)

### `purchase_order_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `purchase_order_id` | bigint | لا | purchase_orders |
| `line_no` | smallint | لا | — |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `received_qty_base` | numeric(20,6) | لا | — |
| `invoiced_qty_base` | numeric(20,6) | لا | — |
| `unit_price` | numeric(18,4) | لا | — |
| `discount_pct` | numeric(9,4) | لا | — |
| `discount_amount` | numeric(18,4) | لا | — |
| `tax_code_id` | bigint | نعم | tax_codes |
| `tax_rate` | numeric(9,6) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `line_total` | numeric(18,4) | لا | — |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `purchase_order_lines_pkey` (id)

**قيود التحقق:**
- `pol_progress_valid`: `CHECK (((received_qty_base >= (0)::numeric) AND (invoiced_qty_base >= (0)::numeric)))`

### `goods_receipts`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `receipt_no` | varchar(40) | لا | — |
| `receipt_date` | date | لا | — |
| `supplier_id` | bigint | لا | suppliers |
| `warehouse_id` | bigint | لا | warehouses |
| `purchase_order_id` | bigint | نعم | purchase_orders |
| `supplier_delivery_no` | varchar(60) | نعم | — |
| `status` | varchar(20) | لا | — |
| `total_cost` | numeric(18,4) | لا | — |
| `landed_cost_amount` | numeric(18,4) | لا | — |
| `is_invoiced` | boolean | لا | — |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `posted_by` | bigint | نعم | users |
| `posted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `goods_receipts_pkey` (id)
- `goods_receipts_company_id_receipt_no_unique` (company_id, receipt_no)

### `goods_receipt_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `goods_receipt_id` | bigint | لا | goods_receipts |
| `line_no` | smallint | لا | — |
| `purchase_order_line_id` | bigint | نعم | purchase_order_lines |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `batch_id` | bigint | نعم | stock_batches |
| `batch_no` | varchar(60) | نعم | — |
| `expiry_date` | date | نعم | — |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `unit_cost` | numeric(20,6) | لا | — |
| `line_cost` | numeric(18,4) | لا | — |
| `landed_cost_share` | numeric(18,4) | لا | — |
| `invoiced_qty_base` | numeric(20,6) | لا | — |
| `status_bucket` | varchar(20) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `goods_receipt_lines_pkey` (id)

### `supplier_invoices`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `invoice_no` | varchar(40) | لا | — |
| `supplier_invoice_no` | varchar(60) | نعم | — |
| `invoice_date` | date | لا | — |
| `due_date` | date | نعم | — |
| `supplier_id` | bigint | لا | suppliers |
| `purchase_order_id` | bigint | نعم | purchase_orders |
| `payment_type` | varchar(20) | لا | — |
| `status` | varchar(20) | لا | — |
| `subtotal` | numeric(18,4) | لا | — |
| `discount_amount` | numeric(18,4) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `total_amount` | numeric(18,4) | لا | — |
| `paid_amount` | numeric(18,4) | لا | — |
| `returned_amount` | numeric(18,4) | لا | — |
| `currency_code` | varchar(3) | لا | — |
| `exchange_rate` | numeric(18,8) | لا | — |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `posted_by` | bigint | نعم | users |
| `posted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `supplier_invoices_pkey` (id)
- `supplier_invoices_company_id_invoice_no_unique` (company_id, invoice_no)

### `supplier_invoice_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `supplier_invoice_id` | bigint | لا | supplier_invoices |
| `line_no` | smallint | لا | — |
| `goods_receipt_line_id` | bigint | نعم | goods_receipt_lines |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `unit_price` | numeric(18,4) | لا | — |
| `discount_amount` | numeric(18,4) | لا | — |
| `tax_code_id` | bigint | نعم | tax_codes |
| `tax_rate` | numeric(9,6) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `line_total` | numeric(18,4) | لا | — |
| `price_variance` | numeric(18,4) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `supplier_invoice_lines_pkey` (id)

### `landed_costs`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `doc_no` | varchar(40) | لا | — |
| `doc_date` | date | لا | — |
| `goods_receipt_id` | bigint | نعم | goods_receipts |
| `supplier_id` | bigint | نعم | suppliers |
| `cost_type` | varchar(40) | لا | — |
| `allocation_method` | varchar(20) | لا | — |
| `amount` | numeric(18,4) | لا | — |
| `post_sale_policy` | varchar(30) | لا | — |
| `status` | varchar(20) | لا | — |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `posted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `landed_costs_pkey` (id)
- `landed_costs_company_id_doc_no_unique` (company_id, doc_no)

### `landed_cost_allocations`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `landed_cost_id` | bigint | لا | landed_costs |
| `goods_receipt_line_id` | bigint | لا | goods_receipt_lines |
| `item_id` | bigint | لا | items |
| `allocated_amount` | numeric(18,4) | لا | — |
| `to_inventory_amount` | numeric(18,4) | لا | — |
| `to_cogs_amount` | numeric(18,4) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `landed_cost_allocations_pkey` (id)

### `purchase_returns`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `return_no` | varchar(40) | لا | — |
| `return_date` | date | لا | — |
| `supplier_id` | bigint | لا | suppliers |
| `warehouse_id` | bigint | لا | warehouses |
| `supplier_invoice_id` | bigint | نعم | supplier_invoices |
| `goods_receipt_id` | bigint | نعم | goods_receipts |
| `status` | varchar(20) | لا | — |
| `subtotal` | numeric(18,4) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `total_amount` | numeric(18,4) | لا | — |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `reason` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `posted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `purchase_returns_pkey` (id)
- `purchase_returns_company_id_return_no_unique` (company_id, return_no)

### `purchase_return_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `purchase_return_id` | bigint | لا | purchase_returns |
| `line_no` | smallint | لا | — |
| `supplier_invoice_line_id` | bigint | نعم | supplier_invoice_lines |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `batch_id` | bigint | نعم | stock_batches |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `unit_price` | numeric(18,4) | لا | — |
| `unit_cost` | numeric(20,6) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `line_total` | numeric(18,4) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `purchase_return_lines_pkey` (id)

### `supplier_payments`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `voucher_no` | varchar(40) | لا | — |
| `payment_date` | date | لا | — |
| `supplier_id` | bigint | لا | suppliers |
| `payment_method` | varchar(20) | لا | — |
| `cash_box_id` | bigint | نعم | cash_boxes |
| `bank_account_id` | bigint | نعم | bank_accounts |
| `cheque_id` | bigint | نعم | cheques |
| `amount` | numeric(18,4) | لا | — |
| `allocated_amount` | numeric(18,4) | لا | — |
| `status` | varchar(20) | لا | — |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `posted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `supplier_payments_pkey` (id)
- `supplier_payments_company_id_voucher_no_unique` (company_id, voucher_no)

### `supplier_payment_allocations`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `supplier_payment_id` | bigint | لا | supplier_payments |
| `supplier_invoice_id` | bigint | لا | supplier_invoices |
| `amount` | numeric(18,4) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `supplier_payment_allocations_pkey` (id)
- `supplier_payment_allocations_supplier_payment_id_supplier_invoi` (supplier_payment_id, supplier_invoice_id)

## المبيعات

### `quotations`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `quotation_no` | varchar(40) | لا | — |
| `quotation_date` | date | لا | — |
| `valid_until` | date | نعم | — |
| `customer_id` | bigint | لا | customers |
| `salesman_id` | bigint | نعم | salesmen |
| `price_list_id` | bigint | نعم | price_lists |
| `status` | varchar(20) | لا | — |
| `subtotal` | numeric(18,4) | لا | — |
| `discount_amount` | numeric(18,4) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `total_amount` | numeric(18,4) | لا | — |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `quotations_pkey` (id)
- `quotations_company_id_quotation_no_unique` (company_id, quotation_no)

### `quotation_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `quotation_id` | bigint | لا | quotations |
| `line_no` | smallint | لا | — |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `unit_price` | numeric(18,4) | لا | — |
| `discount_pct` | numeric(9,4) | لا | — |
| `discount_amount` | numeric(18,4) | لا | — |
| `tax_rate` | numeric(9,6) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `line_total` | numeric(18,4) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `quotation_lines_pkey` (id)

### `sales_orders`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `order_no` | varchar(40) | لا | — |
| `order_date` | date | لا | — |
| `required_date` | date | نعم | — |
| `customer_id` | bigint | لا | customers |
| `customer_address_id` | bigint | نعم | customer_addresses |
| `salesman_id` | bigint | نعم | salesmen |
| `warehouse_id` | bigint | لا | warehouses |
| `price_list_id` | bigint | نعم | price_lists |
| `quotation_id` | bigint | نعم | quotations |
| `cost_center_id` | bigint | نعم | cost_centers |
| `customer_po_no` | varchar(60) | نعم | — |
| `channel` | varchar(20) | لا | — |
| `payment_type` | varchar(20) | لا | — |
| `payment_term_days` | smallint | لا | — |
| `status` | varchar(30) | لا | — |
| `delivery_status` | varchar(30) | لا | — |
| `invoice_status` | varchar(30) | لا | — |
| `payment_status` | varchar(30) | لا | — |
| `subtotal` | numeric(18,4) | لا | — |
| `line_discount_amount` | numeric(18,4) | لا | — |
| `header_discount_amount` | numeric(18,4) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `delivery_fee` | numeric(18,4) | لا | — |
| `total_amount` | numeric(18,4) | لا | — |
| `is_backorder_allowed` | boolean | لا | — |
| `credit_override` | boolean | لا | — |
| `credit_override_by` | bigint | نعم | users |
| `credit_override_reason` | text | نعم | — |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `approved_by` | bigint | نعم | users |
| `approved_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `sales_orders_pkey` (id)
- `sales_orders_company_id_order_no_unique` (company_id, order_no)

### `sales_order_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `sales_order_id` | bigint | لا | sales_orders |
| `line_no` | smallint | لا | — |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `reserved_qty_base` | numeric(20,6) | لا | — |
| `delivered_qty_base` | numeric(20,6) | لا | — |
| `invoiced_qty_base` | numeric(20,6) | لا | — |
| `unit_price` | numeric(18,4) | لا | — |
| `discount_pct` | numeric(9,4) | لا | — |
| `discount_amount` | numeric(18,4) | لا | — |
| `tax_code_id` | bigint | نعم | tax_codes |
| `tax_rate` | numeric(9,6) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `line_total` | numeric(18,4) | لا | — |
| `is_free` | boolean | لا | — |
| `promotion_id` | bigint | نعم | promotions |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `sales_order_lines_pkey` (id)

**قيود التحقق:**
- `sol_progress_valid`: `CHECK (((delivered_qty_base >= (0)::numeric) AND (invoiced_qty_base >= (0)::numeric) AND (delivered_qty_base <= qty_base) AND (invoiced_qty_base <= qty_base)))`

### `delivery_notes`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `delivery_no` | varchar(40) | لا | — |
| `delivery_date` | date | لا | — |
| `customer_id` | bigint | لا | customers |
| `sales_order_id` | bigint | نعم | sales_orders |
| `warehouse_id` | bigint | لا | warehouses |
| `salesman_id` | bigint | نعم | salesmen |
| `vehicle_id` | bigint | نعم | vehicles |
| `driver_user_id` | bigint | نعم | users |
| `status` | varchar(30) | لا | — |
| `receiver_name` | varchar(255) | نعم | — |
| `signature_path` | varchar(255) | نعم | — |
| `proof_code` | varchar(20) | نعم | — |
| `delivered_at` | timestamp without time zone | نعم | — |
| `failure_reason` | text | نعم | — |
| `rescheduled_to` | date | نعم | — |
| `is_stock_owner` | boolean | لا | — |
| `is_invoiced` | boolean | لا | — |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `posted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |
| `journal_entry_id` | bigint | نعم | journal_entries |

**قيود عدم التكرار:**
- `delivery_notes_pkey` (id)
- `delivery_notes_company_id_delivery_no_unique` (company_id, delivery_no)

### `delivery_note_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `delivery_note_id` | bigint | لا | delivery_notes |
| `line_no` | smallint | لا | — |
| `sales_order_line_id` | bigint | نعم | sales_order_lines |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `batch_id` | bigint | نعم | stock_batches |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `delivered_qty_base` | numeric(20,6) | لا | — |
| `rejected_qty_base` | numeric(20,6) | لا | — |
| `invoiced_qty_base` | numeric(20,6) | لا | — |
| `unit_cost` | numeric(20,6) | لا | — |
| `rejection_reason` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `delivery_note_lines_pkey` (id)

### `sales_invoices`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `invoice_no` | varchar(40) | لا | — |
| `field_no` | varchar(60) | نعم | — |
| `invoice_date` | date | لا | — |
| `due_date` | date | نعم | — |
| `customer_id` | bigint | لا | customers |
| `salesman_id` | bigint | نعم | salesmen |
| `warehouse_id` | bigint | لا | warehouses |
| `sales_order_id` | bigint | نعم | sales_orders |
| `delivery_note_id` | bigint | نعم | delivery_notes |
| `cost_center_id` | bigint | نعم | cost_centers |
| `price_list_id` | bigint | نعم | price_lists |
| `channel` | varchar(20) | لا | — |
| `payment_type` | varchar(20) | لا | — |
| `status` | varchar(20) | لا | — |
| `is_stock_owner` | boolean | لا | — |
| `subtotal` | numeric(18,4) | لا | — |
| `line_discount_amount` | numeric(18,4) | لا | — |
| `header_discount_amount` | numeric(18,4) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `delivery_fee` | numeric(18,4) | لا | — |
| `total_amount` | numeric(18,4) | لا | — |
| `paid_amount` | numeric(18,4) | لا | — |
| `returned_amount` | numeric(18,4) | لا | — |
| `total_cost` | numeric(18,4) | لا | — |
| `currency_code` | varchar(3) | لا | — |
| `exchange_rate` | numeric(18,8) | لا | — |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `cogs_journal_entry_id` | bigint | نعم | journal_entries |
| `snapshot` | jsonb | نعم | — |
| `etax_status` | varchar(30) | لا | — |
| `etax_uuid` | varchar(100) | نعم | — |
| `etax_response` | jsonb | نعم | — |
| `print_count` | smallint | لا | — |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `posted_by` | bigint | نعم | users |
| `posted_at` | timestamp without time zone | نعم | — |
| `cancelled_by` | bigint | نعم | users |
| `cancelled_at` | timestamp without time zone | نعم | — |
| `cancel_reason` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `sales_invoices_pkey` (id)
- `sales_invoices_company_id_invoice_no_unique` (company_id, invoice_no)

### `sales_invoice_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `sales_invoice_id` | bigint | لا | sales_invoices |
| `line_no` | smallint | لا | — |
| `sales_order_line_id` | bigint | نعم | sales_order_lines |
| `delivery_note_line_id` | bigint | نعم | delivery_note_lines |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `batch_id` | bigint | نعم | stock_batches |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `returned_qty_base` | numeric(20,6) | لا | — |
| `unit_price` | numeric(18,4) | لا | — |
| `discount_pct` | numeric(9,4) | لا | — |
| `discount_amount` | numeric(18,4) | لا | — |
| `tax_code_id` | bigint | نعم | tax_codes |
| `tax_rate` | numeric(9,6) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `line_total` | numeric(18,4) | لا | — |
| `unit_cost` | numeric(20,6) | لا | — |
| `total_cost` | numeric(18,4) | لا | — |
| `is_free` | boolean | لا | — |
| `promotion_id` | bigint | نعم | promotions |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `sales_invoice_lines_pkey` (id)

**قيود التحقق:**
- `sil_returned_within_sold`: `CHECK (((returned_qty_base >= (0)::numeric) AND (returned_qty_base <= qty_base)))`

### `sales_returns`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `return_no` | varchar(40) | لا | — |
| `field_no` | varchar(60) | نعم | — |
| `return_date` | date | لا | — |
| `customer_id` | bigint | لا | customers |
| `sales_invoice_id` | bigint | نعم | sales_invoices |
| `salesman_id` | bigint | نعم | salesmen |
| `warehouse_id` | bigint | لا | warehouses |
| `without_invoice` | boolean | لا | — |
| `exception_approved_by` | bigint | نعم | users |
| `exception_reason` | text | نعم | — |
| `status` | varchar(20) | لا | — |
| `received_at` | timestamp without time zone | نعم | — |
| `received_by` | bigint | نعم | users |
| `subtotal` | numeric(18,4) | لا | — |
| `discount_amount` | numeric(18,4) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `total_amount` | numeric(18,4) | لا | — |
| `total_cost` | numeric(18,4) | لا | — |
| `settlement_type` | varchar(20) | لا | — |
| `refund_approved_by` | bigint | نعم | users |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `cogs_journal_entry_id` | bigint | نعم | journal_entries |
| `reason` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `posted_by` | bigint | نعم | users |
| `posted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `sales_returns_pkey` (id)
- `sales_returns_company_id_return_no_unique` (company_id, return_no)

### `sales_return_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `sales_return_id` | bigint | لا | sales_returns |
| `line_no` | smallint | لا | — |
| `sales_invoice_line_id` | bigint | نعم | sales_invoice_lines |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `batch_id` | bigint | نعم | stock_batches |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `unit_price` | numeric(18,4) | لا | — |
| `discount_amount` | numeric(18,4) | لا | — |
| `tax_rate` | numeric(9,6) | لا | — |
| `tax_amount` | numeric(18,4) | لا | — |
| `line_total` | numeric(18,4) | لا | — |
| `unit_cost` | numeric(20,6) | لا | — |
| `total_cost` | numeric(18,4) | لا | — |
| `condition` | varchar(20) | لا | — |
| `target_status_bucket` | varchar(20) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `sales_return_lines_pkey` (id)

### `customer_receipts`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `voucher_no` | varchar(40) | لا | — |
| `field_no` | varchar(60) | نعم | — |
| `receipt_date` | date | لا | — |
| `customer_id` | bigint | لا | customers |
| `salesman_id` | bigint | نعم | salesmen |
| `payment_method` | varchar(20) | لا | — |
| `cash_box_id` | bigint | نعم | cash_boxes |
| `bank_account_id` | bigint | نعم | bank_accounts |
| `cheque_id` | bigint | نعم | cheques |
| `amount` | numeric(18,4) | لا | — |
| `allocated_amount` | numeric(18,4) | لا | — |
| `status` | varchar(20) | لا | — |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `day_closure_id` | bigint | نعم | day_closures |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `posted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `customer_receipts_pkey` (id)
- `customer_receipts_company_id_voucher_no_unique` (company_id, voucher_no)

**قيود التحقق:**
- `cr_amount_positive`: `CHECK ((amount > (0)::numeric))`

### `customer_receipt_allocations`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `customer_receipt_id` | bigint | لا | customer_receipts |
| `sales_invoice_id` | bigint | لا | sales_invoices |
| `amount` | numeric(18,4) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `customer_receipt_allocations_pkey` (id)
- `customer_receipt_allocations_customer_receipt_id_sales_invoice_` (customer_receipt_id, sales_invoice_id)

### `payment_promises`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `customer_id` | bigint | لا | customers |
| `salesman_id` | bigint | نعم | salesmen |
| `promised_date` | date | لا | — |
| `amount` | numeric(18,4) | لا | — |
| `status` | varchar(20) | لا | — |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `payment_promises_pkey` (id)

## العمليات الميدانية

### `load_orders`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `load_no` | varchar(40) | لا | — |
| `load_date` | date | لا | — |
| `salesman_id` | bigint | لا | salesmen |
| `vehicle_id` | bigint | نعم | vehicles |
| `driver_user_id` | bigint | نعم | users |
| `from_warehouse_id` | bigint | لا | warehouses |
| `to_warehouse_id` | bigint | لا | warehouses |
| `status` | varchar(20) | لا | — |
| `load_type` | varchar(20) | لا | — |
| `stock_transfer_id` | bigint | نعم | stock_transfers |
| `issuer_signature_path` | varchar(255) | نعم | — |
| `receiver_signature_path` | varchar(255) | نعم | — |
| `total_cost` | numeric(18,4) | لا | — |
| `notes` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `loaded_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `load_orders_pkey` (id)
- `load_orders_company_id_load_no_unique` (company_id, load_no)

### `load_order_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `load_order_id` | bigint | لا | load_orders |
| `line_no` | smallint | لا | — |
| `item_id` | bigint | لا | items |
| `uom_id` | bigint | لا | uoms |
| `uom_factor` | numeric(20,6) | لا | — |
| `batch_id` | bigint | نعم | stock_batches |
| `qty_uom` | numeric(20,6) | لا | — |
| `qty_base` | numeric(20,6) | لا | — |
| `loaded_qty_base` | numeric(20,6) | لا | — |
| `unit_cost` | numeric(20,6) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `load_order_lines_pkey` (id)

### `custody_handovers`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `handover_no` | varchar(40) | لا | — |
| `handover_date` | date | لا | — |
| `custody_type` | varchar(20) | لا | — |
| `from_salesman_id` | bigint | نعم | salesmen |
| `to_salesman_id` | bigint | نعم | salesmen |
| `warehouse_id` | bigint | نعم | warehouses |
| `vehicle_id` | bigint | نعم | vehicles |
| `cash_amount` | numeric(18,4) | لا | — |
| `status` | varchar(20) | لا | — |
| `approved_by` | bigint | نعم | users |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `custody_handovers_pkey` (id)
- `custody_handovers_company_id_handover_no_unique` (company_id, handover_no)

### `visit_plans`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `salesman_id` | bigint | لا | salesmen |
| `route_id` | bigint | نعم | routes |
| `plan_date` | date | لا | — |
| `frequency` | varchar(20) | لا | — |
| `status` | varchar(20) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `visit_plans_pkey` (id)
- `visit_plans_company_id_salesman_id_plan_date_unique` (company_id, salesman_id, plan_date)

### `visit_plan_lines`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `visit_plan_id` | bigint | لا | visit_plans |
| `customer_id` | bigint | لا | customers |
| `sequence` | smallint | لا | — |
| `status` | varchar(20) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `visit_plan_lines_pkey` (id)
- `visit_plan_lines_visit_plan_id_customer_id_unique` (visit_plan_id, customer_id)

### `visits`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `salesman_id` | bigint | لا | salesmen |
| `customer_id` | bigint | لا | customers |
| `visit_plan_id` | bigint | نعم | visit_plans |
| `visit_date` | date | لا | — |
| `started_at` | timestamp without time zone | نعم | — |
| `ended_at` | timestamp without time zone | نعم | — |
| `result` | varchar(30) | نعم | — |
| `no_purchase_reason` | varchar(120) | نعم | — |
| `is_planned` | boolean | لا | — |
| `start_latitude` | numeric(10,7) | نعم | — |
| `start_longitude` | numeric(10,7) | نعم | — |
| `gps_accuracy_m` | numeric(10,2) | نعم | — |
| `gps_available` | boolean | لا | — |
| `notes` | text | نعم | — |
| `client_uuid` | uuid | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `visits_pkey` (id)
- `visits_company_id_client_uuid_unique` (company_id, client_uuid)

### `salesman_locations`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `salesman_id` | bigint | لا | salesmen |
| `latitude` | numeric(10,7) | لا | — |
| `longitude` | numeric(10,7) | لا | — |
| `accuracy_m` | numeric(10,2) | نعم | — |
| `recorded_at` | timestamp without time zone | لا | — |
| `received_at` | timestamp without time zone | لا | — |
| `during_shift` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `salesman_locations_pkey` (id)

### `day_closures`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `closure_no` | varchar(40) | لا | — |
| `salesman_id` | bigint | لا | salesmen |
| `closure_date` | date | لا | — |
| `warehouse_id` | bigint | نعم | warehouses |
| `cash_box_id` | bigint | نعم | cash_boxes |
| `status` | varchar(20) | لا | — |
| `goods_opening_value` | numeric(18,4) | لا | — |
| `goods_loaded_value` | numeric(18,4) | لا | — |
| `goods_returns_in_value` | numeric(18,4) | لا | — |
| `goods_sold_value` | numeric(18,4) | لا | — |
| `goods_bonus_value` | numeric(18,4) | لا | — |
| `goods_returned_to_wh_value` | numeric(18,4) | لا | — |
| `goods_transfer_out_value` | numeric(18,4) | لا | — |
| `goods_damaged_value` | numeric(18,4) | لا | — |
| `goods_expected_value` | numeric(18,4) | لا | — |
| `goods_actual_value` | numeric(18,4) | لا | — |
| `goods_variance_value` | numeric(18,4) | لا | — |
| `cash_opening` | numeric(18,4) | لا | — |
| `cash_collected` | numeric(18,4) | لا | — |
| `cash_custody_received` | numeric(18,4) | لا | — |
| `cash_deposited` | numeric(18,4) | لا | — |
| `cash_expenses` | numeric(18,4) | لا | — |
| `cash_refunds` | numeric(18,4) | لا | — |
| `cash_expected` | numeric(18,4) | لا | — |
| `cash_actual` | numeric(18,4) | لا | — |
| `cash_variance` | numeric(18,4) | لا | — |
| `bank_transfers_amount` | numeric(18,4) | لا | — |
| `cheques_amount` | numeric(18,4) | لا | — |
| `pending_sync_ops` | integer | لا | — |
| `sync_complete` | boolean | لا | — |
| `sync_exception_granted` | boolean | لا | — |
| `sync_exception_by` | bigint | نعم | users |
| `sync_exception_reason` | text | نعم | — |
| `inventory_count_id` | bigint | نعم | inventory_counts |
| `variance_report_id` | bigint | نعم | variance_reports |
| `closed_by` | bigint | نعم | users |
| `closed_at` | timestamp without time zone | نعم | — |
| `approved_by` | bigint | نعم | users |
| `approved_at` | timestamp without time zone | نعم | — |
| `reopened_by` | bigint | نعم | users |
| `reopened_at` | timestamp without time zone | نعم | — |
| `reopen_reason` | text | نعم | — |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `day_closures_pkey` (id)
- `day_closures_company_id_salesman_id_closure_date_unique` (company_id, salesman_id, closure_date)
- `day_closures_company_id_closure_no_unique` (company_id, closure_no)

### `variance_reports`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `report_no` | varchar(40) | لا | — |
| `day_closure_id` | bigint | نعم | day_closures |
| `variance_type` | varchar(20) | لا | — |
| `amount` | numeric(18,4) | لا | — |
| `direction` | varchar(10) | لا | — |
| `explanation` | text | نعم | — |
| `status` | varchar(20) | لا | — |
| `resolution` | varchar(40) | نعم | — |
| `created_by` | bigint | نعم | users |
| `approved_by` | bigint | نعم | users |
| `approved_at` | timestamp without time zone | نعم | — |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `variance_reports_pkey` (id)
- `variance_reports_company_id_report_no_unique` (company_id, report_no)

### `cash_deposits`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `deposit_no` | varchar(40) | لا | — |
| `deposit_date` | date | لا | — |
| `salesman_id` | bigint | نعم | salesmen |
| `from_cash_box_id` | bigint | لا | cash_boxes |
| `to_cash_box_id` | bigint | نعم | cash_boxes |
| `to_bank_account_id` | bigint | نعم | bank_accounts |
| `amount` | numeric(18,4) | لا | — |
| `status` | varchar(20) | لا | — |
| `reference_no` | varchar(60) | نعم | — |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `day_closure_id` | bigint | نعم | day_closures |
| `created_by` | bigint | نعم | users |
| `approved_by` | bigint | نعم | users |
| `posted_at` | timestamp without time zone | نعم | — |
| `notes` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `cash_deposits_pkey` (id)
- `cash_deposits_company_id_deposit_no_unique` (company_id, deposit_no)

**قيود التحقق:**
- `cd_amount_positive`: `CHECK ((amount > (0)::numeric))`
- `cd_one_destination`: `CHECK ((((to_cash_box_id IS NOT NULL) AND (to_bank_account_id IS NULL)) OR ((to_cash_box_id IS NULL) AND (to_bank_account_id IS NOT NULL))))`

### `expenses`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `branch_id` | bigint | نعم | branches |
| `expense_no` | varchar(40) | لا | — |
| `expense_date` | date | لا | — |
| `account_id` | bigint | لا | accounts |
| `cost_center_id` | bigint | نعم | cost_centers |
| `category` | varchar(40) | لا | — |
| `amount` | numeric(18,4) | لا | — |
| `paid_from` | varchar(30) | لا | — |
| `cash_box_id` | bigint | نعم | cash_boxes |
| `bank_account_id` | bigint | نعم | bank_accounts |
| `salesman_id` | bigint | نعم | salesmen |
| `vehicle_id` | bigint | نعم | vehicles |
| `day_closure_id` | bigint | نعم | day_closures |
| `status` | varchar(20) | لا | — |
| `is_recurring` | boolean | لا | — |
| `recurrence` | varchar(20) | نعم | — |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `description` | text | نعم | — |
| `created_by` | bigint | نعم | users |
| `approved_by` | bigint | نعم | users |
| `approved_at` | timestamp without time zone | نعم | — |
| `posted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `expenses_pkey` (id)
- `expenses_company_id_expense_no_unique` (company_id, expense_no)

### `targets`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `name` | varchar(255) | لا | — |
| `scope_type` | varchar(20) | لا | — |
| `scope_id` | bigint | لا | — |
| `metric` | varchar(30) | لا | — |
| `period_start` | date | لا | — |
| `period_end` | date | لا | — |
| `target_value` | numeric(18,4) | لا | — |
| `achieved_value` | numeric(18,4) | لا | — |
| `calculated_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `targets_pkey` (id)

### `commission_rules`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `code` | varchar(40) | لا | — |
| `name` | varchar(255) | لا | — |
| `version` | smallint | لا | — |
| `role_type` | varchar(20) | لا | — |
| `base` | varchar(30) | لا | — |
| `item_id` | bigint | نعم | items |
| `category_id` | bigint | نعم | item_categories |
| `customer_id` | bigint | نعم | customers |
| `salesman_id` | bigint | نعم | salesmen |
| `share_pct` | numeric(9,4) | لا | — |
| `exclude_tax` | boolean | لا | — |
| `deduct_returns` | boolean | لا | — |
| `require_collection` | boolean | لا | — |
| `valid_from` | date | لا | — |
| `valid_to` | date | نعم | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `commission_rules_pkey` (id)
- `commission_rules_company_id_code_version_unique` (company_id, code, version)

### `commission_rule_tiers`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `commission_rule_id` | bigint | لا | commission_rules |
| `from_amount` | numeric(18,4) | لا | — |
| `to_amount` | numeric(18,4) | نعم | — |
| `min_margin_pct` | numeric(9,4) | نعم | — |
| `rate_pct` | numeric(9,4) | لا | — |
| `fixed_amount` | numeric(18,4) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `commission_rule_tiers_pkey` (id)

### `commission_entries`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `salesman_id` | bigint | لا | salesmen |
| `commission_rule_id` | bigint | نعم | commission_rules |
| `rule_version` | smallint | لا | — |
| `source_type` | varchar(60) | لا | — |
| `source_id` | bigint | لا | — |
| `source_no` | varchar(60) | نعم | — |
| `entry_date` | date | لا | — |
| `base_amount` | numeric(18,4) | لا | — |
| `rate_pct` | numeric(9,4) | لا | — |
| `amount` | numeric(18,4) | لا | — |
| `status` | varchar(20) | لا | — |
| `settlement_id` | bigint | نعم | commission_settlements |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `commission_entries_pkey` (id)
- `ce_source_unique` (company_id, source_type, source_id, salesman_id, commission_rule_id)

### `commission_settlements`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `settlement_no` | varchar(40) | لا | — |
| `salesman_id` | bigint | لا | salesmen |
| `period_start` | date | لا | — |
| `period_end` | date | لا | — |
| `total_amount` | numeric(18,4) | لا | — |
| `status` | varchar(20) | لا | — |
| `journal_entry_id` | bigint | نعم | journal_entries |
| `approved_by` | bigint | نعم | users |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `commission_settlements_pkey` (id)
- `commission_settlements_company_id_settlement_no_unique` (company_id, settlement_no)

## الموافقات والمزامنة والتكاملات

### `approval_rules`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `code` | varchar(60) | لا | — |
| `name` | varchar(255) | لا | — |
| `doc_type` | varchar(60) | لا | — |
| `min_amount` | numeric(18,4) | لا | — |
| `max_amount` | numeric(18,4) | نعم | — |
| `conditions` | jsonb | نعم | — |
| `require_different_approver` | boolean | لا | — |
| `is_active` | boolean | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `approval_rules_pkey` (id)
- `approval_rules_company_id_code_unique` (company_id, code)

### `approval_rule_steps`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `approval_rule_id` | bigint | لا | approval_rules |
| `step_no` | smallint | لا | — |
| `role_id` | bigint | نعم | roles |
| `user_id` | bigint | نعم | users |
| `permission_code` | varchar(100) | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `approval_rule_steps_pkey` (id)
- `approval_rule_steps_approval_rule_id_step_no_unique` (approval_rule_id, step_no)

### `approval_requests`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `approval_rule_id` | bigint | نعم | approval_rules |
| `doc_type` | varchar(60) | لا | — |
| `doc_id` | bigint | لا | — |
| `doc_no` | varchar(60) | نعم | — |
| `amount` | numeric(18,4) | لا | — |
| `status` | varchar(20) | لا | — |
| `current_step` | smallint | لا | — |
| `requested_by` | bigint | نعم | users |
| `request_reason` | text | نعم | — |
| `resolved_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `approval_requests_pkey` (id)
- `approval_requests_company_id_doc_type_doc_id_unique` (company_id, doc_type, doc_id)

### `approval_steps`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `approval_request_id` | bigint | لا | approval_requests |
| `step_no` | smallint | لا | — |
| `approver_id` | bigint | نعم | users |
| `status` | varchar(20) | لا | — |
| `comment` | text | نعم | — |
| `acted_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `approval_steps_pkey` (id)
- `approval_steps_approval_request_id_step_no_unique` (approval_request_id, step_no)

### `devices`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `user_id` | bigint | نعم | users |
| `salesman_id` | bigint | نعم | salesmen |
| `device_uid` | varchar(100) | لا | — |
| `label` | varchar(255) | نعم | — |
| `platform` | varchar(30) | لا | — |
| `app_version` | varchar(30) | نعم | — |
| `is_active` | boolean | لا | — |
| `deactivation_reason` | text | نعم | — |
| `offline_authorized_until` | timestamp without time zone | نعم | — |
| `offline_max_ops` | integer | لا | — |
| `last_sync_at` | timestamp without time zone | نعم | — |
| `last_server_seq` | bigint | لا | — |
| `push_token` | varchar(255) | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `devices_pkey` (id)
- `devices_company_id_device_uid_unique` (company_id, device_uid)

### `sync_operations`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `device_id` | bigint | لا | devices |
| `operation_uuid` | uuid | لا | — |
| `idempotency_key` | varchar(120) | لا | — |
| `device_seq` | bigint | لا | — |
| `op_type` | varchar(60) | لا | — |
| `payload` | jsonb | لا | — |
| `payload_hash` | varchar(64) | نعم | — |
| `status` | varchar(20) | لا | — |
| `server_doc_type` | varchar(60) | نعم | — |
| `server_doc_id` | bigint | نعم | — |
| `server_doc_no` | varchar(60) | نعم | — |
| `error_code` | text | نعم | — |
| `error_message` | text | نعم | — |
| `conflict_details` | jsonb | نعم | — |
| `attempts` | smallint | لا | — |
| `received_at` | timestamp without time zone | لا | — |
| `processed_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `sync_operations_pkey` (id)
- `sync_operations_company_id_idempotency_key_unique` (company_id, idempotency_key)
- `sync_operations_company_id_operation_uuid_unique` (company_id, operation_uuid)

### `offline_stock_quotas`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `device_id` | bigint | لا | devices |
| `warehouse_id` | bigint | لا | warehouses |
| `item_id` | bigint | لا | items |
| `qty_base` | numeric(20,6) | لا | — |
| `consumed_qty_base` | numeric(20,6) | لا | — |
| `expires_at` | timestamp without time zone | نعم | — |
| `status` | varchar(20) | لا | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `offline_stock_quotas_pkey` (id)
- `offline_stock_quotas_device_id_warehouse_id_item_id_unique` (device_id, warehouse_id, item_id)

### `offline_credit_quotas`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `device_id` | bigint | لا | devices |
| `customer_id` | bigint | لا | customers |
| `amount` | numeric(18,4) | لا | — |
| `consumed_amount` | numeric(18,4) | لا | — |
| `expires_at` | timestamp without time zone | نعم | — |
| `status` | varchar(20) | لا | — |
| `granted_by` | bigint | نعم | users |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `offline_credit_quotas_pkey` (id)
- `offline_credit_quotas_device_id_customer_id_unique` (device_id, customer_id)

### `price_snapshots`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `price_list_id` | bigint | لا | price_lists |
| `version` | bigint | لا | — |
| `hash` | varchar(64) | لا | — |
| `effective_at` | timestamp without time zone | لا | — |
| `expires_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `price_snapshots_pkey` (id)
- `price_snapshots_company_id_price_list_id_version_unique` (company_id, price_list_id, version)

### `integration_settings`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `provider` | varchar(40) | لا | — |
| `is_enabled` | boolean | لا | — |
| `is_configured` | boolean | لا | — |
| `config` | jsonb | نعم | — |
| `secret_env_keys` | jsonb | نعم | — |
| `last_health_check_at` | timestamp without time zone | نعم | — |
| `last_health_status` | varchar(30) | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `integration_settings_pkey` (id)
- `integration_settings_company_id_provider_unique` (company_id, provider)

### `import_batches`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `batch_no` | varchar(40) | لا | — |
| `entity_type` | varchar(60) | لا | — |
| `file_name` | varchar(255) | لا | — |
| `file_hash` | varchar(64) | نعم | — |
| `status` | varchar(20) | لا | — |
| `total_rows` | integer | لا | — |
| `valid_rows` | integer | لا | — |
| `error_rows` | integer | لا | — |
| `applied_rows` | integer | لا | — |
| `errors` | jsonb | نعم | — |
| `created_by` | bigint | نعم | users |
| `applied_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `import_batches_pkey` (id)
- `import_batches_company_id_batch_no_unique` (company_id, batch_no)
- `import_batches_company_id_entity_type_file_hash_unique` (company_id, entity_type, file_hash)

### `report_jobs`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `user_id` | bigint | لا | users |
| `report_key` | varchar(60) | لا | — |
| `filters` | jsonb | نعم | — |
| `format` | varchar(10) | لا | — |
| `status` | varchar(20) | لا | — |
| `progress` | smallint | لا | — |
| `file_path` | varchar(255) | نعم | — |
| `download_token` | varchar(64) | نعم | — |
| `expires_at` | timestamp without time zone | نعم | — |
| `error` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `report_jobs_pkey` (id)

### `notifications_outbox`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `channel` | varchar(20) | لا | — |
| `recipient` | varchar(190) | لا | — |
| `subject` | varchar(255) | نعم | — |
| `body` | text | لا | — |
| `meta` | jsonb | نعم | — |
| `status` | varchar(20) | لا | — |
| `attempts` | smallint | لا | — |
| `last_error` | text | نعم | — |
| `sent_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `notifications_outbox_pkey` (id)

### `exception_signals`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | لا | companies |
| `signal_type` | varchar(40) | لا | — |
| `severity` | varchar(20) | لا | — |
| `subject_type` | varchar(40) | نعم | — |
| `subject_id` | bigint | نعم | — |
| `source_type` | varchar(60) | نعم | — |
| `source_id` | bigint | نعم | — |
| `signal_date` | date | لا | — |
| `metric_value` | numeric(18,4) | نعم | — |
| `threshold_value` | numeric(18,4) | نعم | — |
| `description` | text | نعم | — |
| `status` | varchar(20) | لا | — |
| `reviewed_by` | bigint | نعم | users |
| `review_note` | text | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `exception_signals_pkey` (id)

### `backup_runs`

| العمود | النوع | يقبل NULL | مرجع |
|---|---|---|---|
| `id` | bigint | لا | — |
| `company_id` | bigint | نعم | companies |
| `kind` | varchar(20) | لا | — |
| `status` | varchar(20) | لا | — |
| `file_path` | varchar(255) | نعم | — |
| `size_bytes` | bigint | نعم | — |
| `sha256` | varchar(64) | نعم | — |
| `is_encrypted` | boolean | لا | — |
| `offsite_copied` | boolean | لا | — |
| `restore_tested_at` | timestamp without time zone | نعم | — |
| `restore_test_result` | varchar(20) | نعم | — |
| `error` | text | نعم | — |
| `started_at` | timestamp without time zone | نعم | — |
| `finished_at` | timestamp without time zone | نعم | — |
| `created_at` | timestamp without time zone | نعم | — |
| `updated_at` | timestamp without time zone | نعم | — |

**قيود عدم التكرار:**
- `backup_runs_pkey` (id)

## جداول أخرى

- `cache`
- `cache_locks`
- `failed_jobs`
- `job_batches`
- `jobs`
- `migrations`


---

**إجمالي الجداول الموثقة: 126** (إجمالي جداول القاعدة: 132)

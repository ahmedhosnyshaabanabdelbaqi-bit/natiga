<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

/**
 * Generates docs/DATABASE.md (data dictionary + Mermaid ERD) from the live PostgreSQL catalog.
 *
 *   php artisan ev:schema-docs            # writes docs/DATABASE.md
 *   php artisan ev:schema-docs --check    # exits 1 if the file is out of date (CI)
 */
class SchemaDocsCommand extends Command
{
    protected $signature = 'ev:schema-docs {--check : Fail if docs/DATABASE.md is out of date} {--output=docs/DATABASE.md}';

    protected $description = 'Generate the database data dictionary and ERD (Mermaid) from the current schema';

    /** Tables grouped by domain prefix for the ERD sections. */
    private const DOMAINS = [
        'Authentication & users' => ['users', 'password_reset_tokens', 'sessions', 'passkeys', 'personal_access_tokens', 'user_security_events', 'roles', 'permissions', 'role_permissions', 'user_roles', 'user_permissions', 'role_meta'],
        'Membership' => ['memberships', 'membership_status_history', 'membership_verifications', 'member_referrals', 'member_notes', 'account_deletion_requests', 'consent_logs', 'policy_versions'],
        'Vehicles & garage' => ['vehicle_', 'battery_variants', 'connector_', 'member_vehicles'],
        'Catalog & compatibility' => ['products', 'product_', 'categories', 'category_translations', 'brands', 'external_price_sources'],
        'Demand' => ['wishlists', 'wishlist_items', 'product_interests', 'availability_alerts', 'price_alerts', 'part_request'],
        'Cart & orders' => ['carts', 'cart_items', 'orders', 'order_'],
        'Group buying' => ['group_buy'],
        'Payments & accounting' => ['payments', 'payment_', 'receipts', 'receipt_versions', 'member_ledger_entries', 'financial_', 'refunds', 'refund_', 'bank_'],
        'Suppliers & procurement' => ['suppliers', 'supplier_', 'purchase_order', 'expense', 'cost_allocation', 'exchange_rate_snapshots'],
        'Shipping' => ['shipments', 'shipment_'],
        'Warehouses & inventory' => ['warehouses', 'warehouse_', 'storage_locations', 'inventory_', 'damaged_inventory', 'packages', 'package_items', 'barcode_identifiers', 'serial_numbers'],
        'Events & deliveries' => ['events', 'event_', 'deliveries', 'delivery_', 'pickup_authorizations'],
        'Service centers & maintenance' => ['service_centers', 'service_center_', 'center_', 'services', 'service_translations', 'service_resources', 'resource_availability', 'maintenance_', 'booking_status_history', 'work_order', 'additional_work', 'service_records', 'installed_parts'],
        'Partners & offers' => ['partners', 'partner_', 'offer_'],
        'Home charging' => ['home_charg', 'site_surveys', 'installation_'],
        'Charging stations' => ['charging_', 'station_'],
        'Warranty' => ['warrant'],
        'Knowledge, community issues, campaigns' => ['articles', 'article_', 'community_vehicle_issues', 'issue_', 'vehicle_campaigns', 'campaign_', 'member_campaign_matches'],
        'Support & reviews' => ['support_tickets', 'ticket_', 'sla_policies', 'complaint', 'reviews'],
        'Notifications & surveys' => ['notifications', 'notification_', 'announcement_', 'email_templates', 'surveys', 'survey_'],
        'CMS' => ['pages', 'page_translations', 'homepage_sections', 'banners', 'faqs', 'faq_translations', 'navigation_items', 'footer_sections', 'seo_metadata'],
        'Files, imports, exports' => ['attachments', 'qr_tokens', 'imports', 'import_rows', 'exports'],
        'System, audit, integrations, operations' => ['system_settings', 'module_settings', 'feature_flags', 'number_sequences', 'idempotency_keys', 'currencies', 'exchange_rates', 'countries', 'governorates', 'areas', 'status_banners', 'audit_logs', 'integration_', 'webhook_events', 'operations_exceptions', 'incidents', 'incident_events', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs', 'migrations'],
    ];

    private const SENSITIVE = ['password', 'two_factor_secret', 'two_factor_recovery_codes', 'remember_token', 'vin', 'vin_hash', 'verification_token', 'token', 'secret', 'mobile', 'email', 'ip_address', 'credential'];

    public function handle(): int
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->error('Schema docs require PostgreSQL.');

            return self::FAILURE;
        }

        $tables = collect(DB::select("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"))->pluck('tablename')->all();
        $columns = collect(DB::select(<<<'SQL'
            SELECT c.table_name, c.column_name, c.data_type, c.character_maximum_length, c.numeric_precision, c.numeric_scale, c.is_nullable, c.column_default, c.ordinal_position
            FROM information_schema.columns c WHERE c.table_schema = 'public' ORDER BY c.table_name, c.ordinal_position
        SQL))->groupBy('table_name');
        $foreignKeys = collect(DB::select(<<<'SQL'
            SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column, rc.delete_rule
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        SQL));
        $fkByTable = $foreignKeys->groupBy('table_name');
        $indexes = collect(DB::select("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname"))->groupBy('tablename');
        $checks = collect(DB::select(<<<'SQL'
            SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
            FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace ORDER BY 1, 2
        SQL))->groupBy('table_name');
        $comments = collect(DB::select(<<<'SQL'
            SELECT c.relname AS table_name, obj_description(c.oid, 'pg_class') AS comment
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'
        SQL))->pluck('comment', 'table_name');

        $lines = [];
        $lines[] = '# Database documentation';
        $lines[] = '';
        $lines[] = '_Generated by `php artisan ev:schema-docs` from the live PostgreSQL schema. Do not edit by hand._';
        $lines[] = '';
        $lines[] = sprintf('- Tables: **%d** · Foreign keys: **%d** · Check constraints: **%d**', count($tables), $foreignKeys->count(), $checks->flatten(1)->count());
        $lines[] = '- Conventions: bigint `id` primary keys; ULID `public_id` for externally visible entities; `decimal(14,2)` money + `currency` char(3); timestamps stored in UTC (`timestamptz`), displayed in Africa/Cairo; append-only ledgers (`member_ledger_entries`, `inventory_movements`, `audit_logs` — immutable trigger).';
        $lines[] = '- Sensitive fields (encrypted or restricted): marked 🔒 in the dictionary.';
        $lines[] = '';
        $lines[] = '## Domains';
        $lines[] = '';
        $grouped = $this->groupTables($tables);
        foreach ($grouped as $domain => $domainTables) {
            $lines[] = sprintf('- **%s** (%d): %s', $domain, count($domainTables), implode(', ', array_map(fn ($t) => "`$t`", $domainTables)));
        }
        $lines[] = '';
        $lines[] = '## Entity-relationship diagrams';
        $lines[] = '';
        foreach ($grouped as $domain => $domainTables) {
            if ($domain === 'Other') {
                continue;
            }
            $lines[] = "### {$domain}";
            $lines[] = '';
            $lines[] = '```mermaid';
            $lines[] = 'erDiagram';
            foreach ($domainTables as $table) {
                foreach ($fkByTable->get($table, collect()) as $fk) {
                    $lines[] = sprintf('    %s }o--|| %s : "%s"', $table, $fk->foreign_table, $fk->column_name);
                }
            }
            foreach ($domainTables as $table) {
                $lines[] = "    {$table} {";
                foreach ($columns->get($table, collect())->take(12) as $col) {
                    $type = preg_replace('/[^a-z0-9_]/', '_', str_replace(' ', '_', $col->data_type));
                    $key = $col->column_name === 'id' ? ' PK' : ($fkByTable->get($table, collect())->firstWhere('column_name', $col->column_name) ? ' FK' : '');
                    $lines[] = sprintf('        %s %s%s', $type, $col->column_name, $key);
                }
                if ($columns->get($table, collect())->count() > 12) {
                    $lines[] = '        string more_columns';
                }
                $lines[] = '    }';
            }
            $lines[] = '```';
            $lines[] = '';
        }
        $lines[] = '## Data dictionary';
        $lines[] = '';
        foreach ($grouped as $domain => $domainTables) {
            $lines[] = "### {$domain}";
            $lines[] = '';
            foreach ($domainTables as $table) {
                $lines[] = "#### `{$table}`";
                if ($comment = $comments->get($table)) {
                    $lines[] = '';
                    $lines[] = $comment;
                }
                $lines[] = '';
                $lines[] = '| Column | Type | Nullable | Default | Notes |';
                $lines[] = '|---|---|---|---|---|';
                foreach ($columns->get($table, collect()) as $col) {
                    $type = $col->data_type;
                    if ($col->character_maximum_length) {
                        $type .= "({$col->character_maximum_length})";
                    } elseif ($col->data_type === 'numeric' && $col->numeric_precision) {
                        $type .= "({$col->numeric_precision},{$col->numeric_scale})";
                    }
                    $notes = [];
                    if ($col->column_name === 'id') {
                        $notes[] = 'PK';
                    }
                    if ($fk = $fkByTable->get($table, collect())->firstWhere('column_name', $col->column_name)) {
                        $notes[] = sprintf('FK → `%s.%s` (%s)', $fk->foreign_table, $fk->foreign_column, strtolower($fk->delete_rule));
                    }
                    foreach (self::SENSITIVE as $needle) {
                        if ($col->column_name === $needle || str_contains($col->column_name, $needle)) {
                            $notes[] = '🔒';
                            break;
                        }
                    }
                    $default = $col->column_default ? '`'.str_replace('|', '\\|', mb_substr($col->column_default, 0, 40)).'`' : '';
                    $lines[] = sprintf('| `%s` | %s | %s | %s | %s |', $col->column_name, $type, $col->is_nullable === 'YES' ? 'yes' : 'no', $default, implode(' ', $notes));
                }
                $tableIndexes = $indexes->get($table, collect())->filter(fn ($i) => ! str_ends_with($i->indexname, '_pkey'));
                if ($tableIndexes->isNotEmpty()) {
                    $lines[] = '';
                    $lines[] = 'Indexes: '.$tableIndexes->map(fn ($i) => '`'.preg_replace('/^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING \w+ /', '$1', $i->indexdef).'`')->implode(', ');
                }
                $tableChecks = $checks->get($table, collect());
                if ($tableChecks->isNotEmpty()) {
                    $lines[] = '';
                    $lines[] = 'Checks: '.$tableChecks->map(fn ($c) => '`'.$c->definition.'`')->implode(', ');
                }
                $lines[] = '';
            }
        }

        $output = implode("\n", $lines)."\n";
        $path = base_path($this->option('output'));

        if ($this->option('check')) {
            $current = File::exists($path) ? File::get($path) : '';
            if (trim($current) !== trim($output)) {
                $this->error('docs/DATABASE.md is out of date. Run `php artisan ev:schema-docs`.');

                return self::FAILURE;
            }
            $this->info('docs/DATABASE.md is up to date.');

            return self::SUCCESS;
        }

        File::ensureDirectoryExists(dirname($path));
        File::put($path, $output);
        $this->info(sprintf('Wrote %s (%d tables).', $this->option('output'), count($tables)));

        return self::SUCCESS;
    }

    /** @param string[] $tables @return array<string, string[]> */
    private function groupTables(array $tables): array
    {
        $grouped = [];
        $assigned = [];
        foreach (self::DOMAINS as $domain => $patterns) {
            foreach ($tables as $table) {
                if (isset($assigned[$table])) {
                    continue;
                }
                foreach ($patterns as $pattern) {
                    if ($table === $pattern || (str_ends_with($pattern, '_') && str_starts_with($table, $pattern)) || (! str_ends_with($pattern, '_') && $table !== $pattern && str_starts_with($table, $pattern) && in_array($pattern, ['warrant', 'home_charg', 'complaint', 'expense', 'purchase_order', 'work_order', 'additional_work', 'group_buy', 'part_request', 'cost_allocation', 'campaign_'], true))) {
                        $grouped[$domain][] = $table;
                        $assigned[$table] = true;
                        break;
                    }
                }
            }
        }
        $other = array_values(array_filter($tables, fn ($t) => ! isset($assigned[$t])));
        if ($other) {
            $grouped['Other'] = $other;
        }

        return $grouped;
    }
}

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * ربط إذن التسليم بقيده المحاسبي، وإضافة حساب «بضاعة مسلّمة غير مفوترة»
 * وقواعد ترحيله للشركات القائمة (التثبيت الجديد يحصل عليها من ChartOfAccountsSeeder).
 */
return new class extends Migration
{
    private const DNI_CODE = '1110';

    public function up(): void
    {
        Schema::table('delivery_notes', function (Blueprint $t) {
            $t->foreignId('journal_entry_id')->nullable()->after('posted_at')
                ->constrained('journal_entries')->nullOnDelete();
        });

        foreach (DB::table('companies')->pluck('id') as $companyId) {
            $parentId = DB::table('accounts')
                ->where('company_id', $companyId)->where('code', '11')->value('id');

            $accountId = DB::table('accounts')
                ->where('company_id', $companyId)->where('code', self::DNI_CODE)->value('id');

            if (! $accountId) {
                $accountId = DB::table('accounts')->insertGetId([
                    'company_id' => $companyId,
                    'parent_id' => $parentId,
                    'code' => self::DNI_CODE,
                    'name_ar' => 'بضاعة مسلّمة غير مفوترة',
                    'type' => 'asset',
                    'nature' => 'debit',
                    'is_leaf' => true,
                    'control_type' => 'inventory',
                    'level' => strlen(self::DNI_CODE),
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            $inventoryId = DB::table('accounts')
                ->where('company_id', $companyId)->where('code', '1106')->value('id');

            $rules = [
                ['delivery_note', 'delivered_not_invoiced', $accountId],
                ['delivery_note', 'inventory', $inventoryId],
                ['sales_invoice_cogs', 'delivered_not_invoiced', $accountId],
            ];

            foreach ($rules as [$docType, $roleKey, $targetId]) {
                if (! $targetId) {
                    continue;
                }

                DB::table('posting_rules')->updateOrInsert(
                    ['company_id' => $companyId, 'doc_type' => $docType, 'role_key' => $roleKey],
                    [
                        'account_id' => $targetId,
                        // تحتاج مراجعة المحاسب مثل بقية القواعد
                        'is_reviewed' => false,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ],
                );
            }
        }
    }

    public function down(): void
    {
        Schema::table('delivery_notes', function (Blueprint $t) {
            $t->dropConstrainedForeignId('journal_entry_id');
        });

        DB::table('posting_rules')
            ->whereIn('doc_type', ['delivery_note'])
            ->orWhere(fn ($q) => $q->where('doc_type', 'sales_invoice_cogs')->where('role_key', 'delivered_not_invoiced'))
            ->delete();
    }
};

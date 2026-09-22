<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\User;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Models\UserLimit;
use App\Modules\Cash\Models\CashAccount;
use App\Modules\Cash\Models\ExpenseCategory;
use App\Modules\Cash\Models\PaymentMethod;
use App\Modules\Catalog\Models\PriceList;
use App\Modules\Catalog\Models\TaxGroup;
use App\Modules\Catalog\Models\Unit;
use App\Modules\Core\Models\Branch;
use App\Modules\Core\Models\PrintTemplate;
use App\Modules\Core\Models\Store;
use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Models\Warehouse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * The minimum a shop needs to start selling: one branch, one warehouse, one
 * till, one price list and the standard payment methods.
 *
 * This is NOT demo data — it is the skeleton the setup wizard fills in.
 */
class BaseSetupSeeder extends Seeder
{
    public function run(): void
    {
        $store = Store::query()->firstOrCreate(
            ['id' => 1],
            [
                'name' => 'محل تجريبي',
                'business_profile' => 'general_retail',
                'currency' => 'EGP',
                'timezone' => 'Africa/Cairo',
                'locale' => 'ar',
                'setup_completed' => false,
            ],
        );

        $branch = Branch::query()->firstOrCreate(
            ['code' => 'MAIN'],
            ['name' => 'الفرع الرئيسي', 'is_active' => true],
        );

        $warehouse = Warehouse::query()->firstOrCreate(
            ['code' => 'WH-MAIN'],
            [
                'branch_id' => $branch->id,
                'name' => 'المخزن الرئيسي',
                'type' => 'sales',
                'is_sellable' => true,
                'is_default' => true,
            ],
        );

        // Quarantine for returns that must not go straight back on the shelf.
        Warehouse::query()->firstOrCreate(
            ['code' => 'WH-RETURNS'],
            [
                'branch_id' => $branch->id,
                'name' => 'مخزن المرتجعات',
                'type' => 'returns',
                'is_sellable' => false,
                'is_default' => false,
            ],
        );

        $terminal = Terminal::query()->firstOrCreate(
            ['code' => 'POS1'],
            [
                'branch_id' => $branch->id,
                'warehouse_id' => $warehouse->id,
                'name' => 'كاشير 1',
                'offline_allowed' => true,
                'offline_max_hours' => 12,
                'offline_max_sale_amount' => '5000',
                'is_active' => true,
            ],
        );

        // ---- units -----------------------------------------------------------
        $units = [
            ['piece', 'قطعة', 0], ['box', 'علبة', 0], ['carton', 'كرتونة', 0],
            ['kg', 'كيلوجرام', 3], ['g', 'جرام', 0], ['litre', 'لتر', 3],
            ['metre', 'متر', 2], ['pack', 'باكت', 0], ['dozen', 'دستة', 0],
        ];
        foreach ($units as [$code, $name, $precision]) {
            Unit::query()->firstOrCreate(['code' => $code], ['name' => $name, 'precision' => $precision]);
        }

        // ---- cash accounts ---------------------------------------------------
        $drawer = CashAccount::query()->firstOrCreate(
            ['code' => 'DRAWER-POS1'],
            [
                'name' => 'درج كاشير 1',
                'type' => 'drawer',
                'branch_id' => $branch->id,
                'terminal_id' => $terminal->id,
                'currency' => $store->currency,
            ],
        );

        CashAccount::query()->firstOrCreate(
            ['code' => 'SAFE-MAIN'],
            ['name' => 'الخزنة الرئيسية', 'type' => 'safe', 'branch_id' => $branch->id, 'currency' => $store->currency],
        );

        // ---- payment methods -------------------------------------------------
        $methods = [
            ['cash', 'نقدي', 'cash', true, true, false, true, 1],
            ['card', 'بطاقة', 'card', false, false, true, false, 2],
            ['wallet', 'محفظة إلكترونية', 'wallet', false, false, true, false, 3],
            ['transfer', 'تحويل بنكي', 'transfer', false, false, true, false, 4],
        ];
        foreach ($methods as [$code, $name, $type, $drawerFlag, $change, $ref, $offline, $sort]) {
            PaymentMethod::query()->firstOrCreate(
                ['code' => $code],
                [
                    'name' => $name,
                    'type' => $type,
                    'affects_drawer' => $drawerFlag,
                    'allows_change' => $change,
                    'requires_reference' => $ref,
                    'allowed_offline' => $offline,
                    'sort_order' => $sort,
                    'cash_account_id' => $drawerFlag ? $drawer->id : null,
                ],
            );
        }

        // ---- price lists -----------------------------------------------------
        PriceList::query()->firstOrCreate(
            ['code' => 'RETAIL'],
            ['name' => 'أسعار التجزئة', 'type' => 'retail', 'is_default' => true, 'priority' => 10],
        );
        PriceList::query()->firstOrCreate(
            ['code' => 'WHOLESALE'],
            ['name' => 'أسعار الجملة', 'type' => 'wholesale', 'is_default' => false, 'priority' => 20],
        );

        // ---- tax groups (inactive until the shop turns taxes on) -------------
        TaxGroup::query()->firstOrCreate(
            ['code' => 'STANDARD'],
            ['name' => 'ضريبة قياسية', 'rate' => '14.0000', 'is_inclusive' => false, 'is_active' => false],
        );
        TaxGroup::query()->firstOrCreate(
            ['code' => 'EXEMPT'],
            ['name' => 'معفى', 'rate' => '0.0000', 'is_active' => false],
        );

        ExpenseCategory::query()->firstOrCreate(['name' => 'مصروفات نثرية']);
        ExpenseCategory::query()->firstOrCreate(['name' => 'إيجار']);
        ExpenseCategory::query()->firstOrCreate(['name' => 'كهرباء ومياه']);

        // ---- print templates -------------------------------------------------
        foreach ([
            ['receipt-80', 'إيصال حراري 80مم', 'receipt', '80mm', true],
            ['receipt-58', 'إيصال حراري 58مم', 'receipt', '58mm', false],
            ['invoice-a4', 'فاتورة A4', 'invoice_a4', 'a4', true],
            ['label-40x25', 'ملصق باركود 40×25', 'label', 'label', true],
            ['shift-report', 'تقرير إغلاق وردية', 'shift_report', '80mm', true],
        ] as [$code, $name, $type, $paper, $default]) {
            PrintTemplate::query()->firstOrCreate(
                ['code' => $code],
                ['name' => $name, 'type' => $type, 'paper' => $paper, 'is_default' => $default],
            );
        }

        // ---- owner account ---------------------------------------------------
        $owner = User::query()->firstOrCreate(
            ['username' => 'owner'],
            [
                'name' => 'مالك المحل',
                'email' => 'owner@example.test',
                'password' => Hash::make('ChangeMe!2026'),
                'pin_hash' => Hash::make('1234'),
                'is_active' => true,
                'default_branch_id' => $branch->id,
                'locale' => 'ar',
            ],
        );

        $ownerRole = Role::query()->where('code', 'owner')->first();
        if ($ownerRole && ! $owner->roles()->where('roles.id', $ownerRole->id)->exists()) {
            $owner->roles()->attach($ownerRole->id, ['branch_id' => null]);
        }

        UserLimit::query()->firstOrCreate(
            ['user_id' => $owner->id],
            [
                'max_discount_percent' => '100',
                'max_discount_amount' => '999999',
                'max_sale_amount' => '0',
                'max_refund_amount' => '0',
            ],
        );
    }
}

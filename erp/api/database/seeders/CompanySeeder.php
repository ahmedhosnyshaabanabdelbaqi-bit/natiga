<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\CashBox;
use App\Models\Company;
use App\Models\Region;
use App\Models\Route;
use App\Models\Vehicle;
use App\Models\Warehouse;
use App\Support\CompanyContext;
use Illuminate\Database\Seeder;

/**
 * The operating company and its physical structure.
 *
 * The non-sellable warehouses (transit, inspection, quarantine, damaged,
 * returns) are created up front because several domain services refuse to run
 * without them — goods with nowhere legitimate to go should fail loudly, not be
 * put back on the shelf.
 */
class CompanySeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::updateOrCreate(
            ['code' => 'EGD'],
            [
                // Placeholder identity — every field here is editable from
                // Settings → Company, including the name and the logo.
                'name' => 'شركة التوزيع النموذجية',
                'name_en' => 'EG Distribution',
                'legal_name' => 'شركة التوزيع النموذجية ش.م.م',
                'currency_code' => 'EGP',
                'timezone' => 'Africa/Cairo',
                'fiscal_year_start_month' => 1,
                'settings' => [
                    'inventory' => [
                        'costing_method' => 'wac',
                        'allow_negative_stock' => false,
                        'expiry_policy' => 'block_sale',
                    ],
                    'sales' => [
                        'default_payment_terms_days' => 30,
                        'require_delivery_before_invoice' => true,
                    ],
                    'privacy' => [
                        'location_retention_days' => 90,
                        'track_only_during_shift' => true,
                    ],
                    'branding' => [
                        'primary_color' => '#1f5f8b',
                        'accent_color' => '#2f8f6b',
                    ],
                ],
                'is_active' => true,
            ]
        );

        CompanyContext::set($company->id);

        $branch = Branch::updateOrCreate(
            ['company_id' => $company->id, 'code' => 'MAIN'],
            ['name' => 'الفرع الرئيسي', 'is_active' => true]
        );

        $warehouses = [
            ['MAIN', 'المخزن الرئيسي', 'main', true],
            ['TRANSIT', 'بضاعة بالطريق', 'transit', false],
            ['INSPECT', 'تحت الفحص', 'inspection', false],
            ['QUAR', 'الحجر', 'quarantine', false],
            ['DAMAGED', 'التالف', 'damaged', false],
            ['RETURNS', 'مرتجعات للمورد', 'returns', false],
        ];

        foreach ($warehouses as [$code, $name, $kind, $sellable]) {
            Warehouse::updateOrCreate(
                ['company_id' => $company->id, 'code' => $code],
                [
                    'branch_id' => $branch->id,
                    'name' => $name,
                    'kind' => $kind,
                    'is_sellable' => $sellable,
                    'is_active' => true,
                ]
            );
        }

        CashBox::updateOrCreate(
            ['company_id' => $company->id, 'code' => 'MAIN'],
            [
                'branch_id' => $branch->id,
                'name' => 'الخزنة الرئيسية',
                'account_id' => \App\Models\Account::where('code', '1110')->value('id'),
                'currency_code' => 'EGP',
                'is_active' => true,
            ]
        );

        $region = Region::updateOrCreate(
            ['company_id' => $company->id, 'code' => 'CAI'],
            ['name' => 'القاهرة الكبرى', 'is_active' => true]
        );

        Route::updateOrCreate(
            ['company_id' => $company->id, 'code' => 'R1'],
            ['region_id' => $region->id, 'name' => 'خط سير مدينة نصر', 'is_active' => true]
        );

        Vehicle::updateOrCreate(
            ['company_id' => $company->id, 'code' => 'V1'],
            [
                'branch_id' => $branch->id,
                'plate_no' => 'أ ب ج 1234',
                'model' => 'سوزوكي 2022',
                'capacity_weight' => 1000,
                'is_active' => true,
            ]
        );
    }
}

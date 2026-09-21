<?php

namespace Database\Seeders;

use App\Domain\Field\CashDepositService;
use App\Domain\Field\CommissionService;
use App\Domain\Field\ExpenseService;
use App\Domain\Inventory\StockTransferService;
use App\Domain\Purchasing\GoodsReceiptService;
use App\Domain\Purchasing\SupplierInvoiceService;
use App\Domain\Sales\CustomerReceiptService;
use App\Domain\Sales\SalesInvoiceService;
use App\Domain\Sales\SalesReturnService;
use App\Models\Account;
use App\Models\Brand;
use App\Models\Company;
use App\Models\CommissionRule;
use App\Models\CommissionRuleTier;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\ItemCategory;
use App\Models\ItemUom;
use App\Models\PriceList;
use App\Models\PriceListLine;
use App\Models\Region;
use App\Models\Role;
use App\Models\Salesman;
use App\Models\Supplier;
use App\Models\Uom;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Visit;
use App\Models\VisitPlan;
use App\Models\VisitPlanLine;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * بيانات اختبار للتشغيل التجريبي — منفصلة تمامًا عن بيانات التشغيل الفعلي.
 * تُنفّذ يوم توزيع كاملًا: استلام ← تحميل ← بيع ← تحصيل ← مرتجع ← إيداع ← مصروف.
 */
class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::firstOrFail();
        $companyId = (int) $company->id;
        $branchId = (int) $company->branches()->value('id');
        $admin = User::where('is_super_admin', true)->firstOrFail();
        $today = now()->toDateString();

        $this->command?->info('إنشاء البيانات المرجعية…');

        $pcs = Uom::where('company_id', $companyId)->where('code', 'PCS')->firstOrFail();
        $ctn = Uom::where('company_id', $companyId)->where('code', 'CTN')->firstOrFail();
        $kg = Uom::where('company_id', $companyId)->where('code', 'KG')->firstOrFail();

        $mainWarehouse = Warehouse::where('company_id', $companyId)->where('code', 'MAIN')->firstOrFail();
        $priceList = PriceList::where('company_id', $companyId)->where('code', 'WHOLESALE')->firstOrFail();
        $retailList = PriceList::where('company_id', $companyId)->where('code', 'RETAIL')->firstOrFail();

        $categories = collect([
            ['CLEAN', 'منظفات'],
            ['FOOD', 'مواد غذائية'],
            ['COSM', 'مستحضرات تجميل'],
            ['ELEC', 'أدوات كهربائية'],
        ])->mapWithKeys(fn ($c) => [$c[0] => ItemCategory::updateOrCreate(
            ['company_id' => $companyId, 'code' => $c[0]],
            ['name' => $c[1]],
        )]);

        $brands = collect([['BR1', 'النيل'], ['BR2', 'الدلتا'], ['BR3', 'الصعيد']])
            ->mapWithKeys(fn ($b) => [$b[0] => Brand::updateOrCreate(
                ['company_id' => $companyId, 'code' => $b[0]],
                ['name' => $b[1]],
            )]);

        // [كود, اسم, تصنيف, علامة, تكلفة القطعة, سعر الجملة, سعر القطاعي, قطع بالكرتونة, صلاحية]
        $catalog = [
            ['CLN-001', 'منظف أرضيات 1 لتر', 'CLEAN', 'BR1', '50', '80', '92', 12, false],
            ['CLN-002', 'سائل جلي 750 مل', 'CLEAN', 'BR1', '28', '45', '54', 24, false],
            ['CLN-003', 'مسحوق غسيل 2 كجم', 'CLEAN', 'BR2', '95', '140', '160', 6, false],
            ['FOD-001', 'زيت ذرة 1 لتر', 'FOOD', 'BR2', '62', '88', '99', 12, true],
            ['FOD-002', 'أرز مصري 5 كجم', 'FOOD', 'BR3', '135', '185', '205', 4, true],
            ['FOD-003', 'سكر ناعم 1 كجم', 'FOOD', 'BR3', '32', '46', '52', 20, true],
            ['CSM-001', 'شامبو 400 مل', 'COSM', 'BR1', '58', '92', '108', 12, true],
            ['CSM-002', 'صابون تجميل 125 جم', 'COSM', 'BR2', '14', '24', '29', 48, true],
            ['ELC-001', 'كشاف LED 9 وات', 'ELEC', 'BR3', '70', '110', '128', 20, false],
            ['ELC-002', 'وصلة كهرباء 3 متر', 'ELEC', 'BR3', '85', '135', '155', 10, false],
        ];

        $items = [];
        foreach ($catalog as [$code, $name, $cat, $brand, $cost, $wholesale, $retail, $perCarton, $hasExpiry]) {
            $item = Item::updateOrCreate(
                ['company_id' => $companyId, 'code' => $code],
                [
                    'name_ar' => $name,
                    'category_id' => $categories[$cat]->id,
                    'brand_id' => $brands[$brand]->id,
                    'base_uom_id' => $pcs->id,
                    'track_batches' => $hasExpiry,
                    'track_expiry' => $hasExpiry,
                    'block_sale_days_before_expiry' => $hasExpiry ? 7 : 0,
                    'reorder_point' => '60',
                    'reorder_qty' => '240',
                    'lead_time_days' => 5,
                    'is_active' => true,
                ],
            );

            ItemUom::updateOrCreate(['item_id' => $item->id, 'uom_id' => $pcs->id], ['factor' => '1', 'is_base' => true, 'is_sales_default' => true]);
            ItemUom::updateOrCreate(['item_id' => $item->id, 'uom_id' => $ctn->id], ['factor' => (string) $perCarton, 'is_purchase_default' => true]);

            foreach ([[$priceList, $wholesale], [$retailList, $retail]] as [$list, $price]) {
                PriceListLine::updateOrCreate(
                    ['price_list_id' => $list->id, 'item_id' => $item->id, 'uom_id' => $pcs->id, 'min_qty' => '0'],
                    ['price' => $price, 'max_discount_pct' => '5', 'valid_from' => now()->startOfYear()->toDateString()],
                );
                // شريحة كمية: خصم عند 100 قطعة فأكثر
                PriceListLine::updateOrCreate(
                    ['price_list_id' => $list->id, 'item_id' => $item->id, 'uom_id' => $pcs->id, 'min_qty' => '100'],
                    ['price' => (string) round((float) $price * 0.96, 2), 'max_discount_pct' => '3', 'valid_from' => now()->startOfYear()->toDateString()],
                );
            }

            $items[$code] = $item;
        }

        // صنف يُباع بالوزن
        $weighted = Item::updateOrCreate(
            ['company_id' => $companyId, 'code' => 'FOD-004'],
            [
                'name_ar' => 'تمر سائب (بالكيلو)',
                'category_id' => $categories['FOOD']->id,
                'base_uom_id' => $kg->id,
                'is_weighted' => true,
                'track_expiry' => true,
                'track_batches' => true,
                'reorder_point' => '40',
            ],
        );
        ItemUom::updateOrCreate(['item_id' => $weighted->id, 'uom_id' => $kg->id], ['factor' => '1', 'is_base' => true, 'is_sales_default' => true]);
        PriceListLine::updateOrCreate(
            ['price_list_id' => $priceList->id, 'item_id' => $weighted->id, 'uom_id' => $kg->id, 'min_qty' => '0'],
            ['price' => '78', 'valid_from' => now()->startOfYear()->toDateString()],
        );
        $items['FOD-004'] = $weighted;

        $this->command?->info('إنشاء الموردين والمناطق والمناديب…');

        $suppliers = [];
        foreach ([['SUP-001', 'شركة النيل للمنظفات', 30], ['SUP-002', 'مصنع الدلتا للأغذية', 45], ['SUP-003', 'الصعيد للأدوات الكهربائية', 15]] as [$code, $name, $terms]) {
            $suppliers[$code] = Supplier::updateOrCreate(
                ['company_id' => $companyId, 'code' => $code],
                ['name' => $name, 'payment_term_days' => $terms, 'lead_time_days' => 5, 'is_active' => true],
            );
        }

        $regions = [];
        foreach ([['REG-1', 'شمال القاهرة'], ['REG-2', 'جنوب القاهرة'], ['REG-3', 'الجيزة']] as [$code, $name]) {
            $regions[$code] = Region::updateOrCreate(
                ['company_id' => $companyId, 'code' => $code],
                ['branch_id' => $branchId, 'name' => $name],
            );
        }

        $salesmanRole = Role::where('company_id', $companyId)->where('code', 'salesman')->first();
        $supervisorRole = Role::where('company_id', $companyId)->where('code', 'supervisor')->first();
        $accountantRole = Role::where('company_id', $companyId)->where('code', 'accountant')->first();

        // مشرف
        $supervisorUser = User::updateOrCreate(
            ['username' => 'supervisor'],
            [
                'company_id' => $companyId, 'branch_id' => $branchId, 'name' => 'مشرف المناديب',
                'password' => 'Demo-Supervisor-2026', 'is_active' => true, 'must_change_password' => true,
            ],
        );
        if ($supervisorRole) {
            $supervisorUser->roles()->syncWithoutDetaching([$supervisorRole->id]);
        }

        $supervisor = Salesman::updateOrCreate(
            ['company_id' => $companyId, 'code' => 'SUP-01'],
            ['branch_id' => $branchId, 'name' => 'مشرف المناديب', 'primary_role' => 'presale', 'user_id' => $supervisorUser->id],
        );

        // محاسب
        $accountantUser = User::updateOrCreate(
            ['username' => 'accountant'],
            [
                'company_id' => $companyId, 'branch_id' => $branchId, 'name' => 'محاسب الشركة',
                'password' => 'Demo-Accountant-2026', 'is_active' => true, 'must_change_password' => true,
            ],
        );
        if ($accountantRole) {
            $accountantUser->roles()->syncWithoutDetaching([$accountantRole->id]);
        }

        $salesmen = [];
        foreach ([
            ['SLM-001', 'أحمد سعيد', 'REG-1', 'ح ب ن 1234', 'salesman1'],
            ['SLM-002', 'محمود فؤاد', 'REG-2', 'ح ب ن 5678', 'salesman2'],
            ['SLM-003', 'كريم عادل', 'REG-3', 'ح ب ن 9012', 'salesman3'],
        ] as $index => [$code, $name, $regionCode, $plate, $username]) {
            $vehicle = Vehicle::updateOrCreate(
                ['company_id' => $companyId, 'code' => 'VEH-'.($index + 1)],
                ['branch_id' => $branchId, 'plate_no' => $plate, 'model' => 'سوزوكي', 'capacity_weight_kg' => '800',
                 'next_maintenance_date' => now()->addMonth()->toDateString()],
            );

            $user = User::updateOrCreate(
                ['username' => $username],
                [
                    'company_id' => $companyId, 'branch_id' => $branchId, 'name' => $name,
                    'password' => 'Demo-Salesman-2026', 'is_active' => true, 'must_change_password' => true,
                ],
            );
            if ($salesmanRole) {
                $user->roles()->syncWithoutDetaching([$salesmanRole->id]);
            }

            $salesman = Salesman::updateOrCreate(
                ['company_id' => $companyId, 'code' => $code],
                [
                    'branch_id' => $branchId, 'name' => $name, 'primary_role' => 'van_sale',
                    'supervisor_id' => $supervisor->id, 'vehicle_id' => $vehicle->id,
                    'user_id' => $user->id, 'max_discount_pct' => '3', 'cash_custody_limit' => '20000',
                ],
            );

            $van = Warehouse::updateOrCreate(
                ['company_id' => $companyId, 'code' => 'VAN-'.($index + 1)],
                [
                    'branch_id' => $branchId, 'name' => "سيارة {$name}", 'type' => 'van',
                    'vehicle_id' => $vehicle->id, 'salesman_id' => $salesman->id, 'is_sellable' => true,
                ],
            );

            $salesman->warehouse_id = $van->id;
            $salesman->save();

            Device::updateOrCreate(
                ['company_id' => $companyId, 'device_uid' => 'ANDROID-DEMO-'.($index + 1)],
                [
                    'user_id' => $user->id, 'salesman_id' => $salesman->id,
                    'label' => "جهاز {$name}", 'platform' => 'android', 'app_version' => '1.0.0',
                    'is_active' => true, 'offline_authorized_until' => now()->addDay(),
                ],
            );

            $salesmen[$code] = ['salesman' => $salesman, 'warehouse' => $van, 'region' => $regions[$regionCode]];
        }

        $this->command?->info('إنشاء العملاء…');

        $customerNames = [
            ['CUS-001', 'سوبر ماركت النور', 'SLM-001', 'retail_shop', '60000'],
            ['CUS-002', 'بقالة الأمل', 'SLM-001', 'retail_shop', '25000'],
            ['CUS-003', 'هايبر الصفا', 'SLM-001', 'wholesaler', '150000'],
            ['CUS-004', 'ماركت الشروق', 'SLM-002', 'retail_shop', '40000'],
            ['CUS-005', 'موزع شرق القاهرة', 'SLM-002', 'distributor', '250000'],
            ['CUS-006', 'بقالة السلام', 'SLM-002', 'retail_shop', '18000'],
            ['CUS-007', 'سوبر ماركت الحرية', 'SLM-003', 'retail_shop', '55000'],
            ['CUS-008', 'شركة المقاولون العرب - إعاشة', 'SLM-003', 'contractor', '300000'],
            ['CUS-009', 'ماركت الوفاء', 'SLM-003', 'retail_shop', '30000'],
            ['CUS-010', 'عميل نقدي', 'SLM-001', 'cash', '0'],
        ];

        $customers = [];
        foreach ($customerNames as $i => [$code, $name, $salesmanCode, $type, $limit]) {
            $context = $salesmen[$salesmanCode];

            $customers[$code] = Customer::updateOrCreate(
                ['company_id' => $companyId, 'code' => $code],
                [
                    'branch_id' => $branchId,
                    'name' => $name,
                    'business_type' => $type,
                    'region_id' => $context['region']->id,
                    'salesman_id' => $context['salesman']->id,
                    'price_list_id' => $type === 'retail_shop' ? $retailList->id : $priceList->id,
                    'credit_limit' => $limit,
                    'payment_term_days' => $type === 'cash' ? 0 : 30,
                    'is_cash_customer' => $type === 'cash',
                    'phone' => '010'.str_pad((string) (10000000 + $i), 8, '0', STR_PAD_LEFT),
                    'address' => 'القاهرة',
                    'grade' => ['A', 'B', 'C'][$i % 3],
                    'is_active' => true,
                ],
            );
        }

        $this->command?->info('تنفيذ دورة توزيع كاملة…');

        // ---------- 1) الشراء والاستلام ----------
        $receiptLines = [];
        foreach ($catalog as [$code, , , , $cost, , , $perCarton, $hasExpiry]) {
            $receiptLines[] = [
                'item_id' => $items[$code]->id,
                'uom_id' => $ctn->id,
                'qty_uom' => '40',
                'unit_price' => (string) ((float) $cost * $perCarton),
                'batch_no' => $hasExpiry ? 'B-'.date('ym').'-'.substr($code, -3) : null,
                'expiry_date' => $hasExpiry ? now()->addMonths(9)->toDateString() : null,
            ];
        }
        $receiptLines[] = [
            'item_id' => $weighted->id, 'uom_id' => $kg->id, 'qty_uom' => '300', 'unit_price' => '52',
            'batch_no' => 'B-'.date('ym').'-DAT', 'expiry_date' => now()->addMonths(6)->toDateString(),
        ];

        $receipt = app(GoodsReceiptService::class)->createAndPost([
            'company_id' => $companyId, 'branch_id' => $branchId,
            'supplier_id' => $suppliers['SUP-001']->id,
            'warehouse_id' => $mainWarehouse->id,
            'receipt_date' => now()->subDays(3)->toDateString(),
            'user_id' => $admin->id,
            'lines' => $receiptLines,
        ]);

        app(SupplierInvoiceService::class)->createAndPost([
            'company_id' => $companyId, 'branch_id' => $branchId,
            'supplier_id' => $suppliers['SUP-001']->id,
            'invoice_date' => now()->subDays(3)->toDateString(),
            'supplier_invoice_no' => 'INV-SUP-9001',
            'payment_type' => 'credit',
            'payment_term_days' => 30,
            'user_id' => $admin->id,
            'lines' => $receipt->lines->map(fn ($l) => [
                'item_id' => $l->item_id,
                'uom_id' => $l->uom_id,
                'qty_uom' => $l->qty_uom,
                'unit_price' => (string) (float) bcCompatMul($l->unit_cost, $l->uom_factor),
                'goods_receipt_line_id' => $l->id,
            ])->all(),
        ]);

        // ---------- 2) تحميل السيارات ----------
        $transferService = app(StockTransferService::class);

        foreach ($salesmen as $context) {
            DB::transaction(function () use ($transferService, $companyId, $branchId, $admin, $mainWarehouse, $context, $items, $ctn, $catalog, $today) {
                $lines = [];
                foreach (array_slice($catalog, 0, 6) as [$code]) {
                    $lines[] = ['item_id' => $items[$code]->id, 'uom_id' => $ctn->id, 'qty_uom' => '8'];
                }

                $transfer = $transferService->create([
                    'company_id' => $companyId, 'branch_id' => $branchId,
                    'transfer_date' => $today,
                    'from_warehouse_id' => $mainWarehouse->id,
                    'to_warehouse_id' => $context['warehouse']->id,
                    'purpose' => 'van_load',
                    'user_id' => $admin->id,
                    'lines' => $lines,
                ]);

                $transfer = $transferService->send($transfer, $admin->id);

                $transferService->receive(
                    $transfer,
                    $transfer->lines->map(fn ($l) => ['line_id' => $l->id, 'received_qty_uom' => $l->qty_uom])->all(),
                    $admin->id,
                );
            });
        }

        // ---------- 3) قاعدة عمولة ----------
        $rule = CommissionRule::updateOrCreate(
            ['company_id' => $companyId, 'code' => 'STD', 'version' => 1],
            [
                'name' => 'عمولة مبيعات قياسية 2%',
                'role_type' => 'sales', 'base' => 'net_sales', 'share_pct' => '100',
                'exclude_tax' => true, 'deduct_returns' => true, 'require_collection' => false,
                'valid_from' => now()->startOfYear()->toDateString(), 'is_active' => true,
            ],
        );
        CommissionRuleTier::updateOrCreate(
            ['commission_rule_id' => $rule->id, 'from_amount' => '0'],
            ['to_amount' => null, 'rate_pct' => '2'],
        );

        // ---------- 4) البيع والتحصيل والمرتجع ----------
        $invoiceService = app(SalesInvoiceService::class);
        $receiptService = app(CustomerReceiptService::class);
        $commissionService = app(CommissionService::class);

        $created = [];

        foreach ($customers as $code => $customer) {
            if ($customer->business_type === 'cash') {
                continue;
            }

            $context = collect($salesmen)->first(fn ($s) => (int) $s['salesman']->id === (int) $customer->salesman_id);

            $lines = [];
            foreach (array_slice($catalog, 0, 3) as $i => [$itemCode, , , , , $wholesale]) {
                $lines[] = [
                    'item_id' => $items[$itemCode]->id,
                    'uom_id' => $pcs->id,
                    'qty_uom' => (string) (6 + $i * 4),
                    'unit_price' => $wholesale,
                    'discount_pct' => $i === 0 ? '2' : '0',
                ];
            }

            $invoice = $invoiceService->createAndPost([
                'company_id' => $companyId, 'branch_id' => $branchId,
                'customer_id' => $customer->id,
                'salesman_id' => $customer->salesman_id,
                'warehouse_id' => $context['warehouse']->id,
                'invoice_date' => $today,
                'payment_type' => 'credit',
                'channel' => 'van_sale',
                'user_id' => $admin->id,
                'lines' => $lines,
            ]);

            $commissionService->accrueForInvoice($invoice);
            $created[$code] = $invoice;

            // تحصيل جزئي لبعض العملاء
            if (in_array($code, ['CUS-001', 'CUS-003', 'CUS-005', 'CUS-007'], true)) {
                $amount = (string) round((float) $invoice->total_amount * 0.6, 2);

                $receiptService->createAndPost([
                    'company_id' => $companyId, 'branch_id' => $branchId,
                    'customer_id' => $customer->id,
                    'salesman_id' => $customer->salesman_id,
                    'receipt_date' => $today,
                    'payment_method' => 'cash',
                    'amount' => $amount,
                    'user_id' => $admin->id,
                    'allocations' => [['sales_invoice_id' => $invoice->id, 'amount' => $amount]],
                ]);
            }
        }

        // مرتجع من عميل
        $returnTarget = $created['CUS-002'];
        $returnLine = $returnTarget->lines->first();

        $salesReturn = app(SalesReturnService::class)->createReceiveAndPost([
            'company_id' => $companyId, 'branch_id' => $branchId,
            'customer_id' => $returnTarget->customer_id,
            'sales_invoice_id' => $returnTarget->id,
            'salesman_id' => $returnTarget->salesman_id,
            'warehouse_id' => $returnTarget->warehouse_id,
            'return_date' => $today,
            'settlement_type' => 'credit_note',
            'reason' => 'الصنف غير مطابق للطلب',
            'user_id' => $admin->id,
            'lines' => [[
                'sales_invoice_line_id' => $returnLine->id,
                'item_id' => $returnLine->item_id,
                'uom_id' => $returnLine->uom_id,
                'qty_uom' => '2',
                'condition' => 'saleable',
            ]],
        ]);
        $commissionService->adjustForReturn($salesReturn);

        // ---------- 5) توريد العهدة والمصروفات ----------
        foreach ($salesmen as $context) {
            $salesman = $context['salesman']->fresh();
            if (! $salesman->custody_cash_box_id) {
                continue;
            }

            $custodyBalance = DB::table('customer_receipts')
                ->where('salesman_id', $salesman->id)
                ->where('status', 'posted')
                ->where('payment_method', 'cash')
                ->sum('amount');

            if ((float) $custodyBalance <= 0) {
                continue;
            }

            $expenseAccount = Account::where('company_id', $companyId)->where('code', '5201')->firstOrFail();
            $expenseAmount = min(150, (float) $custodyBalance * 0.05);

            app(ExpenseService::class)->createApproveAndPost([
                'company_id' => $companyId, 'branch_id' => $branchId,
                'expense_date' => $today,
                'account_id' => $expenseAccount->id,
                'category' => 'fuel',
                'amount' => (string) round($expenseAmount, 2),
                'paid_from' => 'salesman_custody',
                'salesman_id' => $salesman->id,
                'vehicle_id' => $salesman->vehicle_id,
                'description' => 'وقود اليوم',
                'user_id' => $admin->id,
                'approved_by' => $supervisorUser->id,
            ]);

            $depositAmount = round((float) $custodyBalance - $expenseAmount, 2);

            if ($depositAmount > 0) {
                app(CashDepositService::class)->createAndPost([
                    'company_id' => $companyId, 'branch_id' => $branchId,
                    'deposit_date' => $today,
                    'salesman_id' => $salesman->id,
                    'from_cash_box_id' => $salesman->custody_cash_box_id,
                    'to_cash_box_id' => \App\Models\CashBox::where('company_id', $companyId)->where('code', 'MAIN')->value('id'),
                    'amount' => (string) $depositAmount,
                    'reference_no' => 'DEP-'.$salesman->code,
                    'user_id' => $admin->id,
                ]);
            }
        }

        // ---------- 6) خطط الزيارات ----------
        foreach ($salesmen as $context) {
            $plan = VisitPlan::updateOrCreate(
                ['company_id' => $companyId, 'salesman_id' => $context['salesman']->id, 'plan_date' => $today],
                ['status' => 'active', 'frequency' => 'daily'],
            );

            $planCustomers = Customer::where('salesman_id', $context['salesman']->id)->get();

            foreach ($planCustomers as $seq => $customer) {
                VisitPlanLine::updateOrCreate(
                    ['visit_plan_id' => $plan->id, 'customer_id' => $customer->id],
                    ['sequence' => $seq + 1, 'status' => 'planned'],
                );

                // تنفيذ معظم الزيارات
                if ($seq < $planCustomers->count() - 1) {
                    Visit::updateOrCreate(
                        ['company_id' => $companyId, 'client_uuid' => \Illuminate\Support\Str::uuid()->toString()],
                        [
                            'salesman_id' => $context['salesman']->id,
                            'customer_id' => $customer->id,
                            'visit_plan_id' => $plan->id,
                            'visit_date' => $today,
                            'started_at' => now()->subHours(4 - $seq),
                            'ended_at' => now()->subHours(4 - $seq)->addMinutes(22),
                            'result' => $customer->business_type === 'cash' ? 'no_purchase' : 'order',
                            'no_purchase_reason' => $customer->business_type === 'cash' ? 'المحل مغلق' : null,
                            'is_planned' => true,
                            'gps_available' => true,
                            'gps_accuracy_m' => '12.5',
                        ],
                    );
                }
            }
        }

        $this->command?->info('اكتملت البيانات التجريبية.');
        $this->command?->table(
            ['البند', 'العدد'],
            [
                ['الأصناف', Item::where('company_id', $companyId)->count()],
                ['العملاء', Customer::where('company_id', $companyId)->count()],
                ['المناديب', Salesman::where('company_id', $companyId)->count()],
                ['فواتير البيع', DB::table('sales_invoices')->count()],
                ['سندات القبض', DB::table('customer_receipts')->count()],
                ['القيود', DB::table('journal_entries')->count()],
                ['الحركات المخزنية', DB::table('stock_movements')->count()],
            ],
        );
    }
}

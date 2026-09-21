<?php

namespace Tests\Support;

use App\Models\Branch;
use App\Models\CashBox;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemUom;
use App\Models\PriceList;
use App\Models\PriceListLine;
use App\Models\Salesman;
use App\Models\Supplier;
use App\Models\Uom;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\CompanySetupSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * بناء بيئة اختبار واقعية: شركة، دليل حسابات، مصفوفة ترحيل، أصناف، وحدات،
 * عميل ومورد ومندوب وسيارة — بيانات اختبار منفصلة تمامًا عن بيانات التشغيل.
 */
class ScenarioBuilder
{
    public Company $company;
    public Branch $branch;
    public User $user;
    public Warehouse $mainWarehouse;
    public Warehouse $vanWarehouse;
    public Salesman $salesman;
    public Customer $customer;
    public Supplier $supplier;
    public Item $item;
    public Uom $pieceUom;
    public Uom $cartonUom;
    public CashBox $companyCashBox;
    public PriceList $priceList;

    public function build(array $options = []): self
    {
        (new PermissionSeeder)->run();

        $this->company = (new CompanySetupSeeder)->run([
            'company_name' => $options['company_name'] ?? 'محمد فياض للتوزيع',
            'code' => 'TEST',
            'year' => (int) ($options['year'] ?? now()->year),
        ]);

        (new ChartOfAccountsSeeder)->run($this->company);
        $this->company = (new CompanySetupSeeder)->run(['code' => 'TEST', 'company_name' => $this->company->name_ar]);
        (new RoleSeeder)->run($this->company);

        $this->branch = Branch::where('company_id', $this->company->id)->firstOrFail();

        $this->user = User::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'name' => 'مستخدم اختبار',
            'username' => 'tester',
            'password' => 'secret-test-password',
            'is_active' => true,
            'is_super_admin' => true,
        ]);

        $this->mainWarehouse = Warehouse::where('company_id', $this->company->id)->where('code', 'MAIN')->firstOrFail();
        $this->companyCashBox = CashBox::where('company_id', $this->company->id)->where('code', 'MAIN')->firstOrFail();
        $this->priceList = PriceList::where('company_id', $this->company->id)->where('code', 'WHOLESALE')->firstOrFail();

        $this->pieceUom = Uom::where('company_id', $this->company->id)->where('code', 'PCS')->firstOrFail();
        $this->cartonUom = Uom::where('company_id', $this->company->id)->where('code', 'CTN')->firstOrFail();

        // صنف: الوحدة الأساسية قطعة، والكرتونة = 12 قطعة
        $this->item = Item::create([
            'company_id' => $this->company->id,
            'code' => 'ITM-001',
            'name_ar' => 'منظف أرضيات 1 لتر',
            'base_uom_id' => $this->pieceUom->id,
            'is_active' => true,
        ]);

        ItemUom::create([
            'item_id' => $this->item->id,
            'uom_id' => $this->pieceUom->id,
            'factor' => '1',
            'is_base' => true,
            'is_sales_default' => true,
        ]);

        ItemUom::create([
            'item_id' => $this->item->id,
            'uom_id' => $this->cartonUom->id,
            'factor' => '12',
            'is_purchase_default' => true,
        ]);

        PriceListLine::create([
            'price_list_id' => $this->priceList->id,
            'item_id' => $this->item->id,
            'uom_id' => $this->pieceUom->id,
            'min_qty' => '0',
            'price' => '80.0000',
            'valid_from' => now()->startOfYear()->toDateString(),
        ]);

        $this->supplier = Supplier::create([
            'company_id' => $this->company->id,
            'code' => 'SUP-001',
            'name' => 'مورد المنظفات',
            'payment_term_days' => 30,
        ]);

        $this->salesman = Salesman::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'code' => 'SLM-001',
            'name' => 'مندوب المنطقة الأولى',
            'primary_role' => 'van_sale',
        ]);

        // مخزن السيارة — مخزون مستقل لكل سيارة
        $this->vanWarehouse = Warehouse::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'code' => 'VAN-001',
            'name' => 'سيارة المندوب 1',
            'type' => 'van',
            'salesman_id' => $this->salesman->id,
            'is_sellable' => true,
        ]);

        $this->salesman->warehouse_id = $this->vanWarehouse->id;
        $this->salesman->save();

        $this->customer = Customer::create([
            'company_id' => $this->company->id,
            'branch_id' => $this->branch->id,
            'code' => 'CUS-001',
            'name' => 'سوبر ماركت النور',
            'salesman_id' => $this->salesman->id,
            'price_list_id' => $this->priceList->id,
            'credit_limit' => '50000.0000',
            'payment_term_days' => 30,
        ]);

        return $this;
    }
}

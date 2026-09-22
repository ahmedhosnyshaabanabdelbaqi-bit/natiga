<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Models\User;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Models\UserLimit;
use App\Modules\Access\Services\PermissionService;
use App\Modules\Cash\Models\PaymentMethod;
use App\Modules\Cash\Models\Shift;
use App\Modules\Cash\Services\ShiftService;
use App\Modules\Catalog\Models\Product;
use App\Modules\Catalog\Models\ProductVariant;
use App\Modules\Catalog\Services\ProductService;
use App\Modules\Core\Models\Branch;
use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Models\Warehouse;
use App\Modules\Core\Services\PosContext;
use App\Modules\Customers\Models\Customer;
use App\Modules\Purchasing\Models\Supplier;
use App\Modules\Purchasing\Services\PurchaseService;
use App\Support\Money;
use Illuminate\Support\Facades\Hash;

/**
 * Shared fixture builder: a real shop with a real branch, till, stock and an
 * open shift. Tests assert against genuine database state, not mocks.
 */
class PosTestFixture
{
    public Branch $branch;

    public Warehouse $warehouse;

    public Warehouse $returnsWarehouse;

    public Terminal $terminal;

    public User $cashier;

    public User $manager;

    public Supplier $supplier;

    public ?Shift $shift = null;

    public function __construct()
    {
        $this->branch = Branch::query()->where('code', 'MAIN')->firstOrFail();
        $this->warehouse = Warehouse::query()->where('code', 'WH-MAIN')->firstOrFail();
        $this->returnsWarehouse = Warehouse::query()->where('code', 'WH-RETURNS')->firstOrFail();
        $this->terminal = Terminal::query()->where('code', 'POS1')->firstOrFail();

        $this->cashier = $this->makeUser('cashier1', 'كاشير اختبار', 'cashier', [
            'max_discount_percent' => '5',
            'max_discount_amount' => '20',
        ]);

        $this->manager = $this->makeUser('manager1', 'مدير اختبار', 'branch_manager', [
            'max_discount_percent' => '50',
            'max_discount_amount' => '5000',
        ]);

        $this->supplier = Supplier::query()->firstOrCreate(
            ['code' => 'SUP-TEST'],
            ['name' => 'مورد اختبار', 'is_active' => true],
        );
    }

    /** @param array<string,string> $limits */
    public function makeUser(string $username, string $name, string $roleCode, array $limits = []): User
    {
        $user = User::query()->firstOrCreate(
            ['username' => $username],
            [
                'name' => $name,
                'email' => $username.'@example.test',
                'password' => Hash::make('secret'),
                'is_active' => true,
                'default_branch_id' => $this->branch->id,
            ],
        );

        $role = Role::query()->where('code', $roleCode)->firstOrFail();
        if (! $user->roles()->where('roles.id', $role->id)->exists()) {
            $user->roles()->attach($role->id, ['branch_id' => null]);
        }

        UserLimit::query()->updateOrCreate(['user_id' => $user->id], $limits + [
            'max_discount_percent' => '0',
            'max_discount_amount' => '0',
        ]);

        return $user->fresh(['roles', 'limits']);
    }

    /** Point the domain services at a user/terminal, as the middleware would. */
    public function actAs(User $user, ?Terminal $terminal = null): void
    {
        app(PosContext::class)->set($user, $terminal ?? $this->terminal, $this->branch->id);
        app(PermissionService::class)->flush();
    }

    public function openShift(?User $user = null, string $float = '500'): Shift
    {
        $user ??= $this->cashier;
        $this->actAs($user);
        $this->shift = app(ShiftService::class)->open($this->terminal, $user, Money::of($float));
        app(PosContext::class)->forgetShift();
        $this->actAs($user);

        return $this->shift;
    }

    /**
     * Create a product and put stock in at a known cost.
     *
     * @param  array<string,mixed>  $overrides
     */
    public function product(string $sku, string $name, string $price, string $cost = '0', string $stock = '0', array $overrides = []): Product
    {
        // Idempotent: a test may ask for the same product more than once.
        $existing = Product::query()->where('sku', $sku)->first();
        if ($existing) {
            if ((string) $stock !== '0') {
                $this->receive($existing, $stock, $cost);
            }

            return $existing->fresh(['variants', 'units.unit', 'barcodes']);
        }

        $product = app(ProductService::class)->create(array_merge([
            'sku' => $sku,
            'name' => $name,
            'base_unit' => 'piece',
            'barcodes' => [['code' => 'BC-'.$sku]],
            'prices' => [['price_list' => 'RETAIL', 'price' => $price]],
        ], $overrides));

        if ((string) $stock !== '0') {
            $this->receive($product, $stock, $cost);
        }

        return $product->fresh(['variants', 'units.unit', 'barcodes']);
    }

    public function receive(Product $product, string $qty, string $unitCost, ?string $unitCode = null, ?array $serials = null, ?string $batchCode = null, ?string $expiry = null): void
    {
        $variant = $product->variants()->where('is_default', true)->firstOrFail();
        $productUnit = $unitCode
            ? $product->units()->whereHas('unit', fn ($q) => $q->where('code', $unitCode))->firstOrFail()
            : $product->units()->where('is_base', true)->firstOrFail();

        app(PurchaseService::class)->receive([
            'supplier_id' => $this->supplier->id,
            'warehouse_id' => $this->warehouse->id,
            'branch_id' => $this->branch->id,
            'lines' => [array_filter([
                'variant_id' => $variant->id,
                'product_unit_id' => $productUnit->id,
                'qty' => $qty,
                'unit_cost' => $unitCost,
                'serials' => $serials,
                'batch_code' => $batchCode,
                'expiry_date' => $expiry,
            ], fn ($v) => $v !== null)],
        ]);
    }

    public function variantOf(Product $product): ProductVariant
    {
        return $product->variants()->where('is_default', true)->firstOrFail();
    }

    public function baseUnitId(Product $product): int
    {
        return (int) $product->units()->where('is_base', true)->value('id');
    }

    public function method(string $code): PaymentMethod
    {
        return PaymentMethod::query()->where('code', $code)->firstOrFail();
    }

    public function customer(string $code = 'C-001', string $name = 'عميل اختبار', bool $credit = true, string $limit = '10000'): Customer
    {
        return Customer::query()->firstOrCreate(
            ['code' => $code],
            [
                'name' => $name,
                'allow_credit' => $credit,
                'credit_limit' => $limit,
                'is_active' => true,
            ],
        );
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Models\UserLimit;
use App\Modules\Access\Services\AuditService;
use App\Modules\Cash\Models\CashAccount;
use App\Modules\Cash\Models\PaymentMethod;
use App\Modules\Catalog\Models\Product;
use App\Modules\Catalog\Models\TaxGroup;
use App\Modules\Core\Models\Branch;
use App\Modules\Core\Models\Store;
use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Models\Warehouse;
use App\Modules\Core\Services\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;

/**
 * First-run wizard.
 *
 * A shop can finish with ONE branch, ONE warehouse and ONE till; every other
 * step is optional. Nothing here assumes a tax rate or a legal obligation — tax
 * is opt-in and its rate is entered by the shop.
 */
class SetupController extends Controller
{
    public function __construct(
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
    ) {}

    public function status(): JsonResponse
    {
        $store = Store::query()->first();

        return response()->json([
            'store' => $store,
            'completed' => (bool) $store?->setup_completed,
            'steps' => [
                'store' => (bool) $store?->name,
                'profile' => (bool) $store?->business_profile,
                'branches' => Branch::query()->count() > 0,
                'warehouses' => Warehouse::query()->count() > 0,
                'terminals' => Terminal::query()->count() > 0,
                'users' => User::query()->count() > 1,
                'payment_methods' => PaymentMethod::query()->where('is_active', true)->count() > 0,
                'products' => Product::query()->count() > 0,
            ],
            'profiles' => collect(config('pos.profiles'))->map(fn ($p, $k) => [
                'key' => $k,
                'label' => $p['label_ar'],
                'features' => $p['features'],
                'pos_layout' => $p['pos_layout'],
            ])->values(),
            'features' => $this->settings->features(),
            'suggested' => [
                'currency' => 'EGP',
                'timezone' => 'Africa/Cairo',
                'locale' => 'ar',
                // Deliberately no suggested tax rate: it is a legal decision the
                // shop makes, not a default this system invents.
                'tax_rate' => null,
            ],
        ]);
    }

    public function saveStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'legal_name' => ['nullable', 'string', 'max:160'],
            'business_profile' => ['required', 'string', 'in:'.implode(',', array_keys(config('pos.profiles')))],
            'currency' => ['required', 'string', 'size:3'],
            'timezone' => ['required', 'string', 'timezone'],
            'locale' => ['required', 'in:ar,en'],
            'phone' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:160'],
            'website' => ['nullable', 'string', 'max:160'],
            'address' => ['nullable', 'string', 'max:500'],
            'tax_number' => ['nullable', 'string', 'max:64'],
            'social' => ['nullable', 'array'],
        ]);

        $store = Store::query()->firstOrNew(['id' => 1]);
        $store->fill($data)->save();

        // Applying a profile only switches the flags that profile names.
        $this->settings->applyProfile($data['business_profile']);
        $this->settings->flush();

        $this->audit->log('setup.store_saved', $store, null, $data);

        return response()->json(['store' => $store->refresh(), 'features' => $this->settings->features()]);
    }

    public function saveFeatures(Request $request): JsonResponse
    {
        $data = $request->validate([
            'features' => ['required', 'array'],
            'features.*' => ['boolean'],
        ]);

        $values = [];
        foreach ($data['features'] as $flag => $enabled) {
            if (array_key_exists($flag, config('pos.features'))) {
                $values["features.$flag"] = (bool) $enabled;
            }
        }

        $this->settings->setMany($values);
        $this->audit->log('setup.features_saved', null, null, $values);

        return response()->json(['features' => $this->settings->features()]);
    }

    public function saveBranch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:32'],
            'name' => ['required', 'string', 'max:160'],
            'phone' => ['nullable', 'string', 'max:32'],
            'address' => ['nullable', 'string', 'max:500'],
        ]);

        $branch = Branch::query()->updateOrCreate(['code' => $data['code']], $data);

        return response()->json(['branch' => $branch]);
    }

    public function saveWarehouse(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:32'],
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
            'name' => ['required', 'string', 'max:160'],
            'type' => ['required', 'in:sales,storage,returns,damaged,transit'],
            'is_default' => ['boolean'],
        ]);

        $warehouse = Warehouse::query()->updateOrCreate(
            ['code' => $data['code']],
            $data + ['is_sellable' => in_array($data['type'], ['sales', 'storage'], true)],
        );

        return response()->json(['warehouse' => $warehouse]);
    }

    public function saveTerminal(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:32'],
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'name' => ['required', 'string', 'max:160'],
            'offline_allowed' => ['boolean'],
            'offline_max_hours' => ['nullable', 'integer', 'min:1', 'max:72'],
            'offline_max_sale_amount' => ['nullable', 'string'],
            'printer_profile' => ['nullable', 'string', 'max:40'],
        ]);

        $terminal = Terminal::query()->updateOrCreate(['code' => $data['code']], $data);

        // Every till gets its own drawer, so shift variances are attributable.
        CashAccount::query()->firstOrCreate(
            ['code' => 'DRAWER-'.$terminal->code],
            [
                'name' => 'درج '.$terminal->name,
                'type' => 'drawer',
                'branch_id' => $terminal->branch_id,
                'terminal_id' => $terminal->id,
                'currency' => Store::query()->value('currency') ?? 'EGP',
            ],
        );

        return response()->json(['terminal' => $terminal]);
    }

    public function saveUser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'username' => ['required', 'string', 'max:60'],
            'email' => ['nullable', 'email', 'max:160'],
            'password' => ['required', 'string', 'min:8'],
            'pin' => ['nullable', 'string', 'min:4', 'max:12'],
            'role' => ['required', 'string', 'exists:roles,code'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'max_discount_percent' => ['nullable', 'string'],
            'max_discount_amount' => ['nullable', 'string'],
        ]);

        $user = User::query()->updateOrCreate(
            ['username' => $data['username']],
            [
                'name' => $data['name'],
                'email' => $data['email'] ?? null,
                'password' => Hash::make($data['password']),
                'pin_hash' => ! empty($data['pin']) ? Hash::make($data['pin']) : null,
                'is_active' => true,
                'default_branch_id' => $data['branch_id'] ?? Branch::query()->value('id'),
            ],
        );

        $role = Role::query()->where('code', $data['role'])->firstOrFail();
        $user->roles()->syncWithoutDetaching([$role->id => ['branch_id' => $data['branch_id'] ?? null]]);

        UserLimit::query()->updateOrCreate(['user_id' => $user->id], [
            'max_discount_percent' => $data['max_discount_percent'] ?? '0',
            'max_discount_amount' => $data['max_discount_amount'] ?? '0',
        ]);

        $this->audit->log('setup.user_saved', $user, null, [
            'username' => $user->username,
            'role' => $data['role'],
        ]);

        return response()->json(['user' => $user->load('roles')], 201);
    }

    public function saveTax(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'groups' => ['nullable', 'array'],
            'groups.*.code' => ['required', 'string', 'max:30'],
            'groups.*.name' => ['required', 'string', 'max:80'],
            'groups.*.rate' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'groups.*.is_inclusive' => ['boolean'],
        ]);

        $this->settings->set('features.taxes', $data['enabled']);

        foreach ($data['groups'] ?? [] as $group) {
            TaxGroup::query()->updateOrCreate(['code' => $group['code']], [
                'name' => $group['name'],
                'rate' => $group['rate'],
                'is_inclusive' => $group['is_inclusive'] ?? false,
                'is_active' => $data['enabled'],
            ]);
        }

        return response()->json([
            'taxes_enabled' => $data['enabled'],
            'groups' => TaxGroup::query()->get(),
            // Stated plainly: enabling tax calculation is not e-invoicing
            // compliance, which needs a separate, tested integration.
            'notice' => 'تفعيل حساب الضريبة لا يعني الامتثال لمنظومة الفواتير الإلكترونية؛ ذلك يحتاج تكاملًا منفصلًا واختبارًا.',
        ]);
    }

    public function complete(Request $request): JsonResponse
    {
        $store = Store::query()->firstOrFail();
        $store->forceFill(['setup_completed' => true, 'setup_completed_at' => now()])->save();

        $this->audit->log('setup.completed', $store);

        return response()->json(['store' => $store->refresh()]);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Domain\Accounting\AccountResolver;
use App\Models\Account;
use App\Models\AccountMapping;
use App\Models\Approval;
use App\Models\Company;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\UserScope;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminController extends BaseApiController
{
    public function __construct(private readonly AccountResolver $accounts) {}

    /** Company identity and settings — this is where the branding is changed. */
    public function company(Request $request): JsonResponse
    {
        return response()->json(['company' => $request->user()->company]);
    }

    public function updateCompany(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'legal_name' => ['nullable', 'string', 'max:255'],
            'tax_id' => ['nullable', 'string', 'max:64'],
            'commercial_reg' => ['nullable', 'string', 'max:64'],
            'logo_path' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:64'],
            'email' => ['nullable', 'email'],
            'address' => ['nullable', 'string'],
            'currency_code' => ['nullable', 'string', 'size:3'],
            'timezone' => ['nullable', 'string', 'max:64'],
            'settings' => ['nullable', 'array'],
        ]);

        $company = $request->user()->company;
        $company->update($data);

        return response()->json(['company' => $company->fresh()]);
    }

    // ------------------------------------------------------ users and roles

    public function users(Request $request): JsonResponse
    {
        $query = User::query()->with('roles:id,code,name');

        $this->searchable = ['users.name', 'users.email', 'users.code'];

        return $this->paginated($query, $request, fn (User $u) => [
            'id' => $u->id,
            'code' => $u->code,
            'name' => $u->name,
            'email' => $u->email,
            'job_title' => $u->job_title,
            'is_active' => $u->is_active,
            'roles' => $u->roles->pluck('name'),
            'last_login_at' => $u->last_login_at?->toIso8601String(),
        ]);
    }

    public function storeUser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'code' => ['nullable', 'string', 'max:32'],
            'phone' => ['nullable', 'string', 'max:32'],
            'job_title' => ['nullable', 'string', 'max:120'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'role_ids' => ['required', 'array', 'min:1'],
            'role_ids.*' => ['integer', 'exists:roles,id'],
            'scopes' => ['nullable', 'array'],
            'scopes.*.scope_type' => ['required', 'in:branch,warehouse,region,cash_box,bank'],
            'scopes.*.scope_id' => ['required', 'integer'],
        ]);

        $user = DB::transaction(function () use ($data, $request) {
            $user = User::create([
                'company_id' => $request->user()->company_id,
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'code' => $data['code'] ?? null,
                'phone' => $data['phone'] ?? null,
                'job_title' => $data['job_title'] ?? null,
                'branch_id' => $data['branch_id'] ?? null,
                'must_change_password' => true,
            ]);

            $user->roles()->sync($data['role_ids']);

            foreach ($data['scopes'] ?? [] as $scope) {
                UserScope::create([
                    'user_id' => $user->id,
                    'scope_type' => $scope['scope_type'],
                    'scope_id' => $scope['scope_id'],
                ]);
            }

            return $user;
        });

        return response()->json(['user' => $user->load('roles')], 201);
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'job_title' => ['nullable', 'string', 'max:120'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'is_active' => ['sometimes', 'boolean'],
            'role_ids' => ['sometimes', 'array'],
            'role_ids.*' => ['integer', 'exists:roles,id'],
            'scopes' => ['nullable', 'array'],
            'scopes.*.scope_type' => ['required', 'in:branch,warehouse,region,cash_box,bank'],
            'scopes.*.scope_id' => ['required', 'integer'],
        ]);

        DB::transaction(function () use ($user, $data) {
            $user->update(collect($data)->except(['role_ids', 'scopes'])->all());

            if (isset($data['role_ids'])) {
                $user->roles()->sync($data['role_ids']);
            }

            if (isset($data['scopes'])) {
                $user->scopes()->delete();
                foreach ($data['scopes'] as $scope) {
                    UserScope::create([
                        'user_id' => $user->id,
                        'scope_type' => $scope['scope_type'],
                        'scope_id' => $scope['scope_id'],
                    ]);
                }
            }

            // Deactivating a user kills their sessions immediately. Their past
            // documents stay attributed to them — responsibility does not
            // disappear with access.
            if (($data['is_active'] ?? true) === false) {
                $user->tokens()->delete();
            }
        });

        return response()->json(['user' => $user->fresh(['roles', 'scopes'])]);
    }

    public function roles(Request $request): JsonResponse
    {
        return response()->json([
            'roles' => Role::with('permissions:id,code,module,name_ar')->get(),
            'permissions' => Permission::query()->orderBy('module')->orderBy('code')
                ->get(['id', 'code', 'module', 'name_ar', 'is_sensitive'])
                ->groupBy('module'),
        ]);
    }

    public function storeRole(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:48'],
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string'],
            'permission_ids' => ['required', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        $role = DB::transaction(function () use ($data, $request) {
            $role = Role::create([
                'company_id' => $request->user()->company_id,
                'code' => $data['code'],
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'is_system' => false,
            ]);

            $role->permissions()->sync($data['permission_ids']);

            return $role;
        });

        return response()->json(['role' => $role->load('permissions')], 201);
    }

    public function updateRole(Request $request, Role $role): JsonResponse
    {
        if ($role->is_system) {
            abort(422, 'لا يمكن تعديل صلاحيات دور نظامي. أنشئ دورًا جديدًا بدلًا من ذلك.');
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'description' => ['nullable', 'string'],
            'permission_ids' => ['sometimes', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        $role->update(collect($data)->except('permission_ids')->all());

        if (isset($data['permission_ids'])) {
            $role->permissions()->sync($data['permission_ids']);
        }

        return response()->json(['role' => $role->fresh('permissions')]);
    }

    // ------------------------------------------------------- posting matrix

    /**
     * The posting matrix, for the accountant to review before go-live.
     *
     * The system refuses to post anything that needs an unmapped hook, so this
     * screen is a hard prerequisite, not documentation.
     */
    public function postingMatrix(): JsonResponse
    {
        $mappings = AccountMapping::with('account:id,code,name,type')->get()->keyBy('key');

        $rows = collect(AccountResolver::REQUIRED_KEYS)->map(fn ($key) => [
            'key' => $key,
            'label' => $this->mappingLabel($key),
            'account' => $mappings->get($key)?->account,
            'is_mapped' => $mappings->has($key),
        ]);

        return response()->json([
            'rows' => $rows,
            'missing' => $this->accounts->missingKeys(),
            'is_ready' => $this->accounts->isReady(),
            'note' => 'النظام يرفض ترحيل أي مستند يحتاج حسابًا غير مربوط. يجب اعتماد هذه المصفوفة من المحاسب المسؤول قبل التشغيل.',
        ]);
    }

    public function updatePostingMatrix(Request $request): JsonResponse
    {
        $data = $request->validate([
            'mappings' => ['required', 'array'],
            'mappings.*.key' => ['required', 'string', 'max:64'],
            'mappings.*.account_id' => ['required', 'integer', 'exists:accounts,id'],
        ]);

        DB::transaction(function () use ($data, $request) {
            foreach ($data['mappings'] as $mapping) {
                $account = Account::findOrFail($mapping['account_id']);

                if (! $account->is_postable) {
                    abort(422, "الحساب «{$account->code} - {$account->name}» غير قابل للترحيل.");
                }

                AccountMapping::updateOrCreate(
                    ['company_id' => $request->user()->company_id, 'key' => $mapping['key']],
                    ['account_id' => $mapping['account_id']]
                );
            }
        });

        $this->accounts->flushCache();

        return $this->postingMatrix();
    }

    // ------------------------------------------------------------ approvals

    public function approvals(Request $request): JsonResponse
    {
        $query = Approval::query()
            ->with(['requester:id,name', 'decider:id,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')),
                fn ($q) => $q->where('status', 'pending'))
            ->orderByDesc('created_at');

        return $this->paginated($query, $request, fn (Approval $a) => [
            'id' => $a->id,
            'doc_type' => $a->doc_type,
            'doc_id' => $a->doc_id,
            'level' => $a->level,
            'reason_code' => $a->reason_code,
            'amount' => (string) $a->amount,
            'note' => $a->note,
            'requested_by' => $a->requester?->name,
            'status' => $a->status,
            'created_at' => $a->created_at?->toIso8601String(),
        ]);
    }

    /**
     * Decide an approval.
     *
     * Whoever requested it cannot approve it — enforced here, not left to
     * process discipline.
     */
    public function decideApproval(Request $request, Approval $approval): JsonResponse
    {
        $data = $request->validate([
            'decision' => ['required', 'in:approved,rejected'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        if ($approval->status !== 'pending') {
            abort(422, 'تم البت في هذا الطلب بالفعل.');
        }

        if ($approval->requested_by === $request->user()->id) {
            abort(403, 'لا يجوز اعتماد طلب تقدمت به بنفسك.');
        }

        $approval->forceFill([
            'status' => $data['decision'],
            'decided_by' => $request->user()->id,
            'decided_at' => now(),
            'note' => $data['note'] ?? $approval->note,
        ])->save();

        return response()->json(['approval' => $approval]);
    }

    // ----------------------------------------------------------- warehouses

    public function warehouses(Request $request): JsonResponse
    {
        return response()->json([
            'warehouses' => Warehouse::query()
                ->when($request->filled('kind'), fn ($q) => $q->where('kind', $request->string('kind')))
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'code', 'name', 'kind', 'is_sellable', 'branch_id', 'vehicle_id']),
        ]);
    }

    protected function mappingLabel(string $key): string
    {
        return [
            'inventory' => 'المخزون',
            'accounts_receivable' => 'ذمم العملاء',
            'accounts_payable' => 'ذمم الموردين',
            'sales_revenue' => 'إيرادات المبيعات',
            'sales_returns' => 'مرتجعات المبيعات',
            'sales_discount' => 'خصم مسموح به',
            'cogs' => 'تكلفة البضاعة المباعة',
            'vat_output' => 'ضريبة القيمة المضافة — مخرجات',
            'vat_input' => 'ضريبة القيمة المضافة — مدخلات',
            'grni' => 'بضاعة مستلمة غير مفوترة',
            'inventory_adjustment' => 'فروق تسويات المخزون',
            'damage_expense' => 'مصروف التالف',
            'rounding_difference' => 'فروق التقريب',
            'cash_on_hand' => 'النقدية بالخزنة',
            'customer_advances' => 'دفعات مقدمة من العملاء',
            'delivery_income' => 'إيرادات التوصيل',
        ][$key] ?? $key;
    }
}

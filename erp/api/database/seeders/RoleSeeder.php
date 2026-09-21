<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * The standard roles a distribution company starts with.
 *
 * These are a baseline, not a ceiling — new roles are created from the admin
 * screens. Sensitive permissions (posting, approving, reversing, seeing cost)
 * are granted narrowly on purpose: a sales rep cannot post their own invoice or
 * see the margin on it.
 */
class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $companyId = \App\Models\Company::query()->value('id');

        foreach ($this->roles() as $code => $definition) {
            $role = Role::updateOrCreate(
                ['company_id' => $companyId, 'code' => $code],
                [
                    'name' => $definition['name'],
                    'description' => $definition['description'] ?? null,
                    'is_system' => true,
                ]
            );

            $permissionIds = $definition['permissions'] === '*'
                ? Permission::query()->pluck('id')
                : Permission::query()->whereIn('code', $this->expand($definition['permissions']))->pluck('id');

            $role->permissions()->sync($permissionIds);
        }
    }

    /** Expand `module.*` shorthand into concrete permission codes. */
    protected function expand(array $patterns): array
    {
        $all = Permission::query()->pluck('code');

        return collect($patterns)->flatMap(function ($pattern) use ($all) {
            if (! str_contains($pattern, '*')) {
                return [$pattern];
            }

            $prefix = rtrim($pattern, '*');

            return $all->filter(fn ($code) => str_starts_with($code, $prefix))->values();
        })->unique()->values()->all();
    }

    protected function roles(): array
    {
        return [
            'company_admin' => [
                'name' => 'مدير الشركة',
                'description' => 'صلاحيات كاملة على بيانات الشركة وعملياتها.',
                'permissions' => '*',
            ],

            'branch_manager' => [
                'name' => 'مدير فرع',
                'permissions' => [
                    'dashboard.view', 'items.view', 'customers.*', 'sales.*',
                    'purchasing.view', 'inventory.view', 'inventory.cost.view',
                    'treasury.receipt.view.all', 'treasury.custody.view.all',
                    'field.*', 'reports.view', 'reports.profit.view', 'reports.export',
                    'approvals.view', 'approvals.decide',
                ],
            ],

            'sales_manager' => [
                'name' => 'مدير مبيعات',
                'permissions' => [
                    'dashboard.view', 'items.view', 'items.price.manage',
                    'customers.*', 'sales.*',
                    'inventory.view', 'reports.view', 'reports.profit.view', 'reports.export',
                    'field.visit.manage', 'field.day_closing.view.all',
                    'approvals.view', 'approvals.decide',
                ],
            ],

            'supervisor' => [
                'name' => 'مشرف مناديب',
                'permissions' => [
                    'dashboard.view', 'items.view', 'customers.view.all', 'customers.update',
                    'sales.order.view.all', 'sales.order.approve',
                    'sales.invoice.view.all', 'sales.return.receive',
                    'inventory.view', 'field.*', 'sync.conflict.view', 'sync.conflict.resolve',
                    'sync.credit.grant', 'treasury.receipt.view.all', 'treasury.custody.view.all',
                    'treasury.transfer.create', 'reports.view', 'approvals.view',
                ],
            ],

            'rep' => [
                'name' => 'مندوب مبيعات',
                'description' => 'يبيع لعملائه المسندين فقط، ولا يرى التكلفة أو الربح.',
                'permissions' => [
                    'dashboard.view', 'items.view', 'customers.view',
                    'sales.order.view', 'sales.order.create',
                    'sales.invoice.view', 'sales.invoice.create',
                    'sales.return.create', 'sales.delivery.view',
                    'treasury.receipt.view', 'treasury.receipt.create', 'treasury.custody.view',
                    'field.van_load.view', 'field.day_closing.view', 'field.day_closing.submit',
                    'field.shift.manage', 'field.visit.manage',
                    'inventory.view', 'sync.use',
                ],
            ],

            'collector' => [
                'name' => 'محصّل',
                'permissions' => [
                    'dashboard.view', 'customers.view',
                    'treasury.receipt.view', 'treasury.receipt.create',
                    'treasury.custody.view', 'treasury.transfer.create',
                    'field.shift.manage', 'field.visit.manage', 'sync.use',
                ],
            ],

            'driver' => [
                'name' => 'سائق',
                'permissions' => [
                    'dashboard.view', 'sales.delivery.view', 'sales.delivery.confirm',
                    'field.van_load.view', 'field.van_load.receive', 'field.shift.manage',
                    'sync.use',
                ],
            ],

            'warehouse_keeper' => [
                'name' => 'أمين مخزن',
                'permissions' => [
                    'dashboard.view', 'items.view', 'inventory.view',
                    'inventory.transfer.create', 'inventory.transfer.issue', 'inventory.transfer.receive',
                    'inventory.count.manage', 'inventory.adjustment.create',
                    'purchasing.view', 'purchasing.receipt.create',
                    'sales.delivery.view.all', 'sales.delivery.create',
                    'field.van_load.create', 'field.van_load.issue',
                    'reports.view',
                ],
            ],

            'purchasing_officer' => [
                'name' => 'موظف مشتريات',
                'permissions' => [
                    'dashboard.view', 'items.view', 'items.create', 'items.update',
                    'purchasing.view', 'purchasing.order.create', 'purchasing.receipt.create',
                    'purchasing.invoice.create', 'purchasing.landed_cost.create',
                    'inventory.view', 'inventory.cost.view', 'reports.view',
                ],
            ],

            'accountant' => [
                'name' => 'محاسب',
                'permissions' => [
                    'dashboard.view', 'items.view', 'customers.view.all',
                    'sales.invoice.view.all', 'sales.invoice.post',
                    'sales.return.post', 'purchasing.view', 'purchasing.invoice.post',
                    'purchasing.receipt.post', 'purchasing.landed_cost.post',
                    'inventory.view', 'inventory.cost.view',
                    'treasury.*', 'accounting.journal.view', 'accounting.journal.create',
                    'accounting.posting_matrix.view',
                    'reports.view', 'reports.profit.view', 'reports.export',
                    'accounting.reports.view',
                ],
            ],

            'finance_manager' => [
                'name' => 'مدير مالي',
                'permissions' => [
                    'dashboard.view', 'items.view', 'customers.*',
                    'sales.*', 'purchasing.*', 'inventory.*', 'treasury.*',
                    'accounting.*', 'reports.*', 'approvals.*',
                    'field.day_closing.view.all', 'field.day_closing.approve',
                ],
            ],

            'auditor' => [
                'name' => 'مراجع (قراءة فقط)',
                'description' => 'اطلاع كامل بدون أي صلاحية تعديل أو ترحيل.',
                'permissions' => [
                    'dashboard.view', 'items.view', 'customers.view.all',
                    'sales.order.view.all', 'sales.invoice.view.all', 'sales.delivery.view.all',
                    'purchasing.view', 'inventory.view', 'inventory.cost.view',
                    'treasury.receipt.view.all', 'treasury.custody.view.all',
                    'field.day_closing.view.all', 'accounting.journal.view',
                    'accounting.posting_matrix.view', 'accounting.reports.view',
                    'reports.view', 'reports.profit.view', 'reports.export',
                    'approvals.view', 'admin.audit.view', 'sync.conflict.view',
                ],
            ],
        ];
    }
}

<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * الأدوار الأساسية. يمكن إنشاء أدوار إضافية من لوحة التحكم.
 * الرفض الافتراضي: ما لا يُمنح صراحةً يُرفض.
 */
class RoleSeeder extends Seeder
{
    /** @return array<string, array{name:string, permissions:array<int,string>}> */
    public static function definition(): array
    {
        return [
            'owner' => ['name' => 'مالك النظام', 'permissions' => ['*']],
            'company_manager' => ['name' => 'مدير شركة', 'permissions' => [
                'settings.*', 'company.*', 'user.*', 'role.*', 'item.*', 'price_list.*', 'promotion.*',
                'customer.*', 'supplier.*', 'warehouse.*', 'stock.*', 'purchase_order.*', 'goods_receipt.*',
                'supplier_invoice.*', 'purchase_return.*', 'supplier_payment.*', 'landed_cost.*',
                'quotation.*', 'sales_order.*', 'delivery_note.*', 'sales_invoice.*', 'sales_return.*',
                'customer_receipt.*', 'cash_deposit.*', 'expense.*', 'salesman.*', 'load_order.*', 'visit.*',
                'day_closure.*', 'variance.*', 'commission.*', 'target.*', 'accounting.*', 'cash_box.*',
                'bank.*', 'cheque.*', 'reports.*', 'approval.*', 'device.*', 'sync.*', 'import.*',
                'integration.*', 'audit.view', 'exception.*', 'backup.view', 'backup.run',
            ]],
            'branch_manager' => ['name' => 'مدير فرع', 'permissions' => [
                'item.view', 'price_list.view', 'customer.view', 'customer.create', 'customer.update',
                'supplier.view', 'warehouse.view', 'stock.view', 'stock.transfer', 'stock.transfer_receive',
                'purchase_order.view', 'goods_receipt.view', 'sales_order.*', 'delivery_note.*',
                'sales_invoice.view', 'sales_invoice.create', 'sales_invoice.post', 'sales_return.view',
                'sales_return.receive', 'customer_receipt.view', 'cash_deposit.view', 'cash_deposit.approve',
                'expense.view', 'expense.create', 'expense.approve', 'salesman.view', 'load_order.*',
                'visit.*', 'day_closure.view', 'day_closure.approve', 'variance.view', 'variance.create',
                'reports.sales', 'reports.inventory', 'reports.salesmen', 'reports.export', 'approval.*',
            ]],
            'sales_manager' => ['name' => 'مدير مبيعات', 'permissions' => [
                'item.view', 'price_list.view', 'price_list.override_discount', 'promotion.*',
                'customer.*', 'quotation.*', 'sales_order.*', 'delivery_note.view', 'sales_invoice.view',
                'sales_return.view', 'customer_receipt.view', 'salesman.view', 'salesman.assign_customers',
                'visit.*', 'target.*', 'commission.view', 'reports.sales', 'reports.salesmen',
                'reports.profit.view', 'reports.export', 'approval.view', 'approval.act', 'stock.view',
            ]],
            'supervisor' => ['name' => 'مشرف مناديب', 'permissions' => [
                'item.view', 'price_list.view', 'customer.view', 'customer.update', 'sales_order.view',
                'sales_order.approve', 'sales_invoice.view', 'sales_return.view', 'sales_return.receive',
                'customer_receipt.view', 'cash_deposit.view', 'expense.view', 'expense.approve',
                'salesman.view', 'salesman.view_location', 'load_order.*', 'visit.*',
                'day_closure.view', 'day_closure.approve', 'variance.view', 'variance.create',
                'reports.salesmen', 'reports.sales', 'sync.view', 'device.view', 'stock.view',
            ]],
            'salesman' => ['name' => 'مندوب', 'permissions' => [
                'item.view', 'price_list.view', 'customer.view', 'customer.create',
                'quotation.view', 'quotation.create', 'sales_order.view', 'sales_order.create',
                'sales_invoice.view', 'sales_invoice.create', 'sales_return.view', 'sales_return.create',
                'customer_receipt.view', 'customer_receipt.create', 'visit.view', 'visit.execute',
                'day_closure.view', 'day_closure.close', 'expense.view', 'expense.create',
                'load_order.view', 'stock.view', 'commission.view',
            ]],
            'collector' => ['name' => 'محصل', 'permissions' => [
                'customer.view', 'sales_invoice.view', 'customer_receipt.view', 'customer_receipt.create',
                'cash_deposit.view', 'cash_deposit.create', 'visit.view', 'visit.execute',
                'day_closure.view', 'day_closure.close',
            ]],
            'driver' => ['name' => 'سائق', 'permissions' => [
                'load_order.view', 'delivery_note.view', 'delivery_note.update', 'stock.view', 'visit.view',
            ]],
            'warehouse_keeper' => ['name' => 'أمين مخزن', 'permissions' => [
                'item.view', 'warehouse.view', 'stock.view', 'stock.transfer', 'stock.transfer_receive',
                'stock.adjust', 'stock.count', 'stock.reclassify', 'goods_receipt.view', 'goods_receipt.create',
                'goods_receipt.post', 'delivery_note.view', 'delivery_note.create', 'delivery_note.post',
                'sales_return.view', 'sales_return.receive', 'load_order.view', 'load_order.create',
                'load_order.post', 'reports.inventory', 'reports.export',
            ]],
            'purchasing' => ['name' => 'مشتريات', 'permissions' => [
                'item.view', 'item.create', 'item.update', 'supplier.*', 'purchase_order.*',
                'goods_receipt.view', 'supplier_invoice.view', 'purchase_return.*', 'stock.view',
                'reports.inventory', 'reports.export',
            ]],
            'accountant' => ['name' => 'محاسب', 'permissions' => [
                'item.view', 'customer.view', 'supplier.view', 'stock.view',
                'supplier_invoice.*', 'supplier_payment.*', 'landed_cost.*', 'sales_invoice.view',
                'sales_invoice.post', 'sales_return.view', 'sales_return.post', 'customer_receipt.*',
                'cash_deposit.*', 'expense.*', 'accounting.view', 'accounting.journal_create',
                'accounting.journal_post', 'accounting.export', 'cash_box.*', 'bank.*', 'cheque.*',
                'reports.*', 'commission.view',
            ]],
            'finance_manager' => ['name' => 'مدير مالي', 'permissions' => [
                'accounting.*', 'cash_box.*', 'bank.*', 'cheque.*', 'supplier_payment.*',
                'customer_receipt.*', 'cash_deposit.*', 'expense.*', 'reports.*', 'variance.*',
                'commission.*', 'day_closure.view', 'day_closure.approve', 'day_closure.reopen',
                'customer.override_credit', 'approval.*', 'audit.view', 'settings.posting_matrix',
                'stock.view', 'customer.view', 'supplier.view', 'item.view',
            ]],
            'auditor' => ['name' => 'مراجع (قراءة فقط)', 'permissions' => [
                'item.view', 'customer.view', 'supplier.view', 'warehouse.view', 'stock.view',
                'purchase_order.view', 'goods_receipt.view', 'supplier_invoice.view', 'sales_order.view',
                'sales_invoice.view', 'sales_return.view', 'customer_receipt.view', 'cash_deposit.view',
                'expense.view', 'accounting.view', 'reports.sales', 'reports.inventory',
                'reports.accounting', 'reports.salesmen', 'reports.management', 'reports.cost.view',
                'reports.profit.view', 'audit.view', 'exception.view', 'day_closure.view',
            ]],
        ];
    }

    public function run(?Company $company = null): void
    {
        $companies = $company ? collect([$company]) : Company::all();
        $allPermissions = Permission::pluck('id', 'code');

        foreach ($companies as $c) {
            foreach (self::definition() as $code => $config) {
                $role = Role::updateOrCreate(
                    ['company_id' => $c->id, 'code' => $code],
                    ['name_ar' => $config['name'], 'is_system' => true],
                );

                $ids = [];
                foreach ($config['permissions'] as $pattern) {
                    if ($pattern === '*') {
                        $ids = $allPermissions->values()->all();
                        break;
                    }
                    if (str_ends_with($pattern, '.*')) {
                        $prefix = substr($pattern, 0, -1);
                        foreach ($allPermissions as $permCode => $permId) {
                            if (str_starts_with($permCode, $prefix)) {
                                $ids[] = $permId;
                            }
                        }
                    } elseif (isset($allPermissions[$pattern])) {
                        $ids[] = $allPermissions[$pattern];
                    }
                }

                $role->permissions()->sync(array_unique($ids));
            }
        }
    }
}

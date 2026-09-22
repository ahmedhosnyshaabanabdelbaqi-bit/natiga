<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Modules\Access\Models\Permission;
use App\Modules\Access\Models\Role;
use Illuminate\Database\Seeder;

/**
 * Permissions and the starter roles.
 *
 * Cost/profit visibility, price changes, discounts, returns, credit sales,
 * drawer opening, stock adjustment, shift closing and data export are SEPARATE
 * permissions, because they are separate risks.
 */
class PermissionSeeder extends Seeder
{
    /** @var array<string, array<int, array{0:string,1:string,2?:bool}>> */
    private array $permissions = [
        'pos' => [
            ['pos.use', 'استخدام شاشة البيع'],
            ['pos.hold', 'تعليق الفواتير واستدعاؤها'],
            ['pos.reprint', 'إعادة طباعة الفاتورة'],
            ['pos.offline', 'البيع دون اتصال بالخادم', true],
        ],
        'sales' => [
            ['sales.create', 'إنشاء فاتورة بيع'],
            ['sales.discount', 'منح خصم'],
            ['sales.discount.override', 'اعتماد خصم يتجاوز حد الكاشير', true],
            ['sales.change_price', 'تعديل سعر البيع', true],
            ['sales.credit', 'البيع الآجل', true],
            ['sales.return', 'تنفيذ مرتجع'],
            ['sales.return.without_invoice', 'مرتجع بدون فاتورة', true],
            ['sales.void', 'إلغاء فاتورة', true],
            ['sales.view_all', 'عرض كل الفواتير'],
            ['sales.view_cost', 'عرض التكلفة وهامش الربح', true],
        ],
        'inventory' => [
            ['inventory.view', 'عرض المخزون'],
            ['inventory.adjust', 'تسوية المخزون', true],
            ['inventory.transfer', 'التحويل بين المخازن'],
            ['inventory.stocktake', 'الجرد'],
        ],
        'catalog' => [
            ['catalog.view', 'عرض الأصناف'],
            ['catalog.manage', 'إدارة الأصناف والتصنيفات'],
            ['catalog.price.manage', 'إدارة قوائم الأسعار', true],
        ],
        'purchasing' => [
            ['purchasing.view', 'عرض المشتريات'],
            ['purchasing.manage', 'إدارة أوامر الشراء والاستلام'],
            ['purchasing.pay', 'سداد الموردين', true],
        ],
        'customers' => [
            ['customers.view', 'عرض العملاء'],
            ['customers.manage', 'إدارة العملاء'],
            ['customers.collect', 'تحصيل من العملاء'],
        ],
        'cash' => [
            ['cash.shift.open', 'فتح وردية'],
            ['cash.shift.close', 'إغلاق وردية'],
            ['cash.shift.reconcile', 'تسوية وردية مغلقة', true],
            ['cash.drawer.open', 'فتح درج النقدية بدون بيع', true],
            ['cash.movement', 'إيداع وسحب ومصروفات', true],
        ],
        'accounting' => [
            ['accounting.view', 'عرض الحسابات والقيود'],
            ['accounting.manage', 'إدارة دليل الحسابات', true],
            ['accounting.close_period', 'إقفال فترة محاسبية', true],
        ],
        'reports' => [
            ['reports.view', 'عرض التقارير'],
            ['reports.profit', 'تقارير الأرباح والتكلفة', true],
            ['reports.export', 'تصدير البيانات', true],
        ],
        'settings' => [
            ['settings.view', 'عرض الإعدادات'],
            ['settings.manage', 'تعديل الإعدادات', true],
            ['users.manage', 'إدارة المستخدمين والصلاحيات', true],
            ['audit.view', 'عرض سجل التدقيق', true],
            ['backup.manage', 'النسخ الاحتياطي والاستعادة', true],
        ],
    ];

    /** @var array<string, array{name:string, permissions:string|array<int,string>}> */
    private array $roles = [
        'owner' => ['name' => 'المالك', 'permissions' => '*'],
        'branch_manager' => ['name' => 'مدير الفرع', 'permissions' => [
            'pos.use', 'pos.hold', 'pos.reprint',
            'sales.create', 'sales.discount', 'sales.discount.override', 'sales.change_price',
            'sales.credit', 'sales.return', 'sales.void', 'sales.view_all', 'sales.view_cost',
            'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.stocktake',
            'catalog.view', 'catalog.manage',
            'purchasing.view', 'purchasing.manage',
            'customers.view', 'customers.manage', 'customers.collect',
            'cash.shift.open', 'cash.shift.close', 'cash.shift.reconcile', 'cash.drawer.open', 'cash.movement',
            'reports.view', 'reports.profit', 'reports.export',
            'settings.view', 'audit.view',
        ]],
        'cashier' => ['name' => 'كاشير', 'permissions' => [
            'pos.use', 'pos.hold', 'pos.reprint',
            'sales.create', 'sales.discount', 'sales.return',
            'catalog.view', 'inventory.view',
            'customers.view', 'customers.manage', 'customers.collect',
            'cash.shift.open', 'cash.shift.close',
        ]],
        'accountant' => ['name' => 'محاسب', 'permissions' => [
            'sales.view_all', 'sales.view_cost',
            'inventory.view', 'catalog.view',
            'purchasing.view', 'purchasing.pay',
            'customers.view', 'customers.collect',
            'cash.movement',
            'accounting.view', 'accounting.manage', 'accounting.close_period',
            'reports.view', 'reports.profit', 'reports.export',
            'settings.view', 'audit.view',
        ]],
        'storekeeper' => ['name' => 'أمين مخزن', 'permissions' => [
            'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.stocktake',
            'catalog.view', 'catalog.manage',
            'purchasing.view', 'purchasing.manage',
            'reports.view',
        ]],
    ];

    public function run(): void
    {
        foreach ($this->permissions as $group => $items) {
            foreach ($items as $item) {
                Permission::query()->updateOrCreate(
                    ['code' => $item[0]],
                    ['group' => $group, 'name' => $item[1], 'is_sensitive' => $item[2] ?? false],
                );
            }
        }

        $all = Permission::query()->pluck('id', 'code');

        foreach ($this->roles as $code => $definition) {
            $role = Role::query()->updateOrCreate(
                ['code' => $code],
                ['name' => $definition['name'], 'is_system' => true],
            );

            $ids = $definition['permissions'] === '*'
                ? $all->values()->all()
                : $all->only($definition['permissions'])->values()->all();

            $role->permissions()->sync($ids);
        }
    }
}

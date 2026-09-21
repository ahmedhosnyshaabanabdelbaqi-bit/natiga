<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

/**
 * The permission catalogue.
 *
 * Deliberately granular: viewing, creating, approving, posting, reversing and
 * exporting are separate, and so are "see cost / profit", "override price",
 * "override discount" and "override credit limit". A `.view.all` permission is
 * always distinct from `.view`, which limits a user to their own records.
 */
class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->catalogue() as $module => $permissions) {
            foreach ($permissions as $code => $definition) {
                [$name, $sensitive] = is_array($definition) ? $definition : [$definition, false];

                Permission::updateOrCreate(
                    ['code' => $code],
                    ['module' => $module, 'name_ar' => $name, 'is_sensitive' => $sensitive]
                );
            }
        }
    }

    public function catalogue(): array
    {
        return [
            'dashboard' => [
                'dashboard.view' => 'عرض لوحة التحكم',
            ],
            'items' => [
                'items.view' => 'عرض الأصناف',
                'items.create' => 'إضافة صنف',
                'items.update' => 'تعديل صنف',
                'items.delete' => ['حذف صنف', true],
                'items.price.manage' => ['إدارة قوائم الأسعار', true],
            ],
            'customers' => [
                'customers.view' => 'عرض عملائي',
                'customers.view.all' => 'عرض جميع العملاء',
                'customers.create' => 'إضافة عميل',
                'customers.update' => 'تعديل عميل',
                'customers.reassign' => ['تغيير مندوب العميل', true],
                'customers.credit.manage' => ['إدارة الحد الائتماني', true],
            ],
            'sales' => [
                'sales.order.view' => 'عرض أوامري',
                'sales.order.view.all' => 'عرض جميع أوامر البيع',
                'sales.order.create' => 'إنشاء أمر بيع',
                'sales.order.update' => 'تعديل أمر بيع',
                'sales.order.approve' => 'اعتماد أمر بيع',
                'sales.order.cancel' => 'إلغاء أمر بيع',
                'sales.delivery.view' => 'عرض أذون التسليم',
                'sales.delivery.view.all' => 'عرض جميع أذون التسليم',
                'sales.delivery.create' => 'إنشاء إذن تسليم',
                'sales.delivery.confirm' => 'تأكيد التسليم وصرف البضاعة',
                'sales.invoice.view' => 'عرض فواتيري',
                'sales.invoice.view.all' => 'عرض جميع الفواتير',
                'sales.invoice.create' => 'إنشاء فاتورة',
                'sales.invoice.post' => ['ترحيل فاتورة', true],
                'sales.invoice.cancel' => ['إلغاء فاتورة مرحّلة', true],
                'sales.return.create' => 'إنشاء مرتجع',
                'sales.return.receive' => 'استلام مرتجع',
                'sales.return.post' => ['اعتماد وترحيل المرتجع', true],
                'sales.price.override' => ['تعديل السعر يدويًا', true],
                'sales.discount.override' => ['منح خصم يدوي', true],
                'sales.credit.override' => ['تجاوز الحد الائتماني', true],
            ],
            'purchasing' => [
                'purchasing.view' => 'عرض المشتريات',
                'purchasing.order.create' => 'إنشاء أمر شراء',
                'purchasing.order.approve' => 'اعتماد أمر شراء',
                'purchasing.receipt.create' => 'تسجيل استلام بضاعة',
                'purchasing.receipt.post' => ['ترحيل استلام بضاعة', true],
                'purchasing.invoice.create' => 'تسجيل فاتورة مورد',
                'purchasing.invoice.post' => ['ترحيل فاتورة مورد', true],
                'purchasing.landed_cost.create' => 'تسجيل تكلفة إضافية',
                'purchasing.landed_cost.post' => ['ترحيل تكلفة إضافية', true],
            ],
            'inventory' => [
                'inventory.view' => 'عرض أرصدة المخزون',
                'inventory.cost.view' => ['عرض التكلفة وقيمة المخزون', true],
                'inventory.transfer.create' => 'إنشاء تحويل مخزني',
                'inventory.transfer.issue' => 'صرف تحويل مخزني',
                'inventory.transfer.receive' => 'استلام تحويل مخزني',
                'inventory.count.manage' => 'إدارة الجرد',
                'inventory.adjustment.create' => 'إنشاء تسوية مخزون',
                'inventory.adjustment.approve' => ['اعتماد وترحيل تسوية مخزون', true],
                'inventory.adjustment.self_approve' => ['اعتماد تسوية أنشأتها بنفسك', true],
            ],
            'treasury' => [
                'treasury.receipt.view' => 'عرض سنداتي',
                'treasury.receipt.view.all' => 'عرض جميع سندات القبض',
                'treasury.receipt.create' => 'تسجيل تحصيل',
                'treasury.receipt.post' => 'ترحيل سند قبض',
                'treasury.receipt.allocate' => 'توزيع التحصيل على الفواتير',
                'treasury.receipt.cancel' => ['إلغاء سند قبض', true],
                'treasury.custody.view' => 'عرض عهدتي',
                'treasury.custody.view.all' => ['عرض عهد جميع المناديب', true],
                'treasury.transfer.create' => 'تسجيل توريد نقدية',
                'treasury.transfer.approve' => ['اعتماد توريد نقدية', true],
                'treasury.expense.create' => 'تسجيل مصروف',
                'treasury.expense.approve' => ['اعتماد مصروف', true],
                'treasury.cheque.manage' => 'إدارة الشيكات',
            ],
            'field' => [
                'field.van_load.view' => 'عرض تحميلات السيارات',
                'field.van_load.create' => 'إنشاء أمر تحميل',
                'field.van_load.issue' => 'صرف أمر تحميل',
                'field.van_load.receive' => 'استلام على السيارة',
                'field.day_closing.open' => 'فتح يوم مندوب',
                'field.day_closing.view' => 'عرض إقفال يومي',
                'field.day_closing.view.all' => 'عرض إقفالات جميع المناديب',
                'field.day_closing.submit' => 'تسليم إقفال اليوم',
                'field.day_closing.approve' => ['اعتماد إقفال اليوم', true],
                'field.day_closing.reopen' => ['إعادة فتح يوم مقفل', true],
                'field.day_closing.sync_override' => ['الإقفال قبل اكتمال المزامنة', true],
                'field.shift.manage' => 'بدء وإنهاء الوردية',
                'field.location.view' => ['عرض مواقع المناديب', true],
                'field.visit.manage' => 'إدارة الزيارات وخطط السير',
            ],
            'sync' => [
                'sync.use' => 'استخدام المزامنة من التطبيق',
                'sync.conflict.view' => 'عرض تعارضات المزامنة',
                'sync.conflict.resolve' => ['حسم تعارضات المزامنة', true],
                'sync.credit.grant' => ['منح حصة ائتمان أوفلاين', true],
                'sync.device.manage' => ['إدارة أجهزة المناديب', true],
            ],
            'reports' => [
                'reports.view' => 'عرض التقارير التشغيلية',
                'reports.profit.view' => ['عرض الربحية والهوامش', true],
                'reports.export' => 'تصدير التقارير',
                'accounting.reports.view' => ['عرض التقارير المالية', true],
            ],
            'accounting' => [
                'accounting.journal.view' => 'عرض القيود',
                'accounting.journal.create' => ['إنشاء قيد يدوي', true],
                'accounting.journal.reverse' => ['عكس قيد مرحّل', true],
                'accounting.period.close' => ['إقفال فترة مالية', true],
                'accounting.posting_matrix.view' => 'عرض مصفوفة الترحيل',
                'accounting.posting_matrix.manage' => ['تعديل مصفوفة الترحيل', true],
            ],
            'approvals' => [
                'approvals.view' => 'عرض الموافقات',
                'approvals.decide' => ['البت في الموافقات', true],
            ],
            'admin' => [
                'admin.company.view' => 'عرض بيانات الشركة',
                'admin.company.update' => ['تعديل بيانات الشركة والهوية', true],
                'admin.users.view' => 'عرض المستخدمين',
                'admin.users.create' => ['إضافة مستخدم', true],
                'admin.users.update' => ['تعديل مستخدم', true],
                'admin.roles.view' => 'عرض الأدوار',
                'admin.roles.manage' => ['إدارة الأدوار والصلاحيات', true],
                'admin.audit.view' => ['عرض سجل المراجعة', true],
                'admin.integrations.manage' => ['إدارة التكاملات', true],
            ],
        ];
    }
}

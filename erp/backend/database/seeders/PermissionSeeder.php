<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

/**
 * كتالوج الصلاحيات. الفصل بين العرض والإنشاء والتعديل والاعتماد والترحيل والعكس والتصدير،
 * وكذلك مشاهدة التكلفة والربح وتجاوز الخصم والائتمان.
 */
class PermissionSeeder extends Seeder
{
    /** @return array<string, array<string, string>> */
    public static function catalog(): array
    {
        $crud = fn (string $label) => [
            'view' => "عرض {$label}",
            'create' => "إنشاء {$label}",
            'update' => "تعديل {$label}",
            'delete' => "حذف {$label}",
            'export' => "تصدير {$label}",
        ];

        $doc = fn (string $label) => array_merge($crud($label), [
            'approve' => "اعتماد {$label}",
            'post' => "ترحيل {$label}",
            'cancel' => "إلغاء {$label}",
        ]);

        return [
            'settings' => ['view' => 'عرض الإعدادات', 'update' => 'تعديل الإعدادات', 'posting_matrix' => 'إدارة مصفوفة الترحيل'],
            'company' => $crud('بيانات الشركة والفروع'),
            'user' => array_merge($crud('المستخدمين'), ['reset_password' => 'إعادة تعيين كلمة المرور', 'assign_roles' => 'إسناد الأدوار']),
            'role' => $crud('الأدوار والصلاحيات'),
            'item' => $crud('الأصناف'),
            'price_list' => array_merge($crud('قوائم الأسعار'), ['override_discount' => 'تجاوز حد الخصم']),
            'promotion' => $crud('العروض'),
            'customer' => array_merge($crud('العملاء'), [
                'view_all' => 'عرض كل العملاء وليس المسندين فقط',
                'override_credit' => 'تجاوز الحد الائتماني',
                'unblock' => 'رفع الإيقاف عن عميل',
            ]),
            'supplier' => $crud('الموردين'),
            'warehouse' => $crud('المخازن'),
            'stock' => [
                'view' => 'عرض الأرصدة والحركات',
                'transfer' => 'إنشاء تحويل مخزني',
                'transfer_receive' => 'استلام تحويل مخزني',
                'adjust' => 'إنشاء تسوية مخزنية',
                'adjust_approve' => 'اعتماد تسوية مخزنية',
                'count' => 'إجراء الجرد',
                'count_approve' => 'اعتماد فروق الجرد',
                'reclassify' => 'إعادة تصنيف حالة الرصيد',
                'export' => 'تصدير تقارير المخزون',
            ],
            'purchase_order' => $doc('أوامر الشراء'),
            'goods_receipt' => $doc('استلام البضاعة'),
            'supplier_invoice' => $doc('فواتير الموردين'),
            'purchase_return' => $doc('مرتجعات المشتريات'),
            'supplier_payment' => $doc('مدفوعات الموردين'),
            'landed_cost' => $doc('التكاليف الإضافية'),
            'quotation' => $crud('عروض الأسعار'),
            'sales_order' => $doc('أوامر البيع'),
            'delivery_note' => $doc('أذون التسليم'),
            'sales_invoice' => array_merge($doc('فواتير البيع'), ['reprint' => 'إعادة طباعة الفاتورة']),
            'sales_return' => array_merge($doc('مرتجعات المبيعات'), [
                'receive' => 'استلام المرتجع فعليًا',
                'without_invoice' => 'اعتماد مرتجع بلا فاتورة',
                'cash_refund' => 'اعتماد استرداد نقدي',
            ]),
            'customer_receipt' => $doc('سندات القبض'),
            'cash_deposit' => $doc('توريد العهد النقدية'),
            'expense' => $doc('المصروفات'),
            'salesman' => array_merge($crud('المناديب'), ['assign_customers' => 'إسناد العملاء', 'view_location' => 'مشاهدة آخر موقع']),
            'load_order' => $doc('أوامر تحميل السيارات'),
            'visit' => ['view' => 'عرض الزيارات', 'plan' => 'تخطيط الزيارات', 'execute' => 'تنفيذ الزيارات'],
            'day_closure' => [
                'view' => 'عرض إقفال اليوم',
                'close' => 'إقفال اليوم',
                'approve' => 'اعتماد الإقفال',
                'reopen' => 'إعادة فتح يوم مقفل',
                'sync_exception' => 'منح استثناء من اكتمال المزامنة',
            ],
            'variance' => ['view' => 'عرض محاضر العجز والزيادة', 'create' => 'إنشاء محضر', 'approve' => 'اعتماد المحضر'],
            'commission' => ['view' => 'عرض العمولات', 'configure' => 'إدارة قواعد العمولات', 'settle' => 'تسوية واعتماد العمولات'],
            'target' => $crud('المستهدفات'),
            'accounting' => [
                'view' => 'عرض الحسابات والقيود',
                'chart_manage' => 'إدارة دليل الحسابات',
                'journal_create' => 'إنشاء قيد يدوي',
                'journal_post' => 'ترحيل القيود',
                'journal_reverse' => 'عكس قيد مرحل',
                'period_close' => 'إقفال الفترات المالية',
                'period_reopen' => 'إعادة فتح فترة مالية',
                'export' => 'تصدير التقارير المالية',
            ],
            'cash_box' => $crud('الخزن'),
            'bank' => array_merge($crud('الحسابات البنكية'), ['reconcile' => 'المطابقة البنكية']),
            'cheque' => array_merge($crud('الشيكات'), ['clear' => 'تحصيل/رفض الشيك']),
            'reports' => [
                'sales' => 'تقارير المبيعات',
                'inventory' => 'تقارير المخازن',
                'accounting' => 'تقارير الحسابات',
                'salesmen' => 'تقارير المناديب',
                'management' => 'تقارير الإدارة',
                'cost.view' => 'مشاهدة التكلفة',
                'profit.view' => 'مشاهدة الربح',
                'export' => 'تصدير التقارير',
            ],
            'approval' => ['view' => 'عرض الموافقات', 'act' => 'اتخاذ قرار في الموافقات'],
            'device' => ['view' => 'عرض الأجهزة', 'register' => 'تسجيل جهاز', 'deactivate' => 'إيقاف جهاز', 'grant_offline' => 'منح تفويض أوفلاين'],
            'sync' => ['view' => 'عرض حالة المزامنة', 'resolve_conflict' => 'حل تعارضات المزامنة'],
            'import' => ['view' => 'عرض الاستيراد', 'upload' => 'رفع ملف', 'apply' => 'اعتماد الاستيراد'],
            'integration' => ['view' => 'عرض التكاملات', 'configure' => 'تهيئة التكاملات'],
            'audit' => ['view' => 'عرض سجل المراجعة', 'export' => 'تصدير سجل المراجعة'],
            'exception' => ['view' => 'عرض مركز الاستثناءات', 'review' => 'مراجعة إشارات الاستثناء'],
            'backup' => ['view' => 'عرض النسخ الاحتياطية', 'run' => 'تشغيل نسخة احتياطية', 'restore' => 'استعادة نسخة'],
        ];
    }

    /** الصلاحيات الحساسة التي لا تُمنح افتراضيًا. */
    public static function sensitive(): array
    {
        return [
            'customer.override_credit', 'price_list.override_discount', 'accounting.journal_reverse',
            'accounting.period_reopen', 'day_closure.reopen', 'day_closure.sync_exception',
            'sales_return.without_invoice', 'sales_return.cash_refund', 'stock.adjust_approve',
            'variance.approve', 'reports.cost.view', 'reports.profit.view', 'backup.restore',
            'audit.export', 'device.grant_offline', 'settings.posting_matrix',
        ];
    }

    public function run(): void
    {
        $sensitive = array_fill_keys(self::sensitive(), true);
        $count = 0;

        foreach (self::catalog() as $module => $actions) {
            foreach ($actions as $action => $label) {
                $code = "{$module}.{$action}";
                Permission::updateOrCreate(
                    ['code' => $code],
                    ['module' => $module, 'name_ar' => $label, 'is_sensitive' => isset($sensitive[$code])],
                );
                $count++;
            }
        }

        $this->command?->info("تم تعريف {$count} صلاحية.");
    }
}

<?php

namespace App\Domain\Reporting;

/**
 * قاموس المؤشرات: لكل مؤشر تعريف حسابي صريح ومصدر بيانات وفترة.
 * أي رقم في اللوحة يجب أن يُرد إلى تعريف هنا ويمكن فتح مستنداته.
 */
class KpiDictionary
{
    /** @return array<string, array{format:string, label:string, formula:string, source:string, note?:string, permission?:string}> */
    public static function all(): array
    {
        return [
            'gross_sales' => [
                'format' => 'money',
                'label' => 'إجمالي المبيعات',
                'formula' => 'مجموع (إجمالي السطور قبل الخصم) للفواتير غير الملغاة في الفترة',
                'source' => 'sales_invoices.subtotal',
            ],
            'net_sales' => [
                'format' => 'money',
                'label' => 'صافي المبيعات',
                'formula' => 'إجمالي المبيعات − خصومات السطور − خصم الفاتورة − مردودات المبيعات المعتمدة',
                'source' => 'sales_invoices + sales_returns',
                'note' => 'لا تشمل الضريبة ولا مصاريف التوصيل.',
            ],
            'collections' => [
                'format' => 'money',
                'label' => 'التحصيلات',
                'formula' => 'مجموع سندات القبض المرحّلة في الفترة',
                'source' => 'customer_receipts.amount',
                'note' => 'التحصيل ليس مبيعات: قد يكون عن فواتير فترات سابقة.',
            ],
            'cost_of_sales' => [
                'format' => 'money',
                'label' => 'تكلفة المبيعات',
                'formula' => 'مجموع تكلفة سطور الفواتير (بالتكلفة المحفوظة وقت البيع) − تكلفة المرتجعات',
                'source' => 'sales_invoice_lines.total_cost',
                'permission' => 'reports.cost.view',
            ],
            'gross_profit' => [
                'format' => 'money',
                'label' => 'مجمل الربح',
                'formula' => 'صافي المبيعات − تكلفة المبيعات',
                'source' => 'محسوب',
                'note' => 'مجمل الربح ليس صافي الربح: لا يخصم المصروفات التشغيلية.',
                'permission' => 'reports.profit.view',
            ],
            'net_profit' => [
                'format' => 'money',
                'label' => 'صافي الربح',
                'formula' => 'مجمل الربح − المصروفات التشغيلية المرحّلة في الفترة',
                'source' => 'محسوب من دفتر الأستاذ',
                'note' => 'لا يُعرض قبل اكتمال ترحيل التكاليف والمصروفات المرتبطة بالفترة.',
                'permission' => 'reports.profit.view',
            ],
            'receivables' => [
                'format' => 'money',
                'label' => 'مديونيات العملاء',
                'formula' => 'مجموع (إجمالي الفاتورة − المسدد − المرتجع) للفواتير المرحّلة',
                'source' => 'sales_invoices',
            ],
            'overdue_receivables' => [
                'format' => 'money',
                'label' => 'المتأخرات',
                'formula' => 'المديونيات التي تجاوز تاريخ استحقاقها تاريخ اليوم',
                'source' => 'sales_invoices.due_date',
            ],
            'payables' => [
                'format' => 'money',
                'label' => 'مستحقات الموردين',
                'formula' => 'مجموع (إجمالي فاتورة المورد − المسدد − المرتجع) للفواتير المرحّلة',
                'source' => 'supplier_invoices',
            ],
            'inventory_value' => [
                'format' => 'money',
                'label' => 'قيمة المخزون',
                'formula' => 'مجموع القيمة الدفترية للمخزون بالمتوسط المرجح المتحرك',
                'source' => 'item_costs.total_value',
                'permission' => 'reports.cost.view',
                'note' => 'تطابق رصيد حساب المخزون في دفتر الأستاذ.',
            ],
            'stock_shortages' => [
                'format' => 'integer',
                'label' => 'النواقص',
                'formula' => 'عدد الأصناف التي رصيدها المتاح أقل من حد إعادة الطلب',
                'source' => 'items.reorder_point مقابل stock_balances',
            ],
            'salesman_cash_custody' => [
                'format' => 'money',
                'label' => 'عهد المناديب النقدية',
                'formula' => 'رصيد حسابات خزن العهدة (نوع custody) من دفتر الأستاذ',
                'source' => 'journal_lines على حساب العهد',
            ],
            'pending_approvals' => [
                'format' => 'integer',
                'label' => 'الموافقات المعلقة',
                'formula' => 'عدد طلبات الموافقة بحالة pending',
                'source' => 'approval_requests',
            ],
            'backorders' => [
                'format' => 'integer',
                'label' => 'الطلبات المتأخرة',
                'formula' => 'أوامر البيع المعتمدة التي تجاوز تاريخها المطلوب ولم تُسلَّم بالكامل',
                'source' => 'sales_orders',
            ],
            'fill_rate' => [
                'format' => 'percent',
                'label' => 'معدل تلبية الطلبات',
                'formula' => 'مجموع الكميات المسلَّمة ÷ مجموع الكميات المطلوبة × 100',
                'source' => 'sales_order_lines',
            ],
            'productive_visits' => [
                'format' => 'percent',
                'label' => 'الزيارات المنتجة',
                'formula' => 'عدد الزيارات التي نتج عنها طلب أو تحصيل ÷ إجمالي الزيارات المنفذة × 100',
                'source' => 'visits.result',
            ],
        ];
    }

    public static function get(string $key): ?array
    {
        return self::all()[$key] ?? null;
    }
}

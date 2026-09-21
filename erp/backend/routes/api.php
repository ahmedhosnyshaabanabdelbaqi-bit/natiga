<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\FieldOpsController;
use App\Http\Controllers\Api\V1\ItemController;
use App\Http\Controllers\Api\V1\PurchasingController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\SalesInvoiceController;
use App\Http\Controllers\Api\V1\StockController;
use App\Http\Controllers\Api\V1\SyncController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| واجهة API — الإصدار الأول
|--------------------------------------------------------------------------
| كل مسار محمي يمر بـ:
|   auth:sanctum       تحقق الهوية
|   company.scope      تثبيت الشركة من المستخدم لا من مدخلات العميل
|   permission:...     تحقق الصلاحية في السيرفر (رفض افتراضي)
*/

Route::prefix('v1')->group(function () {
    Route::get('health', fn () => response()->json([
        'status' => 'ok',
        'system' => config('erp.system_name'),
        'time' => now()->toIso8601String(),
    ]));

    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

    Route::middleware(['auth:sanctum', 'company.scope'])->group(function () {
        // --- الهوية ---
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::post('auth/change-password', [AuthController::class, 'changePassword']);

        // --- اللوحة ---
        Route::get('dashboard', [DashboardController::class, 'index']);
        Route::get('dashboard/dictionary', [DashboardController::class, 'dictionary']);

        // --- الأصناف ---
        Route::middleware('permission:item.view')->group(function () {
            Route::get('items', [ItemController::class, 'index']);
            Route::get('items/barcode', [ItemController::class, 'byBarcode']);
            Route::get('items/price', [ItemController::class, 'price']);
            Route::get('items/{id}', [ItemController::class, 'show']);
        });
        Route::post('items', [ItemController::class, 'store'])->middleware('permission:item.create');
        Route::patch('items/{id}', [ItemController::class, 'update'])->middleware('permission:item.update');

        // --- العملاء ---
        Route::middleware('permission:customer.view')->group(function () {
            Route::get('customers', [CustomerController::class, 'index']);
            Route::get('customers/aging', [CustomerController::class, 'aging']);
            Route::get('customers/{id}', [CustomerController::class, 'show']);
            Route::get('customers/{id}/statement', [CustomerController::class, 'statement']);
        });
        Route::post('customers', [CustomerController::class, 'store'])->middleware('permission:customer.create');
        Route::patch('customers/{id}', [CustomerController::class, 'update'])->middleware('permission:customer.update');
        Route::post('customers/{id}/reassign', [CustomerController::class, 'reassign'])
            ->middleware('permission:salesman.assign_customers');

        // --- المخازن ---
        Route::middleware('permission:stock.view')->group(function () {
            Route::get('stock/balances', [StockController::class, 'balances']);
            Route::get('stock/availability', [StockController::class, 'availability']);
            Route::get('stock/item-card', [StockController::class, 'itemCard']);
            Route::get('stock/buckets', [StockController::class, 'buckets']);
            Route::get('stock/transfers', [StockController::class, 'transfers']);
        });
        Route::post('stock/transfers', [StockController::class, 'createTransfer'])->middleware('permission:stock.transfer');
        Route::post('stock/transfers/{id}/send', [StockController::class, 'sendTransfer'])->middleware('permission:stock.transfer');
        Route::post('stock/transfers/{id}/receive', [StockController::class, 'receiveTransfer'])
            ->middleware('permission:stock.transfer_receive');

        // --- المشتريات ---
        Route::middleware('permission:supplier.view')->group(function () {
            Route::get('suppliers', [PurchasingController::class, 'suppliers']);
            Route::get('suppliers/{id}/statement', [PurchasingController::class, 'supplierStatement']);
        });
        Route::get('goods-receipts', [PurchasingController::class, 'receiptsIndex'])->middleware('permission:goods_receipt.view');
        Route::post('goods-receipts', [PurchasingController::class, 'storeReceipt'])
            ->middleware('permission:goods_receipt.create,goods_receipt.post');
        Route::get('supplier-invoices', [PurchasingController::class, 'invoicesIndex'])->middleware('permission:supplier_invoice.view');
        Route::post('supplier-invoices', [PurchasingController::class, 'storeInvoice'])
            ->middleware('permission:supplier_invoice.create,supplier_invoice.post');

        // --- المبيعات ---
        Route::middleware('permission:sales_invoice.view')->group(function () {
            Route::get('sales-invoices', [SalesInvoiceController::class, 'index']);
            Route::get('sales-invoices/{id}', [SalesInvoiceController::class, 'show']);
        });
        Route::post('sales-invoices', [SalesInvoiceController::class, 'store'])->middleware('permission:sales_invoice.create');
        Route::post('sales-invoices/{id}/post', [SalesInvoiceController::class, 'post'])->middleware('permission:sales_invoice.post');
        Route::post('sales-invoices/{id}/cancel', [SalesInvoiceController::class, 'cancel'])->middleware('permission:sales_invoice.cancel');
        Route::post('sales-invoices/{id}/reprint', [SalesInvoiceController::class, 'reprint'])->middleware('permission:sales_invoice.reprint');

        // --- المرتجعات ---
        Route::post('sales-returns', [FieldOpsController::class, 'storeReturn'])->middleware('permission:sales_return.create');
        Route::post('sales-returns/{id}/receive', [FieldOpsController::class, 'receiveReturn'])->middleware('permission:sales_return.receive');
        Route::post('sales-returns/{id}/post', [FieldOpsController::class, 'postReturn'])->middleware('permission:sales_return.post');

        // --- التحصيل والعهد ---
        Route::get('customer-receipts', [FieldOpsController::class, 'receiptsIndex'])->middleware('permission:customer_receipt.view');
        Route::post('customer-receipts', [FieldOpsController::class, 'storeReceipt'])->middleware('permission:customer_receipt.create');
        Route::post('cash-deposits', [FieldOpsController::class, 'storeDeposit'])->middleware('permission:cash_deposit.create');
        Route::post('expenses', [FieldOpsController::class, 'storeExpense'])->middleware('permission:expense.create');
        Route::post('expenses/{id}/approve', [FieldOpsController::class, 'approveExpense'])->middleware('permission:expense.approve');

        // --- المناديب ---
        Route::get('salesmen', [FieldOpsController::class, 'salesmen']);

        // --- إقفال اليوم والعمولات ---
        Route::get('day-closures', [FieldOpsController::class, 'dayClosure'])->middleware('permission:day_closure.view');
        Route::post('day-closures/{id}/close', [FieldOpsController::class, 'closeDay'])->middleware('permission:day_closure.close');
        Route::post('day-closures/{id}/reopen', [FieldOpsController::class, 'reopenDay'])->middleware('permission:day_closure.reopen');
        Route::get('commissions/statement', [FieldOpsController::class, 'commissionStatement'])->middleware('permission:commission.view');

        // --- التقارير ---
        Route::get('reports/sales', [ReportController::class, 'sales'])->middleware('permission:reports.sales');
        Route::get('reports/salesmen', [ReportController::class, 'salesmen'])->middleware('permission:reports.salesmen');
        Route::get('reports/item-performance', [ReportController::class, 'itemPerformance'])->middleware('permission:reports.sales');
        Route::get('reports/inventory-valuation', [ReportController::class, 'inventoryValuation'])->middleware('permission:reports.inventory');
        Route::get('reports/aging', [ReportController::class, 'aging'])->middleware('permission:reports.accounting');
        Route::get('reports/trial-balance', [ReportController::class, 'trialBalance'])->middleware('permission:reports.accounting');
        Route::get('reports/income-statement', [ReportController::class, 'incomeStatement'])->middleware('permission:reports.accounting');

        // --- المزامنة (تطبيق المندوب) ---
        Route::prefix('sync')->group(function () {
            Route::post('register', [SyncController::class, 'register'])->middleware('permission:device.register');
            Route::post('push', [SyncController::class, 'push']);
            Route::get('pull', [SyncController::class, 'pull']);
            Route::get('status', [SyncController::class, 'status']);
            Route::get('operations', [SyncController::class, 'operations']);
        });
    });
});

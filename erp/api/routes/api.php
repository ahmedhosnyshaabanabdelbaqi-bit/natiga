<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DeliveryNoteController;
use App\Http\Controllers\Api\FieldOpsController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\PurchasingController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SalesInvoiceController;
use App\Http\Controllers\Api\SalesOrderController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\TreasuryController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API routes
|--------------------------------------------------------------------------
|
| Every authenticated route declares the permission it requires. The
| EnsurePermission middleware denies a route that declares none, so a missing
| declaration fails closed rather than exposing an endpoint.
|
| Route names follow <module>.<resource>.<action>; permissions follow the same
| shape, which keeps the mapping between a URL and a permission obvious in a
| review.
|
*/

Route::prefix('v1')->group(function () {

    // ---------------------------------------------------------------- public
    Route::post('auth/login', [AuthController::class, 'login'])
        ->middleware('throttle:10,1');

    // ------------------------------------------------------------- protected
    Route::middleware('auth:sanctum')->group(function () {

        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::post('auth/change-password', [AuthController::class, 'changePassword']);

        // ------------------------------------------------------- dashboard
        Route::get('dashboard', [ReportController::class, 'dashboard'])
            ->middleware('permission:dashboard.view');

        // ----------------------------------------------------------- items
        Route::middleware('permission:items.view')->group(function () {
            Route::get('items', [ItemController::class, 'index']);
            Route::get('items/by-barcode', [ItemController::class, 'byBarcode']);
            Route::get('items/{item}', [ItemController::class, 'show']);
        });
        Route::post('items', [ItemController::class, 'store'])->middleware('permission:items.create');
        Route::put('items/{item}', [ItemController::class, 'update'])->middleware('permission:items.update');

        // ------------------------------------------------------- customers
        Route::middleware('permission:customers.view,customers.view.all')->group(function () {
            Route::get('customers', [CustomerController::class, 'index']);
            Route::get('customers/{customer}', [CustomerController::class, 'show']);
            Route::get('customers/{customer}/statement', [CustomerController::class, 'statement']);
            Route::get('customers/{customer}/credit', [CustomerController::class, 'credit']);
        });
        Route::post('customers', [CustomerController::class, 'store'])
            ->middleware('permission:customers.create');
        Route::put('customers/{customer}', [CustomerController::class, 'update'])
            ->middleware('permission:customers.update');
        Route::post('customers/{customer}/reassign', [CustomerController::class, 'reassign'])
            ->middleware('permission:customers.reassign');

        // ----------------------------------------------------------- sales
        Route::middleware('permission:sales.order.view,sales.order.view.all')->group(function () {
            Route::get('sales/orders', [SalesOrderController::class, 'index']);
            Route::get('sales/orders/{salesOrder}', [SalesOrderController::class, 'show']);
        });
        Route::post('sales/orders', [SalesOrderController::class, 'store'])
            ->middleware('permission:sales.order.create');
        Route::put('sales/orders/{salesOrder}', [SalesOrderController::class, 'update'])
            ->middleware('permission:sales.order.update');
        Route::post('sales/orders/{salesOrder}/approve', [SalesOrderController::class, 'approve'])
            ->middleware('permission:sales.order.approve');
        Route::post('sales/orders/{salesOrder}/cancel', [SalesOrderController::class, 'cancel'])
            ->middleware('permission:sales.order.cancel');
        Route::post('sales/orders/{salesOrder}/deliveries', [SalesOrderController::class, 'createDelivery'])
            ->middleware('permission:sales.delivery.create');

        // ------------------------------------------------------- deliveries
        Route::middleware('permission:sales.delivery.view,sales.delivery.view.all')->group(function () {
            Route::get('sales/deliveries', [DeliveryNoteController::class, 'index']);
            Route::get('sales/deliveries/{deliveryNote}', [DeliveryNoteController::class, 'show']);
        });
        // Confirming a delivery is what moves stock, so it has its own permission.
        Route::post('sales/deliveries/{deliveryNote}/confirm', [DeliveryNoteController::class, 'confirm'])
            ->middleware('permission:sales.delivery.confirm');
        Route::post('sales/deliveries/{deliveryNote}/fail', [DeliveryNoteController::class, 'fail'])
            ->middleware('permission:sales.delivery.confirm');

        // --------------------------------------------------------- invoices
        Route::middleware('permission:sales.invoice.view,sales.invoice.view.all')->group(function () {
            Route::get('sales/invoices', [SalesInvoiceController::class, 'index']);
            Route::get('sales/invoices/{salesInvoice}', [SalesInvoiceController::class, 'show']);
        });
        Route::post('sales/invoices', [SalesInvoiceController::class, 'store'])
            ->middleware('permission:sales.invoice.create');
        Route::post('sales/deliveries/{deliveryNote}/invoice', [SalesInvoiceController::class, 'fromDelivery'])
            ->middleware('permission:sales.invoice.create');
        Route::post('sales/invoices/{salesInvoice}/post', [SalesInvoiceController::class, 'post'])
            ->middleware('permission:sales.invoice.post');
        Route::post('sales/invoices/{salesInvoice}/cancel', [SalesInvoiceController::class, 'cancel'])
            ->middleware('permission:sales.invoice.cancel');

        // ---------------------------------------------------------- returns
        Route::post('sales/returns', [TreasuryController::class, 'storeReturn'])
            ->middleware('permission:sales.return.create');
        Route::post('sales/returns/{salesReturn}/receive', [TreasuryController::class, 'receiveReturn'])
            ->middleware('permission:sales.return.receive');
        // Receiving goods and approving the credit note are separate permissions.
        Route::post('sales/returns/{salesReturn}/post', [TreasuryController::class, 'postReturn'])
            ->middleware('permission:sales.return.post');

        // ------------------------------------------------------- purchasing
        Route::middleware('permission:purchasing.view')->group(function () {
            Route::get('purchasing/orders', [PurchasingController::class, 'orders']);
            Route::get('purchasing/grni', [PurchasingController::class, 'grni']);
            Route::get('purchasing/reorder-suggestions', [PurchasingController::class, 'reorderSuggestions']);
        });
        Route::post('purchasing/orders', [PurchasingController::class, 'storeOrder'])
            ->middleware('permission:purchasing.order.create');
        Route::post('purchasing/orders/{purchaseOrder}/approve', [PurchasingController::class, 'approveOrder'])
            ->middleware('permission:purchasing.order.approve');
        Route::post('purchasing/receipts', [PurchasingController::class, 'storeReceipt'])
            ->middleware('permission:purchasing.receipt.create');
        Route::post('purchasing/receipts/{goodsReceipt}/post', [PurchasingController::class, 'postReceipt'])
            ->middleware('permission:purchasing.receipt.post');
        Route::post('purchasing/supplier-invoices', [PurchasingController::class, 'storeSupplierInvoice'])
            ->middleware('permission:purchasing.invoice.create');
        Route::post('purchasing/supplier-invoices/{supplierInvoice}/post', [PurchasingController::class, 'postSupplierInvoice'])
            ->middleware('permission:purchasing.invoice.post');
        Route::post('purchasing/landed-costs', [PurchasingController::class, 'storeLandedCost'])
            ->middleware('permission:purchasing.landed_cost.create');
        Route::post('purchasing/landed-costs/{landedCost}/post', [PurchasingController::class, 'postLandedCost'])
            ->middleware('permission:purchasing.landed_cost.post');

        // -------------------------------------------------------- inventory
        Route::middleware('permission:inventory.view')->group(function () {
            Route::get('inventory/balances', [InventoryController::class, 'balances']);
            Route::get('inventory/ledger', [InventoryController::class, 'ledger']);
            Route::get('inventory/expiring', [InventoryController::class, 'expiring']);
        });
        Route::get('inventory/valuation', [InventoryController::class, 'valuation'])
            ->middleware('permission:inventory.cost.view');
        Route::post('inventory/transfers', [InventoryController::class, 'storeTransfer'])
            ->middleware('permission:inventory.transfer.create');
        Route::post('inventory/transfers/{stockTransfer}/issue', [InventoryController::class, 'issueTransfer'])
            ->middleware('permission:inventory.transfer.issue');
        Route::post('inventory/transfers/{stockTransfer}/receive', [InventoryController::class, 'receiveTransfer'])
            ->middleware('permission:inventory.transfer.receive');
        Route::post('inventory/adjustments/{stockAdjustment}/post', [InventoryController::class, 'postAdjustment'])
            ->middleware('permission:inventory.adjustment.approve');

        // --------------------------------------------------------- treasury
        Route::middleware('permission:treasury.receipt.view,treasury.receipt.view.all')->group(function () {
            Route::get('treasury/receipts', [TreasuryController::class, 'receipts']);
        });
        Route::post('treasury/receipts', [TreasuryController::class, 'storeReceipt'])
            ->middleware('permission:treasury.receipt.create');
        Route::post('treasury/receipts/{receipt}/post', [TreasuryController::class, 'postReceipt'])
            ->middleware('permission:treasury.receipt.post');
        Route::post('treasury/receipts/{receipt}/allocate', [TreasuryController::class, 'allocateReceipt'])
            ->middleware('permission:treasury.receipt.allocate');
        Route::post('treasury/receipts/{receipt}/cancel', [TreasuryController::class, 'cancelReceipt'])
            ->middleware('permission:treasury.receipt.cancel');
        Route::get('treasury/custody', [TreasuryController::class, 'custodyBalance'])
            ->middleware('permission:treasury.custody.view,treasury.custody.view.all');
        Route::post('treasury/transfers', [TreasuryController::class, 'storeTransfer'])
            ->middleware('permission:treasury.transfer.create');
        Route::post('treasury/transfers/{cashTransfer}/post', [TreasuryController::class, 'postTransfer'])
            ->middleware('permission:treasury.transfer.approve');
        Route::post('treasury/expenses', [TreasuryController::class, 'storeExpense'])
            ->middleware('permission:treasury.expense.create');
        Route::post('treasury/expenses/{expense}/approve', [TreasuryController::class, 'approveExpense'])
            ->middleware('permission:treasury.expense.approve');

        // ------------------------------------------------------- field ops
        Route::post('field/van-loads', [FieldOpsController::class, 'storeVanLoad'])
            ->middleware('permission:field.van_load.create');
        Route::post('field/van-loads/{vanLoad}/issue', [FieldOpsController::class, 'issueVanLoad'])
            ->middleware('permission:field.van_load.issue');
        Route::post('field/van-loads/{vanLoad}/receive', [FieldOpsController::class, 'receiveVanLoad'])
            ->middleware('permission:field.van_load.receive');
        Route::post('field/van-returns', [FieldOpsController::class, 'returnVanStock'])
            ->middleware('permission:field.van_load.receive');
        Route::get('field/vehicles/{vehicle}/stock', [FieldOpsController::class, 'vanStock'])
            ->middleware('permission:field.van_load.view,inventory.view');

        Route::post('field/day-closings', [FieldOpsController::class, 'openDay'])
            ->middleware('permission:field.day_closing.open');
        Route::get('field/day-closings/{dayClosing}', [FieldOpsController::class, 'showDay'])
            ->middleware('permission:field.day_closing.view,field.day_closing.view.all');
        Route::post('field/day-closings/{dayClosing}/recompute', [FieldOpsController::class, 'recomputeDay'])
            ->middleware('permission:field.day_closing.view,field.day_closing.view.all');
        Route::post('field/day-closings/{dayClosing}/submit', [FieldOpsController::class, 'submitDay'])
            ->middleware('permission:field.day_closing.submit');
        Route::post('field/day-closings/{dayClosing}/approve', [FieldOpsController::class, 'approveDay'])
            ->middleware('permission:field.day_closing.approve');
        Route::post('field/day-closings/{dayClosing}/reopen', [FieldOpsController::class, 'reopenDay'])
            ->middleware('permission:field.day_closing.reopen');

        Route::post('field/shifts', [FieldOpsController::class, 'startShift'])
            ->middleware('permission:field.shift.manage');
        Route::post('field/shifts/{shift}/end', [FieldOpsController::class, 'endShift'])
            ->middleware('permission:field.shift.manage');
        Route::post('field/locations', [FieldOpsController::class, 'recordLocations'])
            ->middleware('permission:field.shift.manage');
        Route::get('field/rep-positions', [FieldOpsController::class, 'repPositions'])
            ->middleware('permission:field.location.view');

        // ------------------------------------------------------------ sync
        Route::prefix('sync')->group(function () {
            Route::get('pull', [SyncController::class, 'pull'])->middleware('permission:sync.use');
            Route::post('push', [SyncController::class, 'push'])->middleware('permission:sync.use');
            Route::get('status', [SyncController::class, 'status'])->middleware('permission:sync.use');
            Route::get('conflicts', [SyncController::class, 'conflicts'])
                ->middleware('permission:sync.conflict.view');
            Route::post('conflicts/{conflict}/resolve', [SyncController::class, 'resolveConflict'])
                ->middleware('permission:sync.conflict.resolve');
            Route::post('credit-grants', [SyncController::class, 'grantCredit'])
                ->middleware('permission:sync.credit.grant');
        });

        // --------------------------------------------------------- reports
        Route::prefix('reports')->middleware('permission:reports.view')->group(function () {
            Route::get('sales', [ReportController::class, 'sales']);
            Route::get('aging', [ReportController::class, 'aging']);
            Route::get('rep-performance', [ReportController::class, 'repPerformance']);
            Route::get('stock-speed', [ReportController::class, 'stockSpeed']);
        });
        Route::get('reports/trial-balance', [ReportController::class, 'trialBalance'])
            ->middleware('permission:accounting.reports.view');
        Route::get('reports/income-statement', [ReportController::class, 'incomeStatement'])
            ->middleware('permission:accounting.reports.view');

        // ----------------------------------------------------------- admin
        Route::prefix('admin')->group(function () {
            Route::get('company', [AdminController::class, 'company'])
                ->middleware('permission:admin.company.view');
            Route::put('company', [AdminController::class, 'updateCompany'])
                ->middleware('permission:admin.company.update');
            Route::get('warehouses', [AdminController::class, 'warehouses'])
                ->middleware('permission:inventory.view');

            Route::get('users', [AdminController::class, 'users'])
                ->middleware('permission:admin.users.view');
            Route::post('users', [AdminController::class, 'storeUser'])
                ->middleware('permission:admin.users.create');
            Route::put('users/{user}', [AdminController::class, 'updateUser'])
                ->middleware('permission:admin.users.update');

            Route::get('roles', [AdminController::class, 'roles'])
                ->middleware('permission:admin.roles.view');
            Route::post('roles', [AdminController::class, 'storeRole'])
                ->middleware('permission:admin.roles.manage');
            Route::put('roles/{role}', [AdminController::class, 'updateRole'])
                ->middleware('permission:admin.roles.manage');

            Route::get('posting-matrix', [AdminController::class, 'postingMatrix'])
                ->middleware('permission:accounting.posting_matrix.view');
            Route::put('posting-matrix', [AdminController::class, 'updatePostingMatrix'])
                ->middleware('permission:accounting.posting_matrix.manage');

            Route::get('approvals', [AdminController::class, 'approvals'])
                ->middleware('permission:approvals.view');
            Route::post('approvals/{approval}/decide', [AdminController::class, 'decideApproval'])
                ->middleware('permission:approvals.decide');
        });
    });
});

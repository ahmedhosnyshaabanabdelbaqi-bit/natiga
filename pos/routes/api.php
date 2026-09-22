<?php

declare(strict_types=1);

use App\Http\Controllers\Api\ApprovalController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CashController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\HeldCartController;
use App\Http\Controllers\Api\ImportController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\PosController;
use App\Http\Controllers\Api\PrintJobController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\PurchaseController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\ReturnController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\SetupController;
use App\Http\Controllers\Api\ShiftController;
use App\Http\Controllers\Api\SyncController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| POS API (v1)
|--------------------------------------------------------------------------
| Authentication: Sanctum bearer tokens (or cookie session for the SPA).
| Every sensitive route carries a `permission:` gate that is enforced on the
| SERVER — hiding a button in the UI is never the control.
|
| `pos.context` resolves the branch/terminal/shift once per request from the
| X-POS-Terminal header, so no controller trusts a client-supplied branch.
*/

Route::prefix('v1')->group(function () {

    // ---- public -----------------------------------------------------------
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:20,1');
    Route::post('auth/unlock', [AuthController::class, 'unlock'])->middleware('throttle:20,1');
    Route::get('setup/status', [SetupController::class, 'status']);

    // ---- authenticated ----------------------------------------------------
    Route::middleware(['auth:sanctum', 'pos.context'])->group(function () {

        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        // ---- setup wizard --------------------------------------------------
        Route::middleware('permission:settings.manage')->prefix('setup')->group(function () {
            Route::post('store', [SetupController::class, 'saveStore']);
            Route::post('features', [SetupController::class, 'saveFeatures']);
            Route::post('branch', [SetupController::class, 'saveBranch']);
            Route::post('warehouse', [SetupController::class, 'saveWarehouse']);
            Route::post('terminal', [SetupController::class, 'saveTerminal']);
            Route::post('tax', [SetupController::class, 'saveTax']);
            Route::post('complete', [SetupController::class, 'complete']);
        });
        Route::post('setup/user', [SetupController::class, 'saveUser'])->middleware('permission:users.manage');

        // ---- point of sale --------------------------------------------------
        Route::middleware('permission:pos.use')->group(function () {
            Route::get('pos/bootstrap', [PosController::class, 'bootstrap']);
            Route::post('pos/scan', [PosController::class, 'scan']);
            Route::get('pos/search', [PosController::class, 'search']);
        });

        // ---- sales ------------------------------------------------------------
        Route::post('sales', [SaleController::class, 'store'])->middleware('permission:sales.create');
        Route::post('sales/quote', [SaleController::class, 'quote'])->middleware('permission:sales.create');
        // Recover a lost response instead of re-submitting the sale.
        Route::get('sales/by-key/{key}', [SaleController::class, 'lookup']);
        Route::get('sales', [SaleController::class, 'index']);
        Route::get('sales/{sale}', [SaleController::class, 'show']);
        Route::get('sales/{sale}/returnable', [SaleController::class, 'returnable'])->middleware('permission:sales.return');
        Route::post('sales/{sale}/reprint', [SaleController::class, 'reprint'])->middleware('permission:pos.reprint');

        // ---- returns -----------------------------------------------------------
        Route::middleware('permission:sales.return')->group(function () {
            Route::post('returns', [ReturnController::class, 'store']);
            Route::get('returns', [ReturnController::class, 'index']);
            Route::get('returns/{saleReturn}', [ReturnController::class, 'show']);
        });

        // ---- held carts ---------------------------------------------------------
        Route::middleware('permission:pos.hold')->prefix('held-carts')->group(function () {
            Route::get('/', [HeldCartController::class, 'index']);
            Route::post('/', [HeldCartController::class, 'store']);
            Route::put('{heldCart}', [HeldCartController::class, 'update']);
            Route::post('{heldCart}/recall', [HeldCartController::class, 'recall']);
            Route::post('{heldCart}/release', [HeldCartController::class, 'release']);
            Route::delete('{heldCart}', [HeldCartController::class, 'destroy']);
        });

        // ---- approvals ----------------------------------------------------------
        Route::post('approvals', [ApprovalController::class, 'request']);
        Route::post('approvals/{uuid}/approve', [ApprovalController::class, 'approve']);

        // ---- shifts & cash -------------------------------------------------------
        Route::get('shifts/current', [ShiftController::class, 'current']);
        Route::get('shifts', [ShiftController::class, 'index']);
        Route::post('shifts', [ShiftController::class, 'open'])->middleware('permission:cash.shift.open');
        Route::post('shifts/{shift}/close', [ShiftController::class, 'close'])->middleware('permission:cash.shift.close');
        Route::post('shifts/{shift}/reconcile', [ShiftController::class, 'reconcile'])->middleware('permission:cash.shift.reconcile');
        Route::get('shifts/{shift}/report', [ShiftController::class, 'report']);

        Route::get('cash/accounts', [CashController::class, 'accounts']);
        Route::get('cash/expense-categories', [CashController::class, 'expenseCategories']);
        Route::post('cash/movements', [CashController::class, 'movement'])->middleware('permission:cash.movement');
        Route::post('cash/expenses', [CashController::class, 'expense'])->middleware('permission:cash.movement');
        Route::post('cash/open-drawer', [CashController::class, 'openDrawer'])->middleware('permission:cash.drawer.open');

        // ---- customers -------------------------------------------------------------
        Route::middleware('permission:customers.view')->group(function () {
            Route::get('customers', [CustomerController::class, 'index']);
            Route::get('customers/{customer}', [CustomerController::class, 'show']);
            Route::get('customers/{customer}/statement', [CustomerController::class, 'statement']);
        });
        Route::middleware('permission:customers.manage')->group(function () {
            Route::post('customers', [CustomerController::class, 'store']);
            Route::put('customers/{customer}', [CustomerController::class, 'update']);
        });
        Route::post('customers/{customer}/collect', [CustomerController::class, 'collect'])->middleware('permission:customers.collect');

        // ---- catalogue ---------------------------------------------------------------
        Route::middleware('permission:catalog.view')->group(function () {
            Route::get('products', [ProductController::class, 'index']);
            Route::get('products/lookups', [ProductController::class, 'lookups']);
            Route::get('products/{product}', [ProductController::class, 'show']);
        });
        Route::middleware('permission:catalog.manage')->group(function () {
            Route::post('products', [ProductController::class, 'store']);
            Route::put('products/{product}', [ProductController::class, 'update']);
            Route::delete('products/{product}', [ProductController::class, 'destroy']);
            Route::post('products/{product}/barcodes', [ProductController::class, 'addBarcode']);
        });

        // ---- bulk import ------------------------------------------------------------
        Route::middleware('permission:catalog.manage')->prefix('import')->group(function () {
            Route::get('template', [ImportController::class, 'template']);
            // Two phases: validate and show the errors, THEN write.
            Route::post('preview', [ImportController::class, 'preview']);
            Route::post('commit', [ImportController::class, 'commit']);
        });

        // ---- inventory ------------------------------------------------------------------
        Route::middleware('permission:inventory.view')->group(function () {
            Route::get('inventory/balances', [InventoryController::class, 'balances']);
            Route::get('inventory/movements', [InventoryController::class, 'movements']);
            Route::get('inventory/reconcile', [InventoryController::class, 'reconcile']);
        });
        Route::middleware('permission:inventory.adjust')->group(function () {
            Route::post('inventory/adjust', [InventoryController::class, 'adjust']);
            Route::post('inventory/rebuild', [InventoryController::class, 'rebuild']);
        });
        Route::middleware('permission:inventory.transfer')->group(function () {
            Route::post('inventory/transfers', [InventoryController::class, 'createTransfer']);
            Route::post('inventory/transfers/{transfer}/send', [InventoryController::class, 'sendTransfer']);
            Route::post('inventory/transfers/{transfer}/receive', [InventoryController::class, 'receiveTransfer']);
        });
        Route::middleware('permission:inventory.stocktake')->group(function () {
            Route::post('inventory/stocktakes', [InventoryController::class, 'startStocktake']);
            Route::get('inventory/stocktakes/{stocktake}', [InventoryController::class, 'showStocktake']);
            Route::post('inventory/stocktakes/{stocktake}/count', [InventoryController::class, 'countStocktake']);
            Route::post('inventory/stocktakes/{stocktake}/post', [InventoryController::class, 'postStocktake']);
        });

        // ---- purchasing ---------------------------------------------------------------------
        Route::middleware('permission:purchasing.view')->group(function () {
            Route::get('suppliers', [PurchaseController::class, 'suppliers']);
            Route::get('purchase-orders', [PurchaseController::class, 'orders']);
            Route::get('purchase-orders/{purchaseOrder}', [PurchaseController::class, 'showOrder']);
            Route::get('goods-receipts', [PurchaseController::class, 'receipts']);
        });
        Route::middleware('permission:purchasing.manage')->group(function () {
            Route::post('suppliers', [PurchaseController::class, 'storeSupplier']);
            Route::post('purchase-orders', [PurchaseController::class, 'storeOrder']);
            Route::post('goods-receipts', [PurchaseController::class, 'receive']);
        });

        // ---- sync (offline) ----------------------------------------------------------------------
        Route::prefix('sync')->group(function () {
            Route::get('status', [SyncController::class, 'status']);
            Route::get('pull', [SyncController::class, 'pull']);
            Route::post('push', [SyncController::class, 'push']);
            Route::get('conflicts', [SyncController::class, 'conflicts'])->middleware('permission:sales.view_all');
            Route::post('conflicts/{offlineOperation}/resolve', [SyncController::class, 'resolve'])
                ->middleware('permission:cash.shift.reconcile');
        });

        // ---- printing ------------------------------------------------------------------------------
        Route::prefix('print-jobs')->group(function () {
            Route::get('pending', [PrintJobController::class, 'pending']);
            Route::get('failed', [PrintJobController::class, 'failed']);
            Route::post('{printJob}/printed', [PrintJobController::class, 'markPrinted']);
            Route::post('{printJob}/failed', [PrintJobController::class, 'markFailed']);
            Route::post('{printJob}/retry', [PrintJobController::class, 'retry']);
        });

        // ---- reports --------------------------------------------------------------------------------
        Route::middleware('permission:reports.view')->prefix('reports')->group(function () {
            Route::get('dashboard', [ReportController::class, 'dashboard']);
            Route::get('sales', [ReportController::class, 'sales']);
            Route::get('products', [ReportController::class, 'products']);
            Route::get('inventory', [ReportController::class, 'inventory']);
            Route::get('alerts', [ReportController::class, 'alerts']);
            Route::get('drill-down', [ReportController::class, 'drillDown']);
        });
    });
});

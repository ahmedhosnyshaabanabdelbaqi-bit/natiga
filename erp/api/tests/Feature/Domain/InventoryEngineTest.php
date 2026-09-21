<?php

namespace Tests\Feature\Domain;

use App\Domain\Inventory\InventoryService;
use App\Domain\Inventory\StockQuery;
use App\Domain\Support\Num;
use App\Exceptions\InsufficientStockException;
use App\Models\Batch;
use App\Models\Item;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The stock engine's guarantees. These are the ones that, if broken, silently
 * corrupt every downstream number — so each is asserted directly rather than
 * inferred from a higher-level flow.
 */
class InventoryEngineTest extends TestCase
{
    private InventoryService $inventory;

    private StockQuery $stock;

    private Item $item;

    private Warehouse $main;

    protected function setUp(): void
    {
        parent::setUp();

        $this->inventory = app(InventoryService::class);
        $this->stock = app(StockQuery::class);
        $this->item = Item::where('code', 'DET-001')->firstOrFail();
        $this->main = Warehouse::where('code', 'MAIN')->firstOrFail();
    }

    #[Test]
    public function receiving_raises_the_balance_and_sets_the_average_cost(): void
    {
        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '100', '30', 'test', 1
        ));

        $this->assertSame('100.0000', $this->stock->onHand($this->main->id, $this->item->id));
        $this->assertSame(0, Num::cmp($this->inventory->currentAverageCost($this->item->id), '30'));
    }

    #[Test]
    public function the_moving_average_is_weighted_by_quantity_not_a_simple_mean(): void
    {
        // 100 @ 30 then 100 @ 40 → 35. But 100 @ 30 then 300 @ 40 → 37.50,
        // which a naive (30+40)/2 would get wrong.
        DB::transaction(function () {
            $this->inventory->receive($this->main->id, $this->item->id, '100', '30', 'test', 1);
            $this->inventory->receive($this->main->id, $this->item->id, '300', '40', 'test', 2);
        });

        $this->assertSame(0, Num::cmp($this->inventory->currentAverageCost($this->item->id), '37.5'),
            'Average should be (100*30 + 300*40) / 400 = 37.50');
    }

    #[Test]
    public function issuing_does_not_change_the_average_cost(): void
    {
        DB::transaction(function () {
            $this->inventory->receive($this->main->id, $this->item->id, '100', '30', 'test', 1);
            $this->inventory->receive($this->main->id, $this->item->id, '100', '40', 'test', 2);
        });

        $before = $this->inventory->currentAverageCost($this->item->id);

        DB::transaction(fn () => $this->inventory->issue(
            $this->main->id, $this->item->id, '50', 'test', 3
        ));

        $this->assertSame($before, $this->inventory->currentAverageCost($this->item->id));
    }

    #[Test]
    public function an_issued_movement_records_the_cost_that_applied_at_that_moment(): void
    {
        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '100', '30', 'test', 1
        ));

        $sale = DB::transaction(fn () => $this->inventory->issue(
            $this->main->id, $this->item->id, '10', 'sale', 1
        ));

        // A later, more expensive purchase must not retroactively change what
        // the earlier sale cost.
        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '100', '90', 'test', 2
        ));

        $this->assertSame(0, Num::cmp($sale->fresh()->unit_cost, '30'),
            'A historical movement cost must not move when new stock arrives');
    }

    #[Test]
    public function issuing_more_than_is_available_is_refused(): void
    {
        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '10', '30', 'test', 1
        ));

        $this->expectException(InsufficientStockException::class);

        DB::transaction(fn () => $this->inventory->issue(
            $this->main->id, $this->item->id, '11', 'sale', 1
        ));
    }

    #[Test]
    public function the_database_itself_rejects_a_negative_balance(): void
    {
        // Even if application logic were bypassed entirely, the storage layer
        // will not hold a negative quantity.
        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '10', '30', 'test', 1
        ));

        $this->expectException(\Illuminate\Database\QueryException::class);

        DB::table('stock_balances')
            ->where('warehouse_id', $this->main->id)
            ->where('item_id', $this->item->id)
            ->update(['qty_on_hand' => -1]);
    }

    #[Test]
    public function reserved_stock_is_not_available_to_another_document(): void
    {
        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '100', '30', 'test', 1
        ));

        DB::transaction(fn () => $this->inventory->reserve(
            $this->main->id, $this->item->id, '80', 'sales_order', 1
        ));

        $this->assertSame('100.0000', $this->stock->onHand($this->main->id, $this->item->id));
        $this->assertSame('20.0000', $this->stock->available($this->main->id, $this->item->id));

        $this->expectException(InsufficientStockException::class);

        DB::transaction(fn () => $this->inventory->issue(
            $this->main->id, $this->item->id, '30', 'other_sale', 2
        ));
    }

    #[Test]
    public function releasing_a_reservation_returns_the_quantity_to_available(): void
    {
        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '100', '30', 'test', 1
        ));

        $reservation = DB::transaction(fn () => $this->inventory->reserve(
            $this->main->id, $this->item->id, '80', 'sales_order', 1
        ));

        DB::transaction(fn () => $this->inventory->release($reservation, '30'));

        $this->assertSame('50.0000', $this->stock->available($this->main->id, $this->item->id));
        $this->assertSame('50.0000', $reservation->fresh()->qty_base);
    }

    #[Test]
    public function a_transfer_moves_value_without_creating_profit(): void
    {
        $transit = Warehouse::where('code', 'TRANSIT')->firstOrFail();

        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '100', '30', 'test', 1
        ));

        $valueBefore = DB::table('item_costs')
            ->where('item_id', $this->item->id)->value('total_value');

        $result = DB::transaction(fn () => $this->inventory->move(
            $this->main->id, $transit->id, $this->item->id, '40', 'stock_transfer', 1
        ));

        $valueAfter = DB::table('item_costs')
            ->where('item_id', $this->item->id)->value('total_value');

        $this->assertSame(0, Num::cmp($valueBefore, $valueAfter),
            'Moving your own goods is not a value event');
        $this->assertSame(0, Num::cmp($result['out']->unit_cost, $result['in']->unit_cost),
            'Both legs of a transfer carry the same cost');
        $this->assertSame('60.0000', $this->stock->onHand($this->main->id, $this->item->id));
        $this->assertSame('40.0000', $this->stock->onHand($transit->id, $this->item->id));
    }

    #[Test]
    public function stock_in_transit_and_quarantine_is_never_counted_as_sellable(): void
    {
        $transit = Warehouse::where('code', 'TRANSIT')->firstOrFail();
        $quarantine = Warehouse::where('code', 'QUAR')->firstOrFail();

        DB::transaction(function () use ($transit, $quarantine) {
            $this->inventory->receive($this->main->id, $this->item->id, '100', '30', 'test', 1);
            $this->inventory->receive($transit->id, $this->item->id, '50', '30', 'test', 2);
            $this->inventory->receive($quarantine->id, $this->item->id, '25', '30', 'test', 3);
        });

        $position = $this->stock->position($this->item->id);

        $this->assertSame('175.0000', $position['on_hand']);
        $this->assertSame('100.0000', $position['sellable'], 'Only the main warehouse is sellable');
        $this->assertSame('50.0000', $position['in_transit']);
        $this->assertSame('25.0000', $position['quarantine']);
    }

    #[Test]
    public function batch_picking_takes_the_nearest_expiry_first(): void
    {
        $item = Item::where('code', 'FOOD-001')->firstOrFail();

        $later = Batch::create([
            'company_id' => $this->company->id, 'item_id' => $item->id,
            'code' => 'LATE', 'expiry_date' => now()->addYear()->toDateString(), 'status' => 'ok',
        ]);
        $sooner = Batch::create([
            'company_id' => $this->company->id, 'item_id' => $item->id,
            'code' => 'SOON', 'expiry_date' => now()->addMonths(3)->toDateString(), 'status' => 'ok',
        ]);

        DB::transaction(function () use ($item, $later, $sooner) {
            $this->inventory->receive($this->main->id, $item->id, '50', '60', 'test', 1, batchId: $later->id);
            $this->inventory->receive($this->main->id, $item->id, '50', '60', 'test', 2, batchId: $sooner->id);
        });

        $picks = $this->inventory->allocateBatches($this->main->id, $item, '60');

        $this->assertSame($sooner->id, $picks[0]['batch_id'], 'Nearest expiry must be picked first');
        $this->assertSame('50.0000', $picks[0]['qty_base']);
        $this->assertSame($later->id, $picks[1]['batch_id']);
        $this->assertSame('10.0000', $picks[1]['qty_base']);
    }

    #[Test]
    public function expired_stock_and_stock_below_minimum_shelf_life_is_not_picked_for_sale(): void
    {
        // FOOD-001 requires 30 days of remaining shelf life to be sellable.
        $item = Item::where('code', 'FOOD-001')->firstOrFail();

        $expired = Batch::create([
            'company_id' => $this->company->id, 'item_id' => $item->id,
            'code' => 'EXPIRED', 'expiry_date' => now()->subDay()->toDateString(), 'status' => 'ok',
        ]);
        $tooSoon = Batch::create([
            'company_id' => $this->company->id, 'item_id' => $item->id,
            'code' => 'NEARLY', 'expiry_date' => now()->addDays(10)->toDateString(), 'status' => 'ok',
        ]);
        $good = Batch::create([
            'company_id' => $this->company->id, 'item_id' => $item->id,
            'code' => 'GOOD', 'expiry_date' => now()->addMonths(6)->toDateString(), 'status' => 'ok',
        ]);

        DB::transaction(function () use ($item, $expired, $tooSoon, $good) {
            $this->inventory->receive($this->main->id, $item->id, '10', '60', 'test', 1, batchId: $expired->id);
            $this->inventory->receive($this->main->id, $item->id, '10', '60', 'test', 2, batchId: $tooSoon->id);
            $this->inventory->receive($this->main->id, $item->id, '10', '60', 'test', 3, batchId: $good->id);
        });

        $picks = $this->inventory->allocateBatches($this->main->id, $item, '10');

        $this->assertCount(1, $picks);
        $this->assertSame($good->id, $picks[0]['batch_id']);

        // Only 10 of the 30 on hand are actually sellable.
        $this->expectException(InsufficientStockException::class);
        $this->inventory->allocateBatches($this->main->id, $item, '11');
    }

    #[Test]
    public function a_late_cost_splits_between_remaining_stock_and_goods_already_sold(): void
    {
        DB::transaction(fn () => $this->inventory->receive(
            $this->main->id, $this->item->id, '100', '30', 'test', 1
        ));

        DB::transaction(fn () => $this->inventory->issue(
            $this->main->id, $this->item->id, '60', 'sale', 1
        ));

        // Freight of 100 arrives after 60 of the 100 units were sold.
        $split = DB::transaction(fn () => $this->inventory->applyLateCost(
            $this->item->id, '100.00', qtyStillOnHand: '40', qtyOriginal: '100'
        ));

        $this->assertSame('40.00', $split['to_inventory']);
        $this->assertSame('60.00', $split['to_cogs']);
        $this->assertSame(0, Num::cmp(
            Num::add($split['to_inventory'], $split['to_cogs'], 2), '100.00'
        ), 'The whole cost must be accounted for, not partly dropped');
    }

}

ALTER TABLE stock_movements ADD COLUMN purchase_order_line_id text REFERENCES purchase_order_lines(id);
CREATE UNIQUE INDEX stock_purchase_receipt_line ON stock_movements(purchase_order_line_id) WHERE purchase_order_line_id IS NOT NULL;

-- Existing receiving writes include the order number and invoice reference.
-- Link only unique, exact matches, preserving independent receipts on reused batches.
WITH matches AS (
 SELECT s.id movement_id,l.id line_id,
        count(*) OVER (PARTITION BY s.id) movement_matches,
        count(*) OVER (PARTITION BY l.id) line_matches
 FROM stock_movements s
 JOIN purchase_order_lines l ON l.inventory_id=s.item_id
 JOIN purchase_orders o ON o.id=l.purchase_order_id
 WHERE o.status='received' AND s.type='receive'
   AND s.quantity=l.received_quantity AND s.cost_snapshot=l.unit_cost
   AND s.reason='توريد أمر الشراء ' || o.order_no || ' · ' || o.reference
)
UPDATE stock_movements s SET purchase_order_line_id=m.line_id
FROM matches m WHERE s.id=m.movement_id AND m.movement_matches=1 AND m.line_matches=1;

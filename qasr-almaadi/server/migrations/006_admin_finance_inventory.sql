UPDATE roles
SET permissions = permissions || '["stock.read","stock.write","billing.read","billing.write","prices.write"]'::jsonb
WHERE name = 'admin';

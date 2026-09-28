ALTER TABLE "orders" ADD COLUMN "cod_review_reminded_until" timestamp with time zone;--> statement-breakpoint
-- Inventory managers restock and adjust stock; editing the catalog (products,
-- prices, images) belongs to admins. Applies the new default to existing roles.
DELETE FROM "role_permissions"
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "key" = 'INVENTORY_MANAGER')
  AND "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" = 'products.manage');

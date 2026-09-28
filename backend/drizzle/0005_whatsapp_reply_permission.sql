-- New permission: reply to customers on WhatsApp inside the 24-hour service window.
-- On a fresh database the roles don't exist yet and bootstrapReferenceData()
-- applies the defaults; on an existing one this grants it to the roles that
-- get it by default, leaving any custom role edits alone.
INSERT INTO "permissions" ("key") VALUES ('whatsapp.reply') ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p.key = 'whatsapp.reply' AND r.key IN ('SUPER_ADMIN', 'ADMIN', 'ORDER_MANAGER', 'SUPPORT')
ON CONFLICT DO NOTHING;

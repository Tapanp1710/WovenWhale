-- Row Level Security: deny-by-default.
--
-- All data access goes through the WovenWhale commerce API, which connects with
-- a privileged role (table owner / BYPASSRLS). Enabling RLS without policies
-- means Supabase's auto-generated REST/GraphQL APIs (roles `anon` and
-- `authenticated`) can read or write NOTHING, even if the anon key leaks.
-- Add explicit, narrowly-scoped policies only if a table must ever be exposed
-- directly to Supabase clients.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '__drizzle%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
  END IF;
END $$;

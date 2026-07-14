-- URDRIP DZ — Safe migration (no data loss)
-- Run this in Supabase SQL Editor

-- 1. Add missing columns
DO $$ BEGIN ALTER TABLE categories ADD COLUMN description TEXT DEFAULT ''; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN description TEXT DEFAULT ''; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN stock SMALLINT DEFAULT 5; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN null; END $$;

-- 2. Settings table (admin password sync)
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN DROP POLICY IF EXISTS "all_settings" ON settings; EXCEPTION WHEN OTHERS THEN null; END $$;
CREATE POLICY "all_settings" ON settings FOR ALL USING (true) WITH CHECK (true);
INSERT INTO settings (key, value) VALUES ('admin_pass', 'urdrip2026') ON CONFLICT (key) DO NOTHING;

-- 3. Fix RLS policies
DO $$ BEGIN DROP POLICY IF EXISTS "all" ON categories; EXCEPTION WHEN OTHERS THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "all" ON products; EXCEPTION WHEN OTHERS THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "all" ON orders; EXCEPTION WHEN OTHERS THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "all_cat" ON categories; EXCEPTION WHEN OTHERS THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "all_prod" ON products; EXCEPTION WHEN OTHERS THEN null; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "all_ord" ON orders; EXCEPTION WHEN OTHERS THEN null; END $$;
CREATE POLICY "all_cat" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "all_prod" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "all_ord" ON orders FOR ALL USING (true) WITH CHECK (true);

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_prod_updated ON products;
CREATE TRIGGER trg_prod_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();

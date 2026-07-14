-- الجزء 1: جدول settings
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN DROP POLICY IF EXISTS "all_settings" ON settings; EXCEPTION WHEN OTHERS THEN null; END $$;
CREATE POLICY "all_settings" ON settings FOR ALL USING (true) WITH CHECK (true);
INSERT INTO settings (key, value) VALUES ('admin_pass', 'urdrip2026') ON CONFLICT (key) DO NOTHING;

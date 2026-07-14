-- Quick fix: Allow INSERT on orders table
-- Run this in Supabase SQL Editor

DROP POLICY IF EXISTS "all_ord" ON orders;
CREATE POLICY "all_ord" ON orders FOR ALL USING (true) WITH CHECK (true);

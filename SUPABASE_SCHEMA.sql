-- ============================================
-- URDRIP DZ — Schema v8 (full sync)
-- ============================================

DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- Categories
CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sort_order SMALLINT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO categories (name, sort_order) VALUES
  ('ستريت وير', 1),
  ('إكسسوارات', 2),
  ('سنيكرز', 3);

-- Products
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('clothes', 'accessories', 'gang')),
  price INTEGER NOT NULL DEFAULT 0,
  old_price INTEGER DEFAULT 0,
  color TEXT,
  sizes TEXT DEFAULT 'S,M,L,XL,XXL',
  image TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  badge TEXT CHECK (badge IN ('new', 'hot', 'sale', 'best')),
  description TEXT DEFAULT '',
  stock SMALLINT DEFAULT 5 CHECK (stock >= 0),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prod_cat_active ON products(category, active) WHERE active = true;
CREATE INDEX idx_prod_created ON products(created_at DESC);

-- Orders
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  customer TEXT NOT NULL,
  phone TEXT NOT NULL,
  wilaya TEXT NOT NULL,
  commune TEXT,
  delivery TEXT DEFAULT 'home' CHECK (delivery IN ('home', 'office')),
  note TEXT,
  items JSONB NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_status ON orders(status, created_at DESC);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES ('admin_pass', 'urdrip2026');

-- RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "p1" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "p2" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "p3" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "p4" ON settings FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_prod_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();

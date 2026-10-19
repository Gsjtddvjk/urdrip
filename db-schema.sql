-- ============================================================================
-- URDRIP — Migration 001: security hardening + reliable order pipeline
-- ----------------------------------------------------------------------------
-- SAFE BY DESIGN: additive and idempotent. It does NOT drop/truncate/rewrite any
-- table or row. It only (a) adds columns/tables/functions, (b) replaces the
-- open "USING (true)" RLS policies with least-privilege ones, (c) narrows grants.
--
-- BEFORE RUNNING: take a backup (Supabase Dashboard -> Database -> Backups, or
-- pg_dump). Run in the SQL Editor of a STAGING project first if you have one.
-- AFTER RUNNING: follow docs/DEPLOY.md (create admin user, add to admin_users).
-- Rollback (emergency only, re-opens the holes): supabase/rollback/001_rollback.sql
-- ============================================================================

-- ---------- 1. Admin allowlist (authorization source of truth) --------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
-- No policies on purpose: unreachable through the API (deny by default).

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- 2. Orders: new columns, indexes, constraints --------------------
alter table public.orders add column if not exists idempotency_key   uuid;
alter table public.orders add column if not exists subtotal          integer;
alter table public.orders add column if not exists shipping          integer;
alter table public.orders add column if not exists updated_at        timestamptz not null default now();
alter table public.orders add column if not exists status_changed_at timestamptz;

create unique index if not exists orders_idempotency_key_uq
  on public.orders (idempotency_key) where idempotency_key is not null;
create index if not exists orders_phone_created_idx   on public.orders (phone, created_at desc);
create index if not exists orders_created_idx         on public.orders (created_at desc);

do $$ begin
  alter table public.orders add constraint orders_total_nonneg check (total >= 0) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_price_nonneg check (price >= 0) not valid;
exception when duplicate_object then null; end $$;

-- Audit trail of status changes (who/when) — powers "recent activity".
create table if not exists public.order_events (
  id          bigserial primary key,
  order_id    bigint not null references public.orders(id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor       uuid,
  created_at  timestamptz not null default now()
);
create index if not exists order_events_order_idx   on public.order_events (order_id, created_at desc);
create index if not exists order_events_created_idx on public.order_events (created_at desc);
alter table public.order_events enable row level security;

-- ---------- 3. Order guard: immutable customer data + valid transitions -----
create or replace function public.orders_guard()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if (new.customer, new.phone, new.wilaya, new.commune, new.delivery, new.note,
      new.items, new.total, new.idempotency_key, new.created_at)
     is distinct from
     (old.customer, old.phone, old.wilaya, old.commune, old.delivery, old.note,
      old.items, old.total, old.idempotency_key, old.created_at) then
    raise exception 'order_immutable_fields' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'pending'   and new.status in ('confirmed','cancelled'))
      or (old.status = 'confirmed' and new.status in ('shipped','cancelled'))
      or (old.status = 'shipped'   and new.status in ('delivered','cancelled'))
    ) then
      raise exception 'invalid_status_transition' using errcode = 'P0001';
    end if;
    new.status_changed_at := now();
    insert into public.order_events (order_id, from_status, to_status, actor)
    values (old.id, old.status, new.status, auth.uid());
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_orders_guard on public.orders;
create trigger trg_orders_guard before update on public.orders
  for each row execute function public.orders_guard();

-- ---------- 4. place_order: the ONLY way a customer can create an order -----
-- Prices/totals/shipping are computed here from the products table; anything
-- price-like sent by the browser is ignored. Idempotent on p_idempotency_key.
create or replace function public.place_order(
  p_customer text, p_phone text, p_wilaya text, p_commune text,
  p_delivery text, p_note text, p_items jsonb, p_idempotency_key uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c_home_shipping   constant int := 700;
  c_office_shipping constant int := 600;
  v_customer text := btrim(coalesce(p_customer, ''));
  v_phone    text := regexp_replace(coalesce(p_phone, ''), '[[:space:]().-]', '', 'g');
  v_wilaya   text := btrim(coalesce(p_wilaya, ''));
  v_commune  text := btrim(coalesce(p_commune, ''));
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_existing public.orders;
  v_order    public.orders;
  v_line     jsonb;
  v_prod     public.products;
  v_pid      bigint;
  v_qty      int;
  v_size     text;
  v_lines    jsonb := '[]'::jsonb;
  v_subtotal int := 0;
  v_shipping int;
  v_recent   int;
begin
  if p_idempotency_key is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;

  -- Replay of an already-stored order => return it, never create a second one.
  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'status', v_existing.status,
      'subtotal', v_existing.subtotal, 'shipping', v_existing.shipping,
      'total', v_existing.total, 'replayed', true);
  end if;

  -- Validation (server-side, authoritative)
  if char_length(v_customer) < 2 or char_length(v_customer) > 80 then
    raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if v_phone like '+213%'  then v_phone := '0' || substr(v_phone, 5);
  elsif v_phone like '00213%' then v_phone := '0' || substr(v_phone, 6); end if;
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001'; end if;
  if char_length(v_wilaya)  < 2 or char_length(v_wilaya)  > 40 then
    raise exception 'invalid_wilaya' using errcode = 'P0001'; end if;
  if char_length(v_commune) < 2 or char_length(v_commune) > 60 then
    raise exception 'invalid_commune' using errcode = 'P0001'; end if;
  if p_delivery is null or p_delivery not in ('home', 'office') then
    raise exception 'invalid_delivery' using errcode = 'P0001'; end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = 'P0001'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'invalid_items' using errcode = 'P0001'; end if;

  -- Light abuse protection: max 5 orders / phone / hour.
  select count(*) into v_recent from public.orders
   where phone = v_phone and created_at > now() - interval '1 hour';
  if v_recent >= 5 then raise exception 'rate_limited' using errcode = 'P0001'; end if;

  -- Build the trusted line items from the database.
  for v_line in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_line) <> 'object'
       or coalesce(v_line->>'id',  '') !~ '^[0-9]{1,18}$'
       or coalesce(v_line->>'qty', '') !~ '^[0-9]{1,2}$' then
      raise exception 'invalid_items' using errcode = 'P0001';
    end if;
    v_pid := (v_line->>'id')::bigint;
    v_qty := (v_line->>'qty')::int;
    if v_qty < 1 or v_qty > 10 then raise exception 'invalid_items' using errcode = 'P0001'; end if;
    v_size := nullif(btrim(coalesce(v_line->>'size', '')), '');
    if v_size is not null and char_length(v_size) > 12 then
      raise exception 'invalid_items' using errcode = 'P0001'; end if;

    select * into v_prod from public.products where id = v_pid and active;
    if not found then raise exception 'product_unavailable' using errcode = 'P0001'; end if;
    if coalesce(v_prod.stock, 0) < 1 then raise exception 'out_of_stock' using errcode = 'P0001'; end if;
    if v_size is not null and coalesce(btrim(v_prod.sizes), '') <> ''
       and v_size <> all (array(select btrim(s) from unnest(string_to_array(v_prod.sizes, ',')) s)) then
      raise exception 'invalid_size' using errcode = 'P0001'; end if;

    v_subtotal := v_subtotal + v_prod.price * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_prod.id, 'name', v_prod.name, 'price', v_prod.price,
      'size', v_size, 'qty', v_qty, 'category', v_prod.category);
  end loop;

  -- Aggregate stock check (same product on several lines).
  if exists (
    select 1
      from (select (l->>'product_id')::bigint as pid, sum((l->>'qty')::int) as q
              from jsonb_array_elements(v_lines) l group by 1) t
      join public.products pr on pr.id = t.pid
     where coalesce(pr.stock, 0) < t.q
  ) then raise exception 'out_of_stock' using errcode = 'P0001'; end if;

  v_shipping := case p_delivery when 'home' then c_home_shipping else c_office_shipping end;

  begin
    insert into public.orders
      (customer, phone, wilaya, commune, delivery, note, items,
       subtotal, shipping, total, status, idempotency_key)
    values
      (v_customer, v_phone, v_wilaya, v_commune, p_delivery, v_note, v_lines,
       v_subtotal, v_shipping, v_subtotal + v_shipping, 'pending', p_idempotency_key)
    returning * into v_order;
  exception when unique_violation then   -- concurrent duplicate submit
    select * into v_order from public.orders where idempotency_key = p_idempotency_key;
    return jsonb_build_object('order_id', v_order.id, 'status', v_order.status,
      'subtotal', v_order.subtotal, 'shipping', v_order.shipping,
      'total', v_order.total, 'replayed', true);
  end;

  return jsonb_build_object('order_id', v_order.id, 'status', v_order.status,
    'subtotal', v_order.subtotal, 'shipping', v_order.shipping,
    'total', v_order.total, 'replayed', false);
end $$;
revoke all on function public.place_order(text,text,text,text,text,text,jsonb,uuid) from public;
grant execute on function public.place_order(text,text,text,text,text,text,jsonb,uuid) to anon, authenticated;

-- ---------- 5. Admin dashboard stats (real data, admin-only) ----------------
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'products_total',        (select count(*) from public.products),
    'products_active',       (select count(*) from public.products where active),
    'products_out_of_stock', (select count(*) from public.products where active and coalesce(stock,0) <= 0),
    'orders_total',          (select count(*) from public.orders),
    'orders_last_24h',       (select count(*) from public.orders where created_at > now() - interval '24 hours'),
    'orders_by_status',      (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
                                from (select status, count(*) c from public.orders group by status) s),
    'revenue_products',      (select coalesce(sum(coalesce(subtotal,
                                total - case delivery when 'home' then 700 else 600 end)), 0)
                                from public.orders where status in ('confirmed','shipped','delivered'))
  );
end $$;
revoke all on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- ---------- 6. Row Level Security: replace every open policy ----------------
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename in ('products','categories','orders','settings','order_events')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.products   enable row level security;
alter table public.categories enable row level security;
alter table public.orders     enable row level security;
alter table public.settings   enable row level security;  -- no policies => no API access

create policy products_public_read on public.products
  for select to anon, authenticated using (active);
create policy products_admin_all on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy categories_public_read on public.categories
  for select to anon, authenticated using (active);
create policy categories_admin_all on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Orders: customers have NO direct access (they use place_order()).
create policy orders_admin_select on public.orders
  for select to authenticated using (public.is_admin());
create policy orders_admin_update on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- History protection: only cancelled orders may be deleted.
create policy orders_admin_delete on public.orders
  for delete to authenticated using (public.is_admin() and status = 'cancelled');

create policy order_events_admin_select on public.order_events
  for select to authenticated using (public.is_admin());

-- ---------- 7. Grants: least privilege (defense in depth beside RLS) --------
revoke all on public.orders, public.order_events, public.settings, public.admin_users
  from anon, authenticated;
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

revoke insert, update, delete on public.products, public.categories from anon;
grant select on public.products, public.categories to anon;
grant select, insert, update, delete on public.products, public.categories to authenticated;
grant select, update, delete on public.orders to authenticated;
grant select on public.order_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Reminder: run supabase/migrations/20261018_002_remove_plaintext_admin_password.sql
-- once the new admin login is working.

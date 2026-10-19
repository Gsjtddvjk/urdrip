-- ============================================================================
-- EMERGENCY ROLLBACK of migration 001.  *** RE-OPENS THE SECURITY HOLES ***
-- Only use if the storefront is down and you cannot fix forward. Customer data
-- becomes publicly readable/writable again. Keeps all data and new columns.
-- ============================================================================
drop trigger  if exists trg_orders_guard on public.orders;
drop function if exists public.orders_guard();
do $$ declare r record; begin
  for r in select tablename, policyname from pg_policies
           where schemaname='public' and tablename in ('products','categories','orders','settings','order_events')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop; end $$;
create policy rb_cat  on public.categories for all using (true) with check (true);
create policy rb_prod on public.products   for all using (true) with check (true);
create policy rb_ord  on public.orders     for all using (true) with check (true);
grant all on public.products, public.categories, public.orders to anon, authenticated;
-- Functions/tables added by 001 (place_order, admin_dashboard_stats, is_admin,
-- order_events, admin_users) are left in place; they are harmless.

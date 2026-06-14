-- ============================================================================
-- Servd — Row-Level Security (RLS)
--
-- This is the SECOND, authoritative layer of tenant isolation. Even if the
-- application forgets a `where restaurantId = …` filter, Postgres physically
-- refuses to return another restaurant's rows.
--
-- HOW IT WORKS
--   The app opens a transaction and runs:
--       SET LOCAL app.current_restaurant_id = '<the logged-in user restaurant>';
--   System tasks (webhooks, super-admin, seeding) instead run:
--       SET LOCAL app.is_super_admin = 'on';
--   Policies below read those settings via the helper functions.
--
--   We use FORCE ROW LEVEL SECURITY so that even the table owner (the role
--   Prisma connects as) is subject to the policies — without FORCE, the owner
--   would silently bypass RLS and the isolation guarantee would be a lie.
--
-- APPLY WITH:  npm run db:rls   (after `prisma migrate`/`db push`)
-- ============================================================================

create schema if not exists app;

-- The restaurant the current request is scoped to (NULL if unset).
create or replace function app.current_restaurant_id() returns uuid
  language sql stable as $$
    select nullif(current_setting('app.current_restaurant_id', true), '')::uuid
$$;

-- Whether the current request is a trusted platform/super-admin context.
create or replace function app.is_super_admin() returns boolean
  language sql stable as $$
    select coalesce(current_setting('app.is_super_admin', true) = 'on', false)
$$;

-- ----------------------------------------------------------------------------
-- Helper: enable + FORCE rls and add a tenant policy for tables that have a
-- direct `restaurantId` ("restaurant_id") column.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables text[] := array[
    'staff_users', 'subscriptions', 'tables', 'categories', 'menu_items',
    'modifier_groups', 'orders', 'feedback', 'customer_contacts',
    'sms_campaigns', 'sms_credit_ledger', 'print_jobs'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format('drop policy if exists tenant_isolation on %I;', t);
    execute format($f$
      create policy tenant_isolation on %I
      using (app.is_super_admin() or restaurant_id = app.current_restaurant_id())
      with check (app.is_super_admin() or restaurant_id = app.current_restaurant_id());
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- restaurants: a staff user sees only their own restaurant row.
-- ----------------------------------------------------------------------------
alter table restaurants enable row level security;
alter table restaurants force row level security;
drop policy if exists tenant_isolation on restaurants;
create policy tenant_isolation on restaurants
  using (app.is_super_admin() or id = app.current_restaurant_id())
  with check (app.is_super_admin() or id = app.current_restaurant_id());

-- ----------------------------------------------------------------------------
-- Child tables WITHOUT a direct restaurant_id — isolate via their parent.
-- ----------------------------------------------------------------------------

-- modifiers -> modifier_groups
alter table modifiers enable row level security;
alter table modifiers force row level security;
drop policy if exists tenant_isolation on modifiers;
create policy tenant_isolation on modifiers
  using (app.is_super_admin() or exists (
    select 1 from modifier_groups g
    where g.id = modifiers.modifier_group_id
      and g.restaurant_id = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from modifier_groups g
    where g.id = modifiers.modifier_group_id
      and g.restaurant_id = app.current_restaurant_id()));

-- menu_item_modifier_groups -> menu_items
alter table menu_item_modifier_groups enable row level security;
alter table menu_item_modifier_groups force row level security;
drop policy if exists tenant_isolation on menu_item_modifier_groups;
create policy tenant_isolation on menu_item_modifier_groups
  using (app.is_super_admin() or exists (
    select 1 from menu_items m
    where m.id = menu_item_modifier_groups.menu_item_id
      and m.restaurant_id = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from menu_items m
    where m.id = menu_item_modifier_groups.menu_item_id
      and m.restaurant_id = app.current_restaurant_id()));

-- order_items -> orders
alter table order_items enable row level security;
alter table order_items force row level security;
drop policy if exists tenant_isolation on order_items;
create policy tenant_isolation on order_items
  using (app.is_super_admin() or exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and o.restaurant_id = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and o.restaurant_id = app.current_restaurant_id()));

-- order_item_modifiers -> order_items -> orders
alter table order_item_modifiers enable row level security;
alter table order_item_modifiers force row level security;
drop policy if exists tenant_isolation on order_item_modifiers;
create policy tenant_isolation on order_item_modifiers
  using (app.is_super_admin() or exists (
    select 1 from order_items oi
    join orders o on o.id = oi.order_id
    where oi.id = order_item_modifiers.order_item_id
      and o.restaurant_id = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from order_items oi
    join orders o on o.id = oi.order_id
    where oi.id = order_item_modifiers.order_item_id
      and o.restaurant_id = app.current_restaurant_id()));

-- payments -> orders
alter table payments enable row level security;
alter table payments force row level security;
drop policy if exists tenant_isolation on payments;
create policy tenant_isolation on payments
  using (app.is_super_admin() or exists (
    select 1 from orders o
    where o.id = payments.order_id
      and o.restaurant_id = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from orders o
    where o.id = payments.order_id
      and o.restaurant_id = app.current_restaurant_id()));

-- sms_messages -> sms_campaigns
alter table sms_messages enable row level security;
alter table sms_messages force row level security;
drop policy if exists tenant_isolation on sms_messages;
create policy tenant_isolation on sms_messages
  using (app.is_super_admin() or exists (
    select 1 from sms_campaigns c
    where c.id = sms_messages.campaign_id
      and c.restaurant_id = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from sms_campaigns c
    where c.id = sms_messages.campaign_id
      and c.restaurant_id = app.current_restaurant_id()));

-- ----------------------------------------------------------------------------
-- Platform-level tables.
--   plans: global reference data — readable by everyone, writable by super-admin.
--   platform_admins: super-admin only.
-- ----------------------------------------------------------------------------
alter table plans enable row level security;
alter table plans force row level security;
drop policy if exists plans_read on plans;
drop policy if exists plans_write on plans;
create policy plans_read on plans for select using (true);
create policy plans_write on plans for all
  using (app.is_super_admin()) with check (app.is_super_admin());

alter table platform_admins enable row level security;
alter table platform_admins force row level security;
drop policy if exists super_only on platform_admins;
create policy super_only on platform_admins for all
  using (app.is_super_admin()) with check (app.is_super_admin());

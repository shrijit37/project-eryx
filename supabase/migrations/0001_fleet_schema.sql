-- Project Eryx fleet schema (Supabase / PostgREST).
--
-- The fleet DB already hosts shared tables (`users`, `organizations`,
-- `boards`, ...), so every Eryx table is namespaced with an `eryx_` prefix to
-- avoid collisions. All statements are idempotent: safe to re-run.
--
-- Apply with the fleet project's SQL editor or `supabase db push`. The
-- service-role key cannot execute DDL over REST.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- identity + trading tables
-- ---------------------------------------------------------------------------

create table if not exists public.eryx_users (
  id            text primary key default gen_random_uuid()::text,
  auth_id       text unique,
  email         text not null unique,
  username      text not null unique,
  password_hash text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists public.eryx_agents (
  id           text primary key default gen_random_uuid()::text,
  user_id      text not null,
  name         text not null,
  api_key_hash text unique,
  is_active    boolean not null default true,
  description  text not null default '',
  model        text not null default '',
  strategy     text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.eryx_accounts (
  id            text primary key default gen_random_uuid()::text,
  user_id       text unique,
  agent_id      text,
  account_type  text not null,
  cash_balance  double precision not null default 0,
  blocked_cash  double precision not null default 0,
  is_arena      boolean not null default false,
  currency      text not null,
  status        text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.eryx_stocks (
  id                text primary key default gen_random_uuid()::text,
  symbol            text not null unique,
  company_name      text,
  exchange          text,
  current_price     double precision not null,
  previous_close    double precision not null,
  listing_date      timestamptz not null default now(),
  is_active         boolean not null default true,
  last_price_update timestamptz not null default now()
);

create table if not exists public.eryx_holdings (
  id                text primary key default gen_random_uuid()::text,
  account_id        text not null,
  stock_id          text not null,
  quantity          double precision not null,
  average_buy_price double precision not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint eryx_holdings_account_stock_key unique (account_id, stock_id)
);

create table if not exists public.eryx_orders (
  id                 text primary key default gen_random_uuid()::text,
  account_id         text not null,
  stock_id           text not null,
  side               text not null,
  type               text not null,
  quantity           double precision not null,
  remaining_quantity double precision not null,
  limit_price        double precision,
  executed_price     double precision,
  status             text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.eryx_trades (
  id              text primary key default gen_random_uuid()::text,
  account_id      text,
  stock_id        text not null,
  buy_order_id    text,
  sell_order_id   text,
  quantity        double precision not null,
  execution_price double precision not null,
  executed_at     timestamptz not null default now()
);

create table if not exists public.eryx_cash_ledger (
  id            text primary key default gen_random_uuid()::text,
  account_id    text not null,
  type          text not null,
  amount        double precision not null,
  balance_after double precision not null,
  reference_id  text not null,
  description   text not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.eryx_price_history (
  id        text primary key default gen_random_uuid()::text,
  stock_id  text not null,
  open      double precision not null,
  high      double precision not null,
  low       double precision not null,
  close     double precision not null,
  volume    bigint not null,
  timestamp timestamptz not null default now(),
  timeframe text not null
);

-- ---------------------------------------------------------------------------
-- indexes for the hot query paths
-- ---------------------------------------------------------------------------

create index if not exists eryx_price_history_stock_ts_idx on public.eryx_price_history (stock_id, timestamp);
create index if not exists eryx_holdings_account_idx on public.eryx_holdings (account_id);
create index if not exists eryx_orders_account_idx on public.eryx_orders (account_id);
create index if not exists eryx_orders_status_idx on public.eryx_orders (status);
create index if not exists eryx_ledger_account_idx on public.eryx_cash_ledger (account_id);
create index if not exists eryx_trades_account_idx on public.eryx_trades (account_id);

-- ---------------------------------------------------------------------------
-- permissive RLS (single-tenant internal fleet) + grants
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'eryx_users', 'eryx_agents', 'eryx_accounts', 'eryx_stocks',
    'eryx_holdings', 'eryx_orders', 'eryx_trades',
    'eryx_cash_ledger', 'eryx_price_history'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'eryx_all_' || t, t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated, service_role using (true) with check (true)',
      'eryx_all_' || t, t
    );
    execute format('grant all on public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

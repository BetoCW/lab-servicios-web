-- =====================================================================
-- Quant Core Engine & Market Data (F0) — esquema en Supabase
-- Proyecto: quant-core-engine-f0 (us-east-1)
--
-- Cada tabla es el espejo local de un recurso de Alpaca (Paper Trading):
--   watchlists      <-> /v2/watchlists
--   orders          <-> /v2/orders
--   option_chains   <-> /v2/options/contracts + /v1beta1/options/snapshots
--   strategies      <-> órdenes multi-leg (order_class = 'mleg')
--
-- RLS activado sin políticas: solo el backend (llave secreta) puede leer/escribir.
-- Es idempotente: se puede correr varias veces.
-- =====================================================================

create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- 1. watchlists
create table if not exists public.watchlists (
  id          uuid primary key default gen_random_uuid(),
  alpaca_id   uuid unique,
  name        text not null,
  symbols     text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- 2. orders
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  alpaca_id        uuid unique not null,
  client_order_id  text,
  symbol           text,
  asset_class      text,
  order_class      text,
  side             text,
  type             text,
  time_in_force    text,
  qty              numeric,
  filled_qty       numeric,
  limit_price      numeric,
  stop_price       numeric,
  filled_avg_price numeric,
  status           text,
  legs             jsonb,
  raw              jsonb,
  submitted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists orders_symbol_idx on public.orders (symbol);
create index if not exists orders_status_idx on public.orders (status);

-- ---------------------------------------------------------------- 3. option_chains + option_quotes
create table if not exists public.option_chains (
  id                uuid primary key default gen_random_uuid(),
  underlying        text not null,
  expiration_from   date,
  expiration_to     date,
  option_type       text check (option_type in ('call', 'put')),
  strike_min        numeric,
  strike_max        numeric,
  underlying_price  numeric,
  contracts_count   integer not null default 0,
  last_refreshed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists option_chains_underlying_idx on public.option_chains (underlying);

create table if not exists public.option_quotes (
  id                 bigint generated always as identity primary key,
  chain_id           uuid not null references public.option_chains (id) on delete cascade,
  symbol             text not null,
  option_type        text not null check (option_type in ('call', 'put')),
  strike             numeric not null,
  expiration         date not null,
  open_interest      numeric,
  bid                numeric,
  ask                numeric,
  last               numeric,
  implied_volatility numeric,
  delta              numeric,
  gamma              numeric,
  theta              numeric,
  vega               numeric,
  rho                numeric,
  quote_time         timestamptz,
  unique (chain_id, symbol)
);
create index if not exists option_quotes_chain_idx on public.option_quotes (chain_id, expiration, strike);

-- ---------------------------------------------------------------- 4. strategies + strategy_legs
create table if not exists public.strategies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  underlying       text not null,
  description      text,
  qty              integer not null default 1 check (qty > 0),
  order_type       text not null default 'market' check (order_type in ('market', 'limit')),
  limit_price      numeric,
  status           text not null default 'draft' check (status in ('draft', 'submitted', 'canceled')),
  alpaca_order_id  uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.strategy_legs (
  id              uuid primary key default gen_random_uuid(),
  strategy_id     uuid not null references public.strategies (id) on delete cascade,
  symbol          text not null,  -- símbolo OCC, p. ej. AAPL251219C00200000
  side            text not null check (side in ('buy', 'sell')),
  ratio_qty       integer not null default 1 check (ratio_qty > 0),
  position_intent text check (position_intent in ('buy_to_open', 'buy_to_close', 'sell_to_open', 'sell_to_close')),
  created_at      timestamptz not null default now()
);
create index if not exists strategy_legs_strategy_idx on public.strategy_legs (strategy_id);

-- ---------------------------------------------------------------- triggers y RLS
do $$
declare t text;
begin
  foreach t in array array['watchlists', 'orders', 'option_chains', 'strategies'] loop
    execute format('drop trigger if exists %1$s_updated_at on public.%1$s', t);
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['watchlists', 'orders', 'option_chains', 'option_quotes', 'strategies', 'strategy_legs'] loop
    execute format('alter table public.%s enable row level security', t);
  end loop;
end $$;

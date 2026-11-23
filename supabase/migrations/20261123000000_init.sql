-- Personal finance app schema. Single user, but every table is owned via RLS.

-- Only one account may ever sign up.
create function public.enforce_single_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Registration is closed';
  end if;
  return new;
end $$;

create trigger enforce_single_user before insert on auth.users
for each row execute function public.enforce_single_user();

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null default 'checking' check (kind in ('checking','savings','cash','other')),
  opening_balance numeric(14,2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null default 'expense' check (kind in ('expense','income','investment')),
  unique (user_id, name)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source text not null,
  file_name text,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  account_id uuid not null references public.accounts on delete cascade,
  date date not null,
  amount numeric(14,2) not null,            -- HUF, negative = outflow
  description text not null default '',
  counterparty text not null default '',    -- normalized, used for category learning
  category_id uuid references public.categories on delete set null,
  tags text[] not null default '{}',
  note text,
  is_transfer boolean not null default false,
  transfer_peer_id uuid references public.transactions on delete set null,
  orig_amount numeric(14,2),
  orig_currency text,
  import_hash text,
  import_batch_id uuid references public.import_batches on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, import_hash)
);
create index on public.transactions (user_id, date);
create index on public.transactions (account_id);
create index on public.transactions (category_id);
create index on public.transactions (transfer_peer_id);
create index on public.transactions (import_batch_id);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category_id uuid not null references public.categories on delete cascade,
  month date,                                -- null = default for every month
  amount numeric(14,2) not null check (amount >= 0),
  unique nulls not distinct (user_id, category_id, month)
);
create index on public.budgets (category_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  account_id uuid not null references public.accounts on delete cascade,
  deadline date
);
create index on public.goals (account_id);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  type text not null check (type in ('stock_etf','bond','crypto','other')),
  source text not null default 'manual' check (source in ('manual','lightyear')),
  created_at timestamptz not null default now()
);

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  asset_id uuid not null references public.assets on delete cascade,
  date date not null,
  value numeric(14,2) not null,              -- HUF
  invested numeric(14,2),                    -- HUF, optional
  unique (asset_id, date)
);

create table public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  asset_id uuid not null references public.assets on delete cascade,
  reference text not null,
  executed_at timestamptz not null,
  ticker text,
  isin text,
  type text not null,
  quantity numeric(24,9),
  currency text not null,
  price numeric(24,9),
  gross_amount numeric(18,2),
  fx_rate numeric(18,9),
  fee numeric(18,2),
  net_amount numeric(18,2),
  unique (asset_id, reference, currency)
);

create table public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  config jsonb not null,
  unique (user_id, name)
);

-- RLS: every row belongs to its user.
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','import_batches','transactions','budgets','goals',
                           'assets','asset_valuations','investment_transactions','import_mappings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_all on public.%I for all to authenticated
                    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Default categories for the (single) user.
create function public.seed_user_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.categories (user_id, name, kind)
  select new.id, c.name, c.kind from (values
    ('Fizetés','income'), ('Ösztöndíj','income'), ('Egyéb bevétel','income'),
    ('Élelmiszer','expense'), ('Étterem, kávé','expense'), ('Lakhatás','expense'),
    ('Közlekedés','expense'), ('Szórakozás','expense'), ('Ruházat','expense'),
    ('Egészség','expense'), ('Előfizetések','expense'), ('Sport','expense'),
    ('Ajándék','expense'), ('Egyéb kiadás','expense'),
    ('Befektetés','investment')
  ) as c(name, kind);
  return new;
end $$;

create trigger seed_user_defaults after insert on auth.users
for each row execute function public.seed_user_defaults();

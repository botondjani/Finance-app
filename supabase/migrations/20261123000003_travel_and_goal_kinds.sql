-- New default category "Utazás" (travel) for existing and future users.
insert into public.categories (user_id, name, kind)
select id, 'Utazás', 'expense' from auth.users
on conflict (user_id, name) do nothing;

create or replace function public.seed_user_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.categories (user_id, name, kind)
  select new.id, c.name, c.kind from (values
    ('Fizetés','income'), ('Ösztöndíj','income'), ('Egyéb bevétel','income'),
    ('Élelmiszer','expense'), ('Étterem, kávé','expense'), ('Lakhatás','expense'),
    ('Közlekedés','expense'), ('Utazás','expense'), ('Szórakozás','expense'), ('Ruházat','expense'),
    ('Egészség','expense'), ('Előfizetések','expense'), ('Sport','expense'),
    ('Ajándék','expense'), ('Egyéb kiadás','expense'),
    ('Befektetés','investment')
  ) as c(name, kind);
  return new;
end $$;
revoke execute on function public.seed_user_defaults() from public, anon, authenticated;

-- Goals: savings goal = an account's balance; investment goal = one asset's value
-- or (asset_id null) the whole portfolio.
alter table public.goals add column kind text not null default 'savings' check (kind in ('savings','investment'));
alter table public.goals alter column account_id drop not null;
alter table public.goals add column asset_id uuid references public.assets on delete cascade;
alter table public.goals add constraint goal_target check (
  (kind = 'savings' and account_id is not null and asset_id is null) or
  (kind = 'investment' and account_id is null)
);
create index on public.goals (asset_id);

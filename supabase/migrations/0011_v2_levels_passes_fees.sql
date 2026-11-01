-- v2: KS3 levels, group passes, late-fee percentage, KS3 prices.
-- Money is integer pence. Existing bookings keep their stored price.

-- ---------------------------------------------------------------------------
-- Children: Years 7-11, a level, and exam board/tier only for GCSE.
-- ---------------------------------------------------------------------------
alter table public.children drop constraint children_school_year_check;
alter table public.children
  add constraint children_school_year_check check (school_year between 7 and 11);

alter table public.children
  add column level text not null default 'GCSE'
  constraint children_level_check check (level in ('KS3', 'GCSE'));

alter table public.children alter column exam_board drop not null;
alter table public.children alter column tier drop not null;

-- KS3 only up to Year 9; GCSE from Year 9 (Year 9 is the parent's choice).
alter table public.children
  add constraint children_level_year_check check (
    (level = 'KS3' and school_year <= 9) or (level = 'GCSE' and school_year >= 9)
  ),
  add constraint children_gcse_requires_board_tier check (
    level <> 'GCSE' or (exam_board is not null and tier is not null)
  );

-- ---------------------------------------------------------------------------
-- Groups: a level on each series and session.
-- ---------------------------------------------------------------------------
alter table public.group_series
  add column level text not null default 'GCSE' constraint group_series_level_check check (level in ('KS3', 'GCSE'));
alter table public.group_sessions
  add column level text not null default 'GCSE' constraint group_sessions_level_check check (level in ('KS3', 'GCSE'));

-- Saturday becomes the KS3 group; future sessions follow (past ones keep their record).
update public.group_series
   set title = 'Saturday KS3 Science Group', level = 'KS3', year_group = 'Years 7–9', price_pence = 1400
 where product = 'saturday';
update public.group_sessions
   set title = 'Saturday KS3 Science Group', level = 'KS3', price_pence = 1400
 where series_id in (select id from public.group_series where product = 'saturday')
   and starts_at > now();

-- Generated sessions copy the series level.
create or replace function public.ensure_group_sessions(p_until date)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_created int;
begin
  with candidates as (
    select s.id as series_id, s.title, s.capacity, s.price_pence, s.venue, s.is_online, s.level,
           d.day,
           ((d.day + s.start_time)::timestamp at time zone 'Europe/London') as starts_at
      from public.group_series s
     cross join lateral (
       select s.starts_on + i as day
         from generate_series(0, p_until - s.starts_on) as i
     ) d
     where s.active
       and extract(dow from d.day) = s.weekday
  ),
  inserted as (
    insert into public.group_sessions
      (series_id, title, starts_at, ends_at, capacity, price_pence, venue, is_online, level, status)
    select c.series_id, c.title, c.starts_at, c.starts_at + interval '60 minutes',
           c.capacity, c.price_pence, c.venue, c.is_online, c.level, 'scheduled'
      from candidates c
     where not exists (
       select 1 from public.blocked_times b
        where b.starts_at <= (c.day::timestamp at time zone 'Europe/London')
          and b.ends_at >= ((c.day + 1)::timestamp at time zone 'Europe/London'))
    on conflict (series_id, starts_at) do nothing
    returning 1
  )
  select count(*)::int into v_created from inserted;

  return v_created;
end;
$$;
revoke execute on function public.ensure_group_sessions(date) from public, anon, authenticated;
grant execute on function public.ensure_group_sessions(date) to service_role;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
alter table public.settings
  add column price_ks3_assessment_pence int not null default 750 check (price_ks3_assessment_pence >= 0),
  add column price_ks3_one_to_one_pence int not null default 2000 check (price_ks3_one_to_one_pence >= 0),
  add column price_ks3_group_pence int not null default 1400 check (price_ks3_group_pence >= 0),
  add column late_fee_percent int not null default 50 check (late_fee_percent between 0 and 100),
  -- {"KS3": {"6": pence, "10": pence}, "GCSE": {"6": pence, "10": pence}}
  add column pass_prices jsonb not null
    default '{"KS3": {"6": 7900, "10": 12600}, "GCSE": {"6": 10200, "10": 16200}}'::jsonb,
  add column pass_validity_months int not null default 6 check (pass_validity_months between 1 and 24),
  add column pass_min_notice_days int not null default 7 check (pass_min_notice_days between 0 and 30);

update public.settings set owner_name = 'Abdullah Chopdat' where id = 1;

-- ---------------------------------------------------------------------------
-- Passes
-- ---------------------------------------------------------------------------
create table public.passes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid references public.profiles (id) on delete set null,
  child_id uuid references public.children (id) on delete set null,
  level text not null check (level in ('KS3', 'GCSE')),
  sessions_total int not null check (sessions_total in (6, 10)),
  price_pence int not null check (price_pence >= 0),
  payment_reference text not null unique default ('SLC-' || nextval('public.payment_ref_seq')),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'active', 'expired', 'cancelled')),
  paid_at timestamptz,
  expires_at timestamptz
);
create index passes_parent_id_idx on public.passes (parent_id);
create index passes_child_id_idx on public.passes (child_id);

alter table public.passes enable row level security;
revoke all on public.passes from anon;
revoke truncate, references, trigger on public.passes from authenticated;
grant select, insert, update, delete on public.passes to authenticated;
create policy admin_all on public.passes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Read only: passes are written by the service role.
create policy parent_select_own on public.passes
  for select to authenticated using (parent_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Bookings and ledger link to passes; a booking may carry its own late fee.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column pass_id uuid references public.passes (id),
  -- Late fee owed for late_cancelled/no_show; null = use the legacy rule.
  add column fee_pence int check (fee_pence is null or fee_pence >= 0);
create index bookings_pass_id_idx on public.bookings (pass_id);

alter table public.ledger add column pass_id uuid references public.passes (id) on delete set null;
create index ledger_pass_id_idx on public.ledger (pass_id);

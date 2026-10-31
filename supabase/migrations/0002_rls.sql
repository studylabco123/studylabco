-- Study Lab Co: Row Level Security (Task 4).
--
-- Callers:
--   anon           signed-out visitors (public reference data only)
--   authenticated  parents (own rows only) and the admin (is_admin(): role
--                  'admin' AND an aal2 session, i.e. TOTP verified)
--   service_role   server actions and cron; bypasses RLS
-- Every table in public has RLS enabled. A table with no policy for a caller
-- is unreadable and unwritable for that caller.

-- ---------------------------------------------------------------------------
-- Admin check
-- ---------------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
     );
$$;
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants. Supabase grants ALL on public tables to anon and authenticated by
-- default. TRUNCATE ignores RLS, so take it (and REFERENCES/TRIGGER) away.
-- anon never writes and only reads the public reference tables.
-- authenticated keeps DML grants because the admin works through it; the
-- policies below decide what each authenticated user can touch.
-- ---------------------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
revoke select on all tables in schema public from anon;
grant select on
  public.settings, public.group_sessions, public.group_series, public.term_periods,
  public.availability_rules, public.blocked_times, public.blocked_rules
  to anon;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.children           enable row level security;
alter table public.agreements         enable row level security;
alter table public.consents           enable row level security;
alter table public.student_status     enable row level security;
alter table public.tutor_notes        enable row level security;
alter table public.settings           enable row level security;
alter table public.settings_private   enable row level security;
alter table public.availability_rules enable row level security;
alter table public.term_periods       enable row level security;
alter table public.blocked_times      enable row level security;
alter table public.blocked_rules      enable row level security;
alter table public.group_series       enable row level security;
alter table public.group_sessions     enable row level security;
alter table public.block_bookings     enable row level security;
alter table public.bookings           enable row level security;
alter table public.ledger             enable row level security;
alter table public.expenses           enable row level security;
alter table public.mileage            enable row level security;
alter table public.email_log          enable row level security;

-- ---------------------------------------------------------------------------
-- Admin: everything, on every table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'children', 'agreements', 'consents', 'student_status', 'tutor_notes',
    'settings', 'settings_private', 'availability_rules', 'term_periods',
    'blocked_times', 'blocked_rules', 'group_series', 'group_sessions',
    'block_bookings', 'bookings', 'ledger', 'expenses', 'mileage', 'email_log'
  ] loop
    execute format(
      'create policy admin_all on public.%I for all to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))',
      t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Parents: own rows
-- ---------------------------------------------------------------------------
create policy parent_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy parent_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy parent_all_own on public.children
  for all to authenticated
  using (parent_id = (select auth.uid())) with check (parent_id = (select auth.uid()));

create policy parent_select_own on public.agreements
  for select to authenticated using (
    exists (select 1 from public.children c
             where c.id = agreements.child_id and c.parent_id = (select auth.uid())));
create policy parent_insert_own on public.agreements
  for insert to authenticated with check (
    exists (select 1 from public.children c
             where c.id = agreements.child_id and c.parent_id = (select auth.uid())));

create policy parent_select_own on public.consents
  for select to authenticated using (profile_id = (select auth.uid()));
create policy parent_insert_own on public.consents
  for insert to authenticated with check (profile_id = (select auth.uid()));

create policy parent_select_own on public.student_status
  for select to authenticated using (
    exists (select 1 from public.children c
             where c.id = student_status.child_id and c.parent_id = (select auth.uid())));

-- Read only: bookings and money are written by the service role.
create policy parent_select_own on public.bookings
  for select to authenticated using (parent_id = (select auth.uid()));
create policy parent_select_own on public.block_bookings
  for select to authenticated using (parent_id = (select auth.uid()));
create policy parent_select_own on public.ledger
  for select to authenticated using (parent_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Everyone (anon and signed in): public reference data, read only
-- ---------------------------------------------------------------------------
create policy public_read on public.settings
  for select to anon, authenticated using (true);
create policy public_read on public.group_series
  for select to anon, authenticated using (true);
create policy public_read on public.term_periods
  for select to anon, authenticated using (true);
create policy public_read on public.availability_rules
  for select to anon, authenticated using (true);
create policy public_read on public.group_sessions
  for select to anon, authenticated using (status = 'scheduled' and starts_at > now());
-- Parents also see sessions they hold a booking for (past or cancelled),
-- so booking history can show the session.
create policy parent_select_booked on public.group_sessions
  for select to authenticated using (
    exists (select 1 from public.bookings b
             where b.group_session_id = group_sessions.id and b.parent_id = (select auth.uid())));
-- Blocks are needed to show free slots; only the admin writes them.
create policy public_read on public.blocked_times
  for select to anon, authenticated using (true);
create policy public_read on public.blocked_rules
  for select to anon, authenticated using (true);

-- settings_private, tutor_notes, expenses, mileage, email_log: admin only
-- (no policy besides admin_all).

-- ---------------------------------------------------------------------------
-- Parents may edit their name, phone and marketing choice, but not their
-- role, block status, email or id. Applies to anon/authenticated callers
-- unless they are the admin; service_role and definer functions are exempt.
-- ---------------------------------------------------------------------------
create function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and not public.is_admin()
     and (new.id, new.role, new.is_blocked, new.blocked_reason, new.email)
         is distinct from (old.id, old.role, old.is_blocked, old.blocked_reason, old.email)
  then
    raise exception 'protected_profile_field' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_profile_fields() from public, anon, authenticated;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

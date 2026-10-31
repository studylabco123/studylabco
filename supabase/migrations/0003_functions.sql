-- Study Lab Co: database functions (Task 4).
-- Group seats are only taken through reserve_group_seat, which serialises on
-- the session row so two parents can never both get the last seat.
-- Errors the app matches on use SQLSTATE P0001 with these exact messages:
--   'session_full', 'session_cancelled', 'session_not_found'.

-- ---------------------------------------------------------------------------
-- New auth user -> profile row
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- role/is_blocked take their defaults: metadata is user-controlled.
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Seats
-- ---------------------------------------------------------------------------
-- Seats left in a group session (pending, confirmed and attended seats count).
-- SECURITY DEFINER so anon can see the number without seeing bookings.
-- Returns null for an unknown session.
create function public.seats_left(p_session uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
           gs.capacity - (
             select count(*)::int from public.bookings b
              where b.group_session_id = gs.id
                and b.status in ('pending', 'confirmed', 'attended')),
           0)
    from public.group_sessions gs
   where gs.id = p_session;
$$;
revoke execute on function public.seats_left(uuid) from public;
grant execute on function public.seats_left(uuid) to anon, authenticated, service_role;

-- Takes one seat and returns the new confirmed group booking's id.
-- Locks the session row FOR UPDATE, so concurrent callers queue and each
-- counts seats after the previous one committed.
-- Called by server actions with the service role only.
create function public.reserve_group_seat(
  p_session uuid,
  p_parent uuid,
  p_child uuid,
  p_price int,
  p_bundle uuid default null,
  p_block uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_session public.group_sessions%rowtype;
  v_taken int;
  v_id uuid;
begin
  select * into v_session
    from public.group_sessions
   where id = p_session
     for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if v_session.status = 'cancelled' then
    raise exception 'session_cancelled' using errcode = 'P0001';
  end if;

  select count(*) into v_taken
    from public.bookings
   where group_session_id = p_session
     and status in ('pending', 'confirmed', 'attended');

  if v_taken >= v_session.capacity then
    raise exception 'session_full' using errcode = 'P0001';
  end if;

  insert into public.bookings (
    parent_id, child_id, kind, location, starts_at, ends_at, busy_until,
    group_session_id, block_booking_id, bundle_id, status, price_pence
  ) values (
    p_parent, p_child, 'group',
    case when v_session.is_online then 'online' else 'group_venue' end::public.location_kind,
    v_session.starts_at, v_session.ends_at, v_session.ends_at,
    p_session, p_block, p_bundle, 'confirmed', p_price
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke execute on function public.reserve_group_seat(uuid, uuid, uuid, int, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_group_seat(uuid, uuid, uuid, int, uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Group session generation
-- ---------------------------------------------------------------------------
-- Creates the missing sessions of every active series from its starts_on
-- through p_until (inclusive). Start = the series' London local date + time,
-- stored as UTC; each session lasts 60 minutes. Dates fully covered by a
-- blocked_times row (London midnight to midnight) are skipped. Idempotent via
-- unique (series_id, starts_at); existing rows, including cancelled ones,
-- are left alone. Returns the number of sessions created.
create function public.ensure_group_sessions(p_until date)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_created int;
begin
  with candidates as (
    select s.id as series_id, s.title, s.capacity, s.price_pence, s.venue, s.is_online,
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
      (series_id, title, starts_at, ends_at, capacity, price_pence, venue, is_online, status)
    select c.series_id, c.title, c.starts_at, c.starts_at + interval '60 minutes',
           c.capacity, c.price_pence, c.venue, c.is_online, 'scheduled'
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

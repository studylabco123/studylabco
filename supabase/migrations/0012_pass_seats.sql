-- v2 Task V5: group passes replace fixed-week blocks.
-- block_bookings stays in place (unused) so old rows and foreign keys keep working.

-- ---------------------------------------------------------------------------
-- Pass-level emails (purchase confirmation, payment reminder) are idempotent
-- per pass and template, like block-level emails (0005).
-- ---------------------------------------------------------------------------
alter table public.email_log add column pass_id uuid references public.passes (id) on delete set null;
create unique index email_log_pass_template_key
  on public.email_log (pass_id, template)
  where booking_id is null and pass_id is not null;

-- The cooling-off tick on a pass purchase is recorded against the pass.
alter table public.consents add column pass_id uuid references public.passes (id) on delete set null;

-- ---------------------------------------------------------------------------
-- reserve_group_seat takes an optional pass. With p_pass the pass row is
-- locked (after the session row, always in that order), so two requests on
-- one pass queue and can never take more sessions than it holds. The seat is
-- stored with pass_id and payment_status 'paid' (the pass paid for it).
-- Extra P0001 messages: 'pass_not_found', 'pass_not_usable', 'pass_used_up',
-- 'level_mismatch'. Expiry is checked by the caller (it knows "now").
-- ---------------------------------------------------------------------------
drop function public.reserve_group_seat(uuid, uuid, uuid, int, uuid, uuid);

create function public.reserve_group_seat(
  p_session uuid,
  p_parent uuid,
  p_child uuid,
  p_price int,
  p_bundle uuid default null,
  p_block uuid default null,
  p_pass uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_session public.group_sessions%rowtype;
  v_pass public.passes%rowtype;
  v_taken int;
  v_used int;
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

  if p_pass is not null then
    select * into v_pass
      from public.passes
     where id = p_pass
       for update;
    if not found or v_pass.parent_id is distinct from p_parent or v_pass.child_id is distinct from p_child then
      raise exception 'pass_not_found' using errcode = 'P0001';
    end if;
    if v_pass.status <> 'active' then
      raise exception 'pass_not_usable' using errcode = 'P0001';
    end if;
    if v_pass.level <> v_session.level then
      raise exception 'level_mismatch' using errcode = 'P0001';
    end if;
    select count(*) into v_used
      from public.bookings
     where pass_id = p_pass
       and status in ('pending', 'confirmed', 'attended');
    if v_used >= v_pass.sessions_total then
      raise exception 'pass_used_up' using errcode = 'P0001';
    end if;
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
    group_session_id, block_booking_id, bundle_id, pass_id, status, price_pence, payment_status
  ) values (
    p_parent, p_child, 'group',
    case when v_session.is_online then 'online' else 'group_venue' end::public.location_kind,
    v_session.starts_at, v_session.ends_at, v_session.ends_at,
    p_session, p_block, p_bundle, p_pass, 'confirmed', p_price,
    case when p_pass is null then 'unpaid' else 'paid' end::public.payment_status
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke execute on function public.reserve_group_seat(uuid, uuid, uuid, int, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_group_seat(uuid, uuid, uuid, int, uuid, uuid, uuid)
  to service_role;

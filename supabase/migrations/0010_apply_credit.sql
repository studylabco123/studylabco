-- Ruling R23 (I2): spends a family's credit atomically. Takes a per-parent
-- advisory lock so two concurrent applications cannot overspend the balance,
-- then writes one 'credit_applied' row if the balance covers p_amount.
-- Returns the balance before the application, or -1 when it does not cover it
-- (nothing is written then). Service role only (admin actions call it).
create function public.credit_balance(p_parent uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(case when kind = 'credit' then amount_pence
                           when kind = 'credit_applied' then -amount_pence
                           else 0 end), 0)::int
    from public.ledger
   where parent_id = p_parent and kind in ('credit', 'credit_applied');
$$;

create function public.apply_credit(
  p_parent uuid,
  p_amount int,
  p_booking uuid,
  p_block uuid,
  p_on date,
  p_note text
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_balance int;
begin
  if p_parent is null or p_amount is null or p_amount <= 0 then
    raise exception 'apply_credit: bad arguments' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credit:' || p_parent::text, 0));
  v_balance := public.credit_balance(p_parent);
  if v_balance < p_amount then
    return -1;
  end if;
  insert into public.ledger (booking_id, block_booking_id, parent_id, kind, amount_pence, occurred_on, note)
  values (p_booking, p_block, p_parent, 'credit_applied', p_amount, p_on, coalesce(p_note, ''));
  return v_balance;
end
$$;

revoke execute on function public.credit_balance(uuid) from public, anon, authenticated;
revoke execute on function public.apply_credit(uuid, int, uuid, uuid, date, text) from public, anon, authenticated;
grant execute on function public.credit_balance(uuid) to service_role;
grant execute on function public.apply_credit(uuid, int, uuid, uuid, date, text) to service_role;

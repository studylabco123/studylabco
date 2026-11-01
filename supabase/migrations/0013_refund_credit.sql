-- V6: refunds a family's credit to their card/bank. Under the same per-parent
-- advisory lock as apply_credit, so a refund and a spend (or two refunds)
-- cannot overspend the balance, it writes a 'refund' row and a 'credit_applied'
-- row together. Returns the balance before, or -1 when the balance does not
-- cover p_amount (nothing is written then). Service role only.
create function public.refund_credit(
  p_parent uuid,
  p_amount int,
  p_method public.payment_method,
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
    raise exception 'refund_credit: bad arguments' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credit:' || p_parent::text, 0));
  v_balance := public.credit_balance(p_parent);
  if v_balance < p_amount then
    return -1;
  end if;
  insert into public.ledger (parent_id, kind, method, amount_pence, occurred_on, note)
  values (p_parent, 'refund', p_method, p_amount, p_on, coalesce(p_note, ''));
  insert into public.ledger (parent_id, kind, amount_pence, occurred_on, note)
  values (p_parent, 'credit_applied', p_amount, p_on, coalesce(p_note, ''));
  return v_balance;
end
$$;

revoke execute on function public.refund_credit(uuid, int, public.payment_method, date, text) from public, anon, authenticated;
grant execute on function public.refund_credit(uuid, int, public.payment_method, date, text) to service_role;

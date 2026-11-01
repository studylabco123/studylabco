-- Ruling R14: block-level emails (no single booking) are idempotent too.
-- unique (booking_id, template) does not cover rows where booking_id is null.
create unique index email_log_block_template_key
  on public.email_log (block_booking_id, template)
  where booking_id is null and block_booking_id is not null;

-- Ruling R23 (I2): a family's credit can pay for a later booking.
-- 'credit' rows record credit issued (a paid booking cancelled for free);
-- 'credit_applied' rows record credit spent on another booking or block.
-- Balance per parent = sum(credit) - sum(credit_applied). Neither kind is
-- turnover: the money was counted as income when it was first paid.
alter type public.ledger_kind add value if not exists 'credit_applied';

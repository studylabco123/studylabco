-- Ruling R25 (review Minor 2): parents may read, add and edit their own
-- children, but not delete them. A delete cascades to the signed agreement,
-- student_status (approval) and the tutor's private notes; no UI path does it,
-- but the old `for all` policy allowed it through the Data API with the anon key.
-- Account deletion runs with the service role and is unaffected.
drop policy parent_all_own on public.children;

create policy parent_select_own on public.children
  for select to authenticated using (parent_id = (select auth.uid()));
create policy parent_insert_own on public.children
  for insert to authenticated with check (parent_id = (select auth.uid()));
create policy parent_update_own on public.children
  for update to authenticated
  using (parent_id = (select auth.uid())) with check (parent_id = (select auth.uid()));

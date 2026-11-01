-- Private bucket for expense receipts. Only the verified admin (is_admin(): role
-- 'admin' with a 2-step-verified session) can touch objects in it; anon and
-- parents get nothing. The app also serves receipts only through short-lived
-- signed URLs, never public ones.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, null)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create policy receipts_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (select public.is_admin()));
create policy receipts_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (select public.is_admin()));
create policy receipts_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (select public.is_admin()))
  with check (bucket_id = 'receipts' and (select public.is_admin()));
create policy receipts_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (select public.is_admin()));

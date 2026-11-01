-- v2 Task V7: test results with feedback and attachments, shown to parents once published.

create type public.result_kind as enum ('initial_assessment', 'end_of_topic', 'other');

create table public.test_results (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  kind public.result_kind not null,
  taken_on date not null,
  score int not null check (score >= 0),
  out_of int not null check (out_of > 0),
  grade text check (grade is null or char_length(grade) between 1 and 20),
  went_well text not null check (char_length(went_well) between 1 and 2000),
  to_improve text not null check (char_length(to_improve) between 1 and 2000),
  attachment_path text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_results_score_within check (score <= out_of)
);
create index test_results_child_idx on public.test_results (child_id, taken_on desc);
create unique index test_results_attachment_key on public.test_results (attachment_path) where attachment_path is not null;

alter table public.test_results enable row level security;
revoke all on public.test_results from anon;
revoke truncate, references, trigger on public.test_results from authenticated;

create policy admin_all on public.test_results for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Parents read their own child's results, only once published. No parent writes; anon gets nothing.
create policy parent_select_published on public.test_results for select to authenticated using (
  published_at is not null
  and exists (select 1 from public.children c
               where c.id = test_results.child_id and c.parent_id = (select auth.uid())));

-- "Results published" emails are idempotent per result and template.
alter table public.email_log add column result_id uuid references public.test_results (id) on delete set null;
create unique index email_log_result_template_key
  on public.email_log (result_id, template)
  where booking_id is null and result_id is not null;

-- Private bucket for result attachments: admin only, like receipts. Parents get a short-lived signed URL from the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('results', 'results', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

create policy results_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'results' and (select public.is_admin()));
create policy results_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'results' and (select public.is_admin()));
create policy results_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'results' and (select public.is_admin()))
  with check (bucket_id = 'results' and (select public.is_admin()));
create policy results_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'results' and (select public.is_admin()));

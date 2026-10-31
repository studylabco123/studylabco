-- Study Lab Co: core schema (Task 3).
-- Times are timestamptz (UTC); calendar decisions are made in Europe/London.
-- Money is integer pence. RLS and functions are added in 0002/0003.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('parent', 'admin');
create type public.location_kind as enum ('tutor_place', 'home_visit', 'online', 'group_venue');
create type public.booking_kind as enum ('assessment', 'one_to_one', 'group');
create type public.booking_status as enum
  ('pending', 'confirmed', 'declined', 'cancelled', 'late_cancelled', 'no_show', 'attended');
create type public.payment_status as enum ('unpaid', 'paid', 'waived', 'credited', 'refunded');
create type public.period_kind as enum ('term', 'holiday');
create type public.payment_method as enum ('bank_transfer', 'cash');
create type public.ledger_kind as enum ('payment', 'refund', 'credit', 'waiver');

-- Shared by bookings and block_bookings: SLC-1001, SLC-1002, ...
create sequence public.payment_ref_seq start 1001;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  full_name text not null default '',
  email text not null,
  phone text,
  role public.user_role not null default 'parent',
  is_blocked boolean not null default false,
  blocked_reason text,
  marketing_opt_in boolean not null default false
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  school_year int not null check (school_year in (10, 11)),
  exam_board text not null check (exam_board in ('AQA', 'Edexcel', 'OCR', 'WJEC/Eduqas')),
  tier text not null check (tier in ('Foundation', 'Higher')),
  subjects text[] not null check (
    cardinality(subjects) > 0
    and subjects <@ array['Biology', 'Chemistry', 'Physics', 'Combined Science']::text[]
  ),
  target_grade text
);
create index children_parent_id_idx on public.children (parent_id);

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  child_id uuid not null references public.children (id) on delete cascade,
  policy_version text not null,
  emergency_contact_name text not null,
  emergency_contact_phone text not null,
  medical_info text,
  sen_info text,
  consent_contact boolean not null,
  signed_name text not null,
  signed_at timestamptz not null default now()
);
create unique index agreements_child_id_key on public.agreements (child_id);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('age_guardian', 'terms', 'marketing', 'cooling_off')),
  policy_version text not null,
  granted boolean not null,
  booking_id uuid
);
create index consents_profile_id_idx on public.consents (profile_id);

create table public.student_status (
  child_id uuid primary key references public.children (id) on delete cascade,
  created_at timestamptz not null default now(),
  assessment_completed_at timestamptz,
  approved_at timestamptz
);

create table public.tutor_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  child_id uuid not null references public.children (id) on delete cascade,
  body text not null
);
create index tutor_notes_child_id_idx on public.tutor_notes (child_id);

-- ---------------------------------------------------------------------------
-- Settings (single row each, id = 1)
-- ---------------------------------------------------------------------------
create table public.settings (
  id int primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  price_assessment_pence int not null check (price_assessment_pence >= 0),
  price_one_to_one_pence int not null check (price_one_to_one_pence >= 0),
  price_group_pence int not null check (price_group_pence >= 0),
  price_sunday_bundle_pence int not null check (price_sunday_bundle_pence >= 0),
  travel_fee_pence int not null check (travel_fee_pence >= 0),
  -- {"saturday": {"6": pence, "10": pence}, "sunday_bundle": {"6": pence, "10": pence}}
  block_prices jsonb not null,
  online_enabled boolean not null default false,
  home_visits_enabled boolean not null default true,
  tutor_place_enabled boolean not null default true,
  cancellation_notice_hours int not null check (cancellation_notice_hours >= 0),
  booking_window_days int not null check (booking_window_days > 0),
  min_notice_hours int not null check (min_notice_hours >= 0),
  default_group_capacity int not null check (default_group_capacity > 0),
  home_visit_buffer_minutes int not null check (home_visit_buffer_minutes >= 0),
  allowed_postcode_districts text[] not null default '{}',
  flag_threshold int not null check (flag_threshold > 0),
  group_venue text,
  business_phone text,
  business_address text
);

create table public.settings_private (
  id int primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  bank_account_name text,
  bank_sort_code text,
  bank_account_number text,
  teaching_address text,
  meeting_link text,
  calendar_feed_token text not null
);

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------
-- Weekly windows. weekday: 0 = Sunday ... 6 = Saturday (London local time).
-- Slots start hourly from start_time; the last start is end_time - 60 min.
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  period public.period_kind not null,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  kinds public.booking_kind[] not null,
  locations public.location_kind[] not null,
  check (end_time > start_time)
);

-- Term-time segments, inclusive. Any date not covered is holiday.
create table public.term_periods (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  label text not null,
  starts_on date not null,
  ends_on date not null,
  check (ends_on >= starts_on)
);

create table public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  is_default boolean not null default false,
  check (ends_at > starts_at)
);
create index blocked_times_starts_at_idx on public.blocked_times (starts_at);

-- Repeating weekly blocks (London local time).
create table public.blocked_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  valid_from date not null,
  valid_to date,
  reason text not null default '',
  check (end_time > start_time),
  check (valid_to is null or valid_to >= valid_from)
);

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
create table public.group_series (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  capacity int not null check (capacity > 0),
  price_pence int not null check (price_pence >= 0),
  venue text,
  is_online boolean not null default false,
  year_group text not null,
  product text check (product in ('saturday', 'sunday_bundle')),
  active boolean not null default true,
  starts_on date not null
);

create table public.group_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  series_id uuid references public.group_series (id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity > 0),
  price_pence int not null check (price_pence >= 0),
  venue text,
  is_online boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  check (ends_at > starts_at),
  unique (series_id, starts_at)
);
create index group_sessions_starts_at_idx on public.group_sessions (starts_at);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.block_bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid references public.profiles (id) on delete set null,
  child_id uuid references public.children (id) on delete set null,
  product text not null check (product in ('saturday', 'sunday_bundle')),
  weeks int not null check (weeks in (6, 10)),
  price_pence int not null check (price_pence >= 0),
  payment_reference text not null unique default ('SLC-' || nextval('public.payment_ref_seq')),
  hold_expires_at timestamptz,
  status text not null default 'held' check (status in ('held', 'paid', 'released'))
);
create index block_bookings_parent_id_idx on public.block_bookings (parent_id);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid references public.profiles (id) on delete set null,
  child_id uuid references public.children (id) on delete set null,
  kind public.booking_kind not null,
  location public.location_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- ends_at plus any travel buffer (home visits); used by the overlap guard.
  busy_until timestamptz not null,
  group_session_id uuid references public.group_sessions (id),
  block_booking_id uuid references public.block_bookings (id),
  bundle_id uuid,
  status public.booking_status not null default 'pending',
  price_pence int not null check (price_pence >= 0),
  travel_fee_pence int not null default 0 check (travel_fee_pence >= 0),
  payment_reference text not null unique default ('SLC-' || nextval('public.payment_ref_seq')),
  payment_status public.payment_status not null default 'unpaid',
  home_address text,
  home_postcode text,
  cancelled_at timestamptz,
  cancelled_by text,
  decided_at timestamptz,
  check (ends_at > starts_at),
  check (busy_until >= ends_at),
  -- No double booking of 1-to-1/assessment time, including the travel buffer.
  constraint bookings_no_overlap exclude using gist (
    tstzrange(starts_at, busy_until) with &&
  ) where (kind <> 'group' and status in ('pending', 'confirmed', 'attended'))
);
create index bookings_parent_id_idx on public.bookings (parent_id);
create index bookings_child_id_idx on public.bookings (child_id);
create index bookings_starts_at_idx on public.bookings (starts_at);
create index bookings_group_session_id_idx on public.bookings (group_session_id);
create index bookings_block_booking_id_idx on public.bookings (block_booking_id);
-- One seat per child per group session.
create unique index bookings_child_group_session_key on public.bookings (child_id, group_session_id)
  where status in ('pending', 'confirmed', 'attended');

-- ---------------------------------------------------------------------------
-- Money and records
-- ---------------------------------------------------------------------------
create table public.ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  booking_id uuid references public.bookings (id) on delete set null,
  block_booking_id uuid references public.block_bookings (id) on delete set null,
  parent_id uuid references public.profiles (id) on delete set null,
  kind public.ledger_kind not null,
  method public.payment_method,
  amount_pence int not null check (amount_pence >= 0),
  occurred_on date not null, -- London calendar date; set by the caller
  note text not null default ''
);
create index ledger_parent_id_idx on public.ledger (parent_id);
create index ledger_booking_id_idx on public.ledger (booking_id);
create index ledger_block_booking_id_idx on public.ledger (block_booking_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  spent_on date not null,
  category text not null,
  description text not null default '',
  amount_pence int not null check (amount_pence >= 0),
  receipt_path text
);

create table public.mileage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  booking_id uuid references public.bookings (id) on delete set null,
  trip_on date not null,
  miles numeric(6, 1) check (miles is null or miles >= 0),
  note text not null default ''
);

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  booking_id uuid references public.bookings (id) on delete set null,
  block_booking_id uuid references public.block_bookings (id) on delete set null,
  template text not null,
  to_email text not null,
  sent_at timestamptz not null default now(),
  unique (booking_id, template)
);

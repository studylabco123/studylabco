-- Study Lab Co: launch settings and 2026-27 calendar (Task 3).
-- Applied as a migration (not supabase/seed.sql) so it also runs on db push.

insert into public.settings (
  id, price_assessment_pence, price_one_to_one_pence, price_group_pence,
  price_sunday_bundle_pence, travel_fee_pence, block_prices,
  online_enabled, home_visits_enabled, tutor_place_enabled,
  cancellation_notice_hours, booking_window_days, min_notice_hours,
  default_group_capacity, home_visit_buffer_minutes, allowed_postcode_districts,
  flag_threshold
) values (
  1, 1000, 2500, 1800,
  3000, 500,
  '{"saturday": {"6": 10200, "10": 16200}, "sunday_bundle": {"6": 17100, "10": 27000}}'::jsonb,
  false, true, true,
  48, 28, 24,
  15, 30, '{BB1,BB2}',
  2
);

insert into public.settings_private (id, calendar_feed_token)
values (1, encode(extensions.gen_random_bytes(24), 'hex'));

-- Weekly windows (weekday 0 = Sunday). Last slot start = end_time - 60 min.
insert into public.availability_rules (period, weekday, start_time, end_time, kinds, locations)
select r.period::public.period_kind, d, r.start_time::time, r.end_time::time,
       '{assessment,one_to_one}'::public.booking_kind[], r.locations::public.location_kind[]
  from (values
    -- Term Mon-Fri 17:00-20:00 (slots 17:00, 18:00, 19:00).
    ('term',    1, 5, '17:00', '20:00', '{tutor_place,online}'),
    -- Holiday Mon-Fri 07:00-22:00 (slots 07:00 .. 21:00).
    ('holiday', 1, 5, '07:00', '22:00', '{tutor_place,online}'),
    -- Sunday, term and holiday, after the groups (slots 10:30 .. 16:30).
    ('term',    0, 0, '10:30', '17:30', '{tutor_place,home_visit,online}'),
    ('holiday', 0, 0, '10:30', '17:30', '{tutor_place,home_visit,online}')
  ) as r (period, first_day, last_day, start_time, end_time, locations)
  cross join lateral generate_series(r.first_day, r.last_day) as d;

-- Term-time segments (inclusive). Gaps are holidays/closures.
insert into public.term_periods (label, starts_on, ends_on) values
  ('Autumn 1',  '2026-09-01', '2026-10-23'),
  ('Autumn 2',  '2026-11-02', '2026-12-18'),
  ('Spring 1',  '2027-01-04', '2027-02-12'),
  ('Spring 2a', '2027-02-22', '2027-03-08'),
  ('Spring 2b', '2027-03-11', '2027-03-25'),
  ('Summer 1a', '2027-04-12', '2027-05-02'),
  ('Summer 1b', '2027-05-04', '2027-05-16'),
  ('Summer 1c', '2027-05-19', '2027-05-28'),
  ('Summer 2',  '2027-06-07', '2027-07-22');

-- Default whole-day closures: London midnight to the next London midnight.
insert into public.blocked_times (starts_at, ends_at, reason, is_default)
select (d::timestamp at time zone 'Europe/London'),
       ((d + 1)::timestamp at time zone 'Europe/London'),
       reason, true
  from (values
    ('2026-12-25'::date, 'Christmas Day'),
    ('2026-12-26'::date, 'Boxing Day'),
    ('2027-01-01'::date, 'New Year''s Day'),
    ('2027-03-09'::date, 'Eid ul Fitr (provisional)'),
    ('2027-03-10'::date, 'Eid ul Fitr (provisional)'),
    ('2027-05-17'::date, 'Eid ul Adha (provisional)'),
    ('2027-05-18'::date, 'Eid ul Adha (provisional)')
  ) as v (d, reason);

insert into public.group_series
  (title, weekday, start_time, capacity, price_pence, venue, is_online, year_group, product, active, starts_on)
values
  ('Saturday GCSE Science Group', 6, '08:15', 15, 1800, null, false, 'Years 10 & 11', 'saturday', true, '2026-11-01'),
  ('Sunday Group — Session 1',    0, '08:15', 15, 1800, null, false, 'Years 10 & 11', 'sunday_bundle', true, '2026-11-01'),
  ('Sunday Group — Session 2',    0, '09:15', 15, 1800, null, false, 'Years 10 & 11', 'sunday_bundle', true, '2026-11-01');

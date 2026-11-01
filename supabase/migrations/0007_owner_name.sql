-- Ruling R24 (I6): the name of the person who runs Study Lab Co, shown in the
-- footer and on the Contact page ("Study Lab Co is run by <name>.") once set.
-- Public (settings is readable by anon), at most 80 characters.
alter table public.settings
  add column owner_name text
  constraint settings_owner_name_length check (owner_name is null or char_length(owner_name) <= 80);

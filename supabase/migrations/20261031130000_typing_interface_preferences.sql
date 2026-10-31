-- Admin-managed typing workspace presentation preferences.
-- This controls layout only; activity timers, scoring and submission remain activity-owned.
alter table public.site_experience_settings
  add column if not exists typing_interface_preferences jsonb not null
  default '{"default":"master","overrides":{}}'::jsonb;

alter table public.site_experience_settings
  drop constraint if exists site_experience_settings_typing_interface_preferences_check;
alter table public.site_experience_settings
  add constraint site_experience_settings_typing_interface_preferences_check
  check (
    jsonb_typeof(typing_interface_preferences) = 'object'
    and typing_interface_preferences->>'default' = 'master'
    and jsonb_typeof(coalesce(typing_interface_preferences->'overrides', '{}'::jsonb)) = 'object'
    and coalesce(typing_interface_preferences->'overrides'->>'exam', 'master') in ('master','screen','pdf')
    and coalesce(typing_interface_preferences->'overrides'->>'self-test', 'master') in ('master','screen','pdf')
    and coalesce(typing_interface_preferences->'overrides'->>'fix-accuracy', 'master') in ('master','screen','pdf')
  );

-- ============================================================
--  JamPod update 2 — password reset + shared band library
--  Run ONCE in: Supabase dashboard → SQL Editor → New query → Run
--  (Safe to re-run: everything is "if not exists".)
--  No passwords to fill in: it reuses the jampod_app login from setup.
-- ============================================================

-- One-time password reset links (only a SHA-256 hash of the link is stored).
create table if not exists public.password_resets (
  token_hash text primary key,
  user_id    text not null references public.users (id) on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz not null
);
create index if not exists password_resets_user_id_idx on public.password_resets (user_id);

-- Each band's shared Song Studio library (songs, versions, mixer settings, setlists).
create table if not exists public.band_libraries (
  band_id    text primary key references public.bands (id) on delete cascade,
  rev        integer not null,
  doc        jsonb not null,
  updated_at timestamptz not null default now()
);

-- Published recordings (compressed audio, a few hundred KB per minute).
create table if not exists public.band_audio (
  id         text primary key,
  band_id    text not null references public.bands (id) on delete cascade,
  mime       text not null,
  bytes      bytea not null,
  size       integer not null,
  created_by text references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists band_audio_band_id_idx on public.band_audio (band_id);
create index if not exists band_audio_created_by_idx on public.band_audio (created_by);

-- Same lock-down as the other tables: hidden from Supabase's public API,
-- usable only by the JamPod server's login.
alter table public.password_resets enable row level security;
alter table public.band_libraries  enable row level security;
alter table public.band_audio      enable row level security;

grant select, insert, update, delete on public.password_resets, public.band_libraries, public.band_audio to jampod_app;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'password_resets' and policyname = 'jampod_app_all') then
    create policy jampod_app_all on public.password_resets for all to jampod_app using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'band_libraries' and policyname = 'jampod_app_all') then
    create policy jampod_app_all on public.band_libraries for all to jampod_app using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'band_audio' and policyname = 'jampod_app_all') then
    create policy jampod_app_all on public.band_audio for all to jampod_app using (true) with check (true);
  end if;
end $$;

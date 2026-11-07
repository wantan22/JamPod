-- ============================================================
--  JamPod — one-time Supabase setup
--  Paste this whole file into: Supabase dashboard → SQL Editor → New query → Run
--
--  BEFORE RUNNING: replace  CHANGE-ME-TO-A-LONG-RANDOM-PASSWORD  below
--  (use 24+ letters and numbers, no quotes or @ : / symbols).
--  You'll put the same password into the DATABASE_URL on Render.
-- ============================================================

-- 1) A dedicated login for the JamPod server (can only touch JamPod's tables).
create role jampod_app login password 'CHANGE-ME-TO-A-LONG-RANDOM-PASSWORD';

-- 2) Tables.
create table if not exists public.users (
  id            text primary key,
  email         text not null unique,
  display_name  text not null,
  password_salt text not null,
  password_hash text not null,
  gender        text not null default 'nonbinary' check (gender in ('masculine', 'feminine', 'nonbinary')),
  tint          text not null default '#E8B464' check (tint ~ '^#[0-9a-fA-F]{6}$'),
  created_at    timestamptz not null default now()
);

create table if not exists public.sessions (
  token_hash text primary key,
  user_id    text not null references public.users (id) on delete cascade,
  created_at timestamptz not null,
  renewed_at timestamptz not null,
  expires_at timestamptz not null
);
create index if not exists sessions_user_id_idx on public.sessions (user_id);
create index if not exists sessions_expires_at_idx on public.sessions (expires_at);

create table if not exists public.bands (
  id          text primary key,
  name        text not null,
  invite_code text not null unique,
  created_by  text references public.users (id) on delete set null,
  created_at  timestamptz not null
);
create index if not exists bands_created_by_idx on public.bands (created_by);

create table if not exists public.band_members (
  band_id   text not null references public.bands (id) on delete cascade,
  user_id   text not null references public.users (id) on delete cascade,
  seat      text not null check (seat in ('m1', 'm2', 'm3', 'm4')),
  joined_at timestamptz not null,
  primary key (band_id, user_id),
  unique (band_id, seat)
);
create index if not exists band_members_user_id_idx on public.band_members (user_id);

-- 3) Lock the tables away from Supabase's public API (anon / authenticated keys).
alter table public.users        enable row level security;
alter table public.sessions     enable row level security;
alter table public.bands        enable row level security;
alter table public.band_members enable row level security;

-- 4) Let only the JamPod server's login use them.
grant usage on schema public to jampod_app;
grant select, insert, update, delete on public.users, public.sessions, public.bands, public.band_members to jampod_app;

create policy jampod_app_all on public.users        for all to jampod_app using (true) with check (true);
create policy jampod_app_all on public.sessions     for all to jampod_app using (true) with check (true);
create policy jampod_app_all on public.bands        for all to jampod_app using (true) with check (true);
create policy jampod_app_all on public.band_members for all to jampod_app using (true) with check (true);

-- 5) Password resets + shared band library (same as supabase-update-2.sql).
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

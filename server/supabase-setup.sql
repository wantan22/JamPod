-- ============================================================
--  JamPod — one-time Supabase setup
--  Paste this whole file into: Supabase dashboard → SQL Editor → New query → Run
--
--  BEFORE RUNNING: replace  CHANGE-ME-TO-A-LONG-RANDOM-PASSWORD  below
--  (use 24+ letters and numbers, no quotes or @ : / symbols).
--  You'll put the same password into the DATABASE_URL on Render.
-- ============================================================

-- 1) A dedicated login for the JamPod server (can only touch JamPod's tables).
create role jampod_app login password 'JamPod3131';

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

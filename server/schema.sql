-- JamPod accounts schema for Postgres (Supabase).
-- Applied once per database. The server connects as `jampod_app`, a
-- dedicated login with access to these four tables only.
--
-- Row Level Security is ON with policies for jampod_app alone, so Supabase's
-- public REST API (anon / authenticated keys) can't read or write anything.

create table if not exists public.users (
  id            text primary key,
  email         text not null unique,
  display_name  text not null,
  password_salt text not null,
  password_hash text not null,               -- scrypt, never the password itself
  gender        text not null default 'nonbinary' check (gender in ('masculine', 'feminine', 'nonbinary')),
  tint          text not null default '#E8B464' check (tint ~ '^#[0-9a-fA-F]{6}$'),
  created_at    timestamptz not null default now()
);

create table if not exists public.sessions (
  token_hash text primary key,               -- SHA-256 of the cookie token
  user_id    text not null references public.users (id) on delete cascade,
  created_at timestamptz not null,
  renewed_at timestamptz not null,
  expires_at timestamptz not null
);
create index if not exists sessions_user_id_idx on public.sessions (user_id);
create index if not exists sessions_expires_at_idx on public.sessions (expires_at);

create table if not exists public.bands (
  id          text primary key,              -- also the relay room id
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

-- Lock the tables away from the public API.
alter table public.users        enable row level security;
alter table public.sessions     enable row level security;
alter table public.bands        enable row level security;
alter table public.band_members enable row level security;

-- App role (created separately with a generated password):
--   create role jampod_app login password '<generated>';
grant usage on schema public to jampod_app;
grant select, insert, update, delete on public.users, public.sessions, public.bands, public.band_members to jampod_app;

create policy jampod_app_all on public.users        for all to jampod_app using (true) with check (true);
create policy jampod_app_all on public.sessions     for all to jampod_app using (true) with check (true);
create policy jampod_app_all on public.bands        for all to jampod_app using (true) with check (true);
create policy jampod_app_all on public.band_members for all to jampod_app using (true) with check (true);

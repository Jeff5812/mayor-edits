-- True Crimes Video Editing: initial schema.
-- Apply with the Supabase SQL editor, or `npx supabase db push` (Docker is not required for either).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Administrators
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Portfolio projects (metadata only; files live in Storage)
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default 'true-crime-documentary',
  services text[] not null default '{}',
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  production_year integer check (production_year is null or production_year between 1900 and 2100),
  is_featured boolean not null default false,
  is_showreel boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  upload_status text not null default 'none' check (upload_status in ('none', 'uploading', 'ready', 'failed')),
  video_path text unique,
  video_mime text check (video_mime is null or video_mime in ('video/mp4', 'video/webm', 'video/quicktime')),
  video_size_bytes bigint check (video_size_bytes is null or video_size_bytes >= 0),
  video_fingerprint text unique,
  poster_path text,
  full_film_url text check (full_film_url is null or full_film_url ~ '^https://'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A project cannot go live without a finished video.
  constraint published_requires_video check (
    status = 'draft' or (video_path is not null and upload_status = 'ready')
  )
);

-- Only one project can be the homepage showreel.
create unique index projects_single_showreel on public.projects (is_showreel) where is_showreel;
create index projects_public_listing on public.projects (status, is_featured, sort_order, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_touch_updated_at
before update on public.projects
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Testimonials (real ones only; the site shows nothing until one is published)
-- ---------------------------------------------------------------------------
create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null check (char_length(quote) between 1 and 1000),
  author_name text not null check (char_length(author_name) between 1 and 120),
  author_role text not null default '' check (char_length(author_role) <= 160),
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contact enquiries (inserted by the server only)
-- ---------------------------------------------------------------------------
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  project_type text not null check (char_length(project_type) between 1 and 80),
  message text not null check (char_length(message) between 1 and 5000),
  locale text not null default 'en',
  email_delivery_status text not null default 'not_configured'
    check (email_delivery_status in ('not_configured', 'sent', 'failed')),
  ip_hash text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index contact_messages_rate_limit on public.contact_messages (ip_hash, created_at desc);
create index contact_messages_inbox on public.contact_messages (created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.projects enable row level security;
alter table public.testimonials enable row level security;
alter table public.contact_messages enable row level security;

revoke all on public.admins, public.projects, public.testimonials, public.contact_messages from anon, authenticated;
grant select on public.projects, public.testimonials to anon;
grant select, insert, update, delete on public.projects, public.testimonials to authenticated;
grant select, update, delete on public.contact_messages to authenticated;
grant select on public.admins to authenticated;

create policy "users can see their own admin row" on public.admins
  for select to authenticated using (user_id = auth.uid());

create policy "public reads published projects" on public.projects
  for select to anon, authenticated using (status = 'published');
create policy "admins manage projects" on public.projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public reads published testimonials" on public.testimonials
  for select to anon, authenticated using (is_published);
create policy "admins manage testimonials" on public.testimonials
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins read enquiries" on public.contact_messages
  for select to authenticated using (public.is_admin());
create policy "admins update enquiries" on public.contact_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete enquiries" on public.contact_messages
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage
-- videos: private. Playback uses short-lived signed URLs, available only while published.
-- posters: public images. Paths contain the project id and a random id.
-- Raise file_size_limit here and in NEXT_PUBLIC_MAX_VIDEO_MB after moving to a paid plan.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('videos', 'videos', false, 52428800, array['video/mp4', 'video/webm', 'video/quicktime']),
  ('posters', 'posters', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "admins manage media" on storage.objects
  for all to authenticated
  using (bucket_id in ('videos', 'posters') and public.is_admin())
  with check (bucket_id in ('videos', 'posters') and public.is_admin());

create policy "public can sign published videos" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'videos'
    and exists (
      select 1 from public.projects p
      where p.video_path = storage.objects.name and p.status = 'published'
    )
  );

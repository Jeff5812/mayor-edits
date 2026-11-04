-- Mayor Edits realignment: a single-page portfolio with video files on Cloudflare R2.
-- Stops before changing anything if a table or column being removed could hold real data.
do $$
begin
  if exists (select 1 from public.testimonials) or exists (select 1 from public.contact_messages) then
    raise exception 'testimonials or contact_messages holds data; refusing to drop them';
  end if;
  if exists (select 1 from public.projects) then
    raise exception 'projects holds rows; review this migration before dropping columns';
  end if;
end $$;

drop table public.testimonials;
drop table public.contact_messages;

drop index public.projects_single_showreel;
drop index public.projects_public_listing;

alter table public.projects
  drop column slug,
  drop column services,
  drop column production_year,
  drop column is_showreel,
  drop column full_film_url,
  drop column sort_order,
  alter column category drop default,
  add column language text not null default '',
  add constraint projects_category_check check (char_length(category) between 1 and 60),
  add constraint projects_language_check check (char_length(language) <= 60),
  drop constraint projects_video_mime_check,
  add constraint projects_video_mime_check check (video_mime is null or video_mime = 'video/mp4'),
  drop constraint projects_video_size_bytes_check,
  -- 500 MB, matching MAX_VIDEO_MB in src/lib/media/validation.ts.
  add constraint projects_video_size_bytes_check check (video_size_bytes is null or video_size_bytes between 0 and 524288000);

create index projects_public_listing on public.projects (status, is_featured desc, created_at desc);

-- Videos now live in R2, so Supabase Storage only holds posters.
drop policy "public can sign published videos" on storage.objects;
drop policy "admins manage media" on storage.objects;
create policy "admins manage posters" on storage.objects
  for all to authenticated
  using (bucket_id = 'posters' and public.is_admin())
  with check (bucket_id = 'posters' and public.is_admin());

-- An event trigger function: nobody needs to call it directly.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

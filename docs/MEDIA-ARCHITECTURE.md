# Mayor Studios: media architecture

Owner: Media and Portfolio Engineer. Review draft for the lead. Nothing here has been applied or built. Section 8 separates
what was verified from what was not.

**Read section 6 first if short of time.** It contains a finding about the Pexels terms that needs a decision.

## 1. Review of `types.ts`

The shape is right: project to versions, `isDemo`, a repository that rejects on failure. It needs five changes.

**1. `VideoAsset.src` stays, but must never hold a signed URL.** A signed URL in listing data would sign every version on
every render, go stale inside cached pages, and put working file links in the HTML. A signature is created only when
someone presses play, by a route that `src` points at:

- Supabase: `src = /api/playback/<versionId>`, a stable same-origin URL that answers 302 to a fresh signed URL.
- Demo: `src = /demo/<slug>/video.mp4`.

I rejected a `getPlayback()` JSON call on press. An `await` between the tap and `video.play()` can lose the user gesture
on iOS Safari, so the first tap plays nothing. With a redirecting `src`, the click handler sets `src` and calls `play()`
synchronously. It also means no new type and no new repository method: the UI only ever sees a URL.

**2. `language` alone cannot say what it claims.** "fr" on a version reads as a French cut even if only the subtitles are
French, and stock clips have no dialogue at all. Add `languageMode`. Cards and the picker build their text from it, so
"French subtitles" can never appear as "French".

**3. Card art and player art are different crops, so add `Project.poster`.** The client's reference uses portrait cards of
about 4:5. Cropping a 16:9 frame to 4:5 in CSS shows 45 percent of its width, so the browser downloads more than twice the
pixels it displays, on a plan with 5 GB of egress. So the card crop is baked at upload into `Project.thumbnail`, and a
separate wide `Project.poster` serves the player. `ProjectVersion.thumbnail?` becomes `poster?`, because the player is the
only place a version-specific image appears. Cards keep reading `Project.thumbnail`, so card code is unaffected. 4:5 is my
assumption from the reference: the Creative Director should confirm it, and a different ratio is one parameter.

**4. `ThumbnailImage` is enough for a client-generated srcset and dominant colour**, with three fixes: `srcSet` becomes
required (a thumbnail without widths is a bug, not a state), `src` becomes a mid-size file rather than the largest (it is
the fallback, so it should be the cheap one), and `focusX`/`focusY` become required and mean the focal point within this
image, so a slightly different card ratio still crops well. `dominantColor` as a hex string is fine. Storage keeps one
compact record and the repository expands it. No `alt` field: the card title labels the link, so the image is `alt=""`.

**5. `SubtitleTrack` needs an `id`, `src` must be same-origin, and `versions` needs its guarantees in the comment.**
Same-origin means `<track>` needs no CORS and `<video>` needs no `crossorigin`.

Public `Project` stays public-only. Draft shapes live in my own `src/lib/portfolio/studio-types.ts`, so cards can never meet
a half-finished project. `isDemo` is never stored in the database: the Supabase mapper always sets `false`.

### Exact changes for the lead

```ts
export interface ThumbnailImage {
  /** Fallback for anything ignoring srcSet: a mid-size file, not the largest. */
  src: string;
  /** Pre-generated widths, for example "/a-480.webp 480w, /a-960.webp 960w". */
  srcSet: string;
  /** Pixel size of the largest file. Reserves the aspect ratio before the image arrives. */
  width: number;
  height: number;
  /** Dominant colour as "#rrggbb", darkened to suit the dark UI. Paints before the image arrives. */
  dominantColor: string;
  /** Focal point within this image in percent, for object-position. Always present: 50 if unset. */
  focusX: number;
  focusY: number;
}

export interface SubtitleTrack {
  id: string;
  /** BCP 47 language of the subtitle text, for example "fr". */
  language: string;
  /** Same-origin URL of a WebVTT file. Fetched only when the track is turned on. */
  src: string;
}

export interface VideoAsset {
  /**
   * Stable same-origin URL, safe in listing data. Never a signed URL. Never set on a <video> until the visitor presses
   * play. Demo: /demo/<slug>/video.mp4. Supabase: /api/playback/<versionId>, which redirects to a short-lived signed URL.
   */
  src: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

/**
 * What `ProjectVersion.language` claims.
 * spoken: the audio is in this language.
 * subtitled: the language reaches the viewer through subtitles only. Never implies a dub.
 * none: no dialogue. `language` is "zxx".
 */
export type VersionLanguageMode = "spoken" | "subtitled" | "none";

export interface ProjectVersion {
  id: string;
  /** BCP 47, for example "en", "fr", "pt-BR". "zxx" when the cut has no dialogue. */
  language: string;
  languageMode: VersionLanguageMode;
  video: VideoAsset;
  /** Wide still for the player when this version is selected. Falls back to Project.poster. */
  poster?: ThumbnailImage;
  subtitles: SubtitleTrack[];
  /** Whole seconds. */
  durationSeconds?: number;
  metadata?: Record<string, string>;
}

// On Project:
/** Card art, cropped to the card ratio. */
thumbnail: ThumbnailImage;
/** Wide frame at the video's ratio, for the player. */
poster: ThumbnailImage;
/** Ready versions only, in the owner's order. At least one. The first is the default; the interface locale never picks. */
versions: ProjectVersion[];
```

`PortfolioRepository` is unchanged. Signing is a private detail of the Supabase implementation and its route.

## 2. Database and storage

### What happens to the old tables

- **`projects`** (0 rows, single-video shape): drop and recreate. The migration aborts if it holds any row.
- **`admins`, `is_admin()`, `touch_updated_at()`**: keep. The migration repeats the functions with `create or replace`.
- **`testimonials`, `contact_messages`** (0 rows): drop, in a separate migration file so the lead can decline it. The brief
  asks for neither: it forbids fake testimonials, and contact is WhatsApp and email links. An unused table holding contact
  data is a liability. Same empty-table guard.
- **The two old storage policies**: drop. Check `pg_policies` first, because I did not query the live project.

### Schema (draft for `supabase/migrations/`, not applied)

```sql
-- Artwork is one JSON record per project, not fourteen columns:
-- {"stem","ext","dominantColor","card":{"widths","width","height","focusX","focusY"},"wide":{same}}
-- coalesce matters: a CHECK passes on NULL, so a missing key must become false, not NULL.
create function public.artwork_part_is_valid(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce((
    jsonb_typeof(p) = 'object' and jsonb_typeof(p->'widths') = 'array'
    and (p->>'width')::int > 0 and (p->>'height')::int > 0
    and (p->>'focusX')::numeric between 0 and 100 and (p->>'focusY')::numeric between 0 and 100
  ), false);
$$;
create function public.artwork_is_valid(owner_project uuid, t jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select t is null or coalesce((
    jsonb_typeof(t) = 'object'
    and starts_with(t->>'stem', owner_project::text || '/')
    and t->>'ext' in ('webp', 'jpg')
    and t->>'dominantColor' ~ '^#[0-9a-f]{6}$'
    and public.artwork_part_is_valid(t->'wide')
    and (t->'card' is null or public.artwork_part_is_valid(t->'card'))
  ), false);
$$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  category text check (category in ('brand-film','documentary','music-video','social','narrative','corporate')),
  artwork jsonb,
  is_featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_artwork_valid check (public.artwork_is_valid(id, artwork)),
  -- "artwork is not null" comes first on purpose: NULL ? 'card' is NULL, which a CHECK would let through.
  constraint published_is_complete check (
    status = 'draft' or (artwork is not null and artwork ? 'card' and category is not null))
);

create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  language text not null check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  language_mode text not null default 'spoken' check (language_mode in ('spoken','subtitled','none')),
  upload_status text not null default 'uploading' check (upload_status in ('uploading','ready','failed')),
  video_path text unique,
  video_mime text check (video_mime = 'video/mp4'),
  video_size_bytes bigint check (video_size_bytes between 0 and 52428800),
  -- Set when ready, so a failed attempt never blocks a retry. Global on purpose: the same file under
  -- two languages would advertise a language it does not have.
  video_sha256 text unique,
  video_width integer check (video_width > 0),
  video_height integer check (video_height > 0),
  duration_seconds integer check (duration_seconds >= 0),
  artwork jsonb,  -- optional, "wide" only
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, language),
  constraint no_dialogue_is_zxx check ((language_mode = 'none') = (language = 'zxx')),
  constraint ready_has_file check (upload_status <> 'ready' or video_path is not null),
  constraint video_in_own_folder check (
    video_path is null or starts_with(video_path, project_id::text || '/' || id::text || '/')),
  constraint version_artwork_valid check (public.artwork_is_valid(project_id, artwork))
);
create index project_versions_project on public.project_versions (project_id, sort_order);
create index projects_public_listing on public.projects (status, is_featured desc, sort_order, created_at desc);

-- Subtitles are text in the database, not files. Reasons: no orphan files, unpublishing takes effect at
-- once, same-origin serving is simple, and a 60 KB track avoids a 50 MB language version.
-- Listing queries select id and language only, never vtt.
create table public.subtitle_tracks (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.project_versions (id) on delete cascade,
  language text not null check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  vtt text not null check (vtt like 'WEBVTT%' and octet_length(vtt) <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version_id, language)
);
create index subtitle_tracks_version on public.subtitle_tracks (version_id);
-- plus touch_updated_at triggers on all three tables
```

### No project goes live without a ready video

There are four layers, and the database is the real one:

1. The Publish button stays disabled with the reason shown.
2. The CHECK above: a published project needs card art and a category.
3. Two triggers, as in the unapplied migration: `projects_require_ready_version` (before insert or update of `status`) and
   `project_versions_keep_project_playable` (after delete or update of `upload_status`, locking the project row, so two
   removals cannot each rely on the other surviving). Both raise `check_violation`, which the UI turns into plain words.
4. **New: "ready" is checked, not believed.** A before-insert-or-update trigger on `project_versions`, when
   `upload_status = 'ready'`, reads `storage.objects` (security definer). It fails if the object does not exist and
   overwrites `video_size_bytes` and `video_mime` from the stored metadata. A buggy client cannot mark a file ready that
   never arrived.

### Row-level security

```sql
-- Same pattern on all three tables: enable RLS, revoke all from anon and authenticated, then
-- grant select to anon, and grant select, insert, update, delete to authenticated.
create policy "public reads published projects" on public.projects
  for select to anon, authenticated using (status = 'published');
create policy "public reads ready versions of published projects" on public.project_versions
  for select to anon, authenticated using (
    upload_status = 'ready' and exists (
      select 1 from public.projects p where p.id = project_id and p.status = 'published'));
create policy "public reads subtitles of visible versions" on public.subtitle_tracks
  for select to anon, authenticated using (
    exists (select 1 from public.project_versions v join public.projects p on p.id = v.project_id
            where v.id = version_id and v.upload_status = 'ready' and p.status = 'published'));
-- On each table, "(select public.is_admin())" so the planner evaluates it once per statement:
create policy "admins manage projects" on public.projects
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
```

**No service-role key exists in this app.** Public reads and signing use the anon key under RLS. Studio writes use the
owner's session under RLS. There is no such variable in any environment, so it cannot leak.

### Public reads are cached, and cached reads cannot see a session

`next.config.ts` has `cacheComponents: true`. The Supabase repository reads inside `'use cache'` with `cacheTag('portfolio')`
and a long `cacheLife`, using a cookie-less anon client. Per the Next.js docs:

- Cached functions cannot read `cookies()`, so an admin session cannot reach a public cache.
- Publishing calls `updateTag('portfolio')`, which is Server-Action-only and made for read-your-own-writes.
- If revalidation throws, the last good data keeps being served, so an outage would keep real work on screen rather than
  an error. A first-ever failed read reaches `error.tsx`, never the demo.
- GET route handlers run at request time by default, so `/api/playback` stays uncached.

The `use cache` docs also describe an in-memory cache, so how long the last good data survives on the eventual host is
unverified. Test it with a deliberately wrong Supabase URL.

### Storage

| Bucket | Access | Limit (change) | Types (change) | Object path |
|---|---|---|---|---|
| `videos` | private | 50 MB (same) | `video/mp4` (was also webm, quicktime) | `<project>/<version>/<upload-uuid>.mp4` |
| `posters` | public | **512 KB (was 5 MB)** | `image/webp`, `image/jpeg` | `<project>/<art-uuid>-card-<width>.webp`, `-wide-<width>.webp` |

- **MP4 only.** One file per version means no fallback source, and H.264 MP4 is the one format every browser plays. A MOV
  that plays for the owner can fail for a client. Loosening later is one line.
- **The 512 KB limit is what fixes the 60 MB portfolio view.** An unoptimised thumbnail cannot be stored at all, even by
  mistake. A dropped 5 MB image is resized in the browser first. A 12-card view should now cost about 1.3 MB (estimate), so
  5 GB covers roughly 3,800 of them, before video.
- Posters upload with `cacheControl: 31536000`. A path is never reused, so repeat visits cost no egress.

```sql
-- Same answer everywhere, whoever asks. Unknown bucket counts as referenced, so it can never be deleted.
-- Revoke execute from anon.
create function public.media_is_referenced(bucket text, object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case bucket
    when 'videos' then exists (select 1 from public.project_versions v where v.video_path = object_name)
    when 'posters' then exists (
        select 1 from public.projects p
        where p.artwork->>'stem' = regexp_replace(object_name, '-(card|wide)-\d+\.(webp|jpg)$', ''))
      or exists (
        select 1 from public.project_versions v
        where v.artwork->>'stem' = regexp_replace(object_name, '-(card|wide)-\d+\.(webp|jpg)$', ''))
    else true end;
$$;

-- Visitors can sign a file only while its version is ready and its project is published.
create policy "public can sign published videos" on storage.objects for select to anon, authenticated using (
  bucket_id = 'videos' and exists (
    select 1 from public.project_versions v join public.projects p on p.id = v.project_id
    where v.video_path = storage.objects.name and v.upload_status = 'ready' and p.status = 'published'));
create policy "admins read media" on storage.objects for select to authenticated using (
  bucket_id in ('videos','posters') and (select public.is_admin()));
create policy "admins upload media" on storage.objects for insert to authenticated with check (
  (select public.is_admin()) and (
    (bucket_id = 'videos' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$')
    or (bucket_id = 'posters' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}-(card|wide)-[0-9]{3,4}\.(webp|jpg)$')));
-- A file that any row references cannot be deleted, whatever the code asks for.
create policy "admins delete unreferenced media" on storage.objects for delete to authenticated using (
  bucket_id in ('videos','posters') and (select public.is_admin())
  and not public.media_is_referenced(bucket_id, name));
-- Deliberately no UPDATE policy: an upsert needs one, so nothing can overwrite a live file.
```

Unpublishing stops new signatures immediately. A URL already issued works until it expires, at most one hour. That is
the accepted cost of signed URLs. Deleting the file ends access at once.

## 3. Upload workflow

**Stated before anything is chosen, always visible beside the drop area:**

> MP4 (H.264) up to 50 MB. That is about 50 seconds at 8 Mbps or 2 min 13 s at 3 Mbps. Storage: 412 MB of 1 GB used, room
> for about 11 more files this size. Each language version is a whole file. Subtitles are almost free, so add those where
> you can. Your plan includes 5 GB of viewing a month, about 100 full plays of a 50 MB file.

Storage figures come from an admin-only RPC summing `storage.objects`, so leftovers count honestly. Egress cannot be read
from the browser, so the UI states the allowance and links to the Supabase usage page rather than inventing a number.

1. **Choose.** Drop or pick a file. Entry points are in section 5. Mobile uses a visible tap control, never hover.
2. **Check before any byte moves** (under a second, no network beyond the RPC):
   - Over 50 MB: refused, with the fix worked out from this file's duration ("This file is 63 MB. Export at 5 Mbps or
     lower to fit the 50 MB limit.").
   - Would exceed 1 GB: refused, with what can be removed.
   - Probe through a hidden `<video>` on a blob URL. `loadedmetadata` gives duration, width and height automatically. An
     `error` means browsers cannot play it: refused with an H.264 export hint. An infinite duration falls back to asking.
   - Read the MP4 boxes (about 40 lines, no dependency): `hvc1` warns that some browsers will fail; `moov` after `mdat`
     warns of a slow start and names the "fast start" export option.
   - SHA-256 through `crypto.subtle`: "This file is already the French version of X."
3. **Draft rows.** Create the project and version with client-generated UUIDs, status `draft` and `uploading`, title from
   the cleaned file name. Nothing is lost if the tab closes. Drafts are invisible to the public under RLS.
4. **Upload starts at once, in the background**, so the owner fills in the form while it runs. `tus-js-client`, with the
   established settings: 6 MB chunks, direct storage hostname, `retryDelays: [0, 3000, 5000, 10000, 20000]`,
   `removeFingerprintOnSuccess: true`. Two additions: the token is read fresh in `onBeforeRequest`, because a resume can
   outlive a one-hour access token; and `x-upsert` is never sent, because every attempt has its own UUID path.
   - **Progress:** percentage, MB of MB, time left. Upload state lives above the form, so navigating inside Studio does
     not kill it. `beforeunload` warns while one is running.
   - **Cancel:** `upload.abort(true)` terminates it on the server, then marks the version `failed`.
   - **Retry:** automatic per `retryDelays`, then "Paused: connection lost" with a Resume button. After a reload, dropping
     the same file resumes through `findPreviousUploads()`, within the 24-hour URL life. A browser cannot reopen the file
     by itself, so the UI asks for it.
   - **Errors in words:** 413 too large; 401 or 403 sign in again without losing state; 409 "already uploading in another
     tab". A paused Supabase project reads as "The storage service is asleep", not as a generic failure (exact response
     unverified).
5. **Artwork.** Five frames are drawn at once from the blob at 10, 30, 50, 70 and 90 percent, skipping near-black ones. A
   scrubber picks any other frame, and "Use my own image" accepts a file.
   - **Focal point:** tap or drag on the frame. A live preview shows the real card component beside the wide poster.
   - **Card crop:** a window at the card ratio around the focal point. At 4:5 from a 1080p frame that is at most 864 by
     1080, so the widths offered depend on the source and nothing is upscaled.
   - **Encode:** step-down resize on canvas, `toBlob('image/webp')`, lowering quality from 0.82 until under budget. Card at
     480, 720, 960 and 1440 wide: 50, 90, 130 and 260 KB. Wide at 1280 and 1920: 160 and 300 KB. Check `blob.type` afterwards:
     Safari can silently return PNG instead of WebP (from memory, unverified), and then the code writes JPEG with `ext: 'jpg'`.
   - **Dominant colour:** a 32 by 18 canvas, 12-bit histogram ignoring near-black and near-white, lightness clamped to at
     most 28 percent so it never flashes bright on the dark page.
   - **iOS:** `drawImage` on a blob video may need `playsinline muted` and a brief `play()` first. Test on a real device.
6. **Details.** Title, description, category, language and "Spoken / Subtitles only / No dialogue". The video language
   never defaults from the interface language. Autosaves on blur.
7. **Finish.** `onSuccess` sets `video_path`, `upload_status = 'ready'`, `video_sha256`, duration and dimensions. The trigger
   confirms the object exists and records the true size and type.
8. **Subtitles (optional).** `.vtt` or `.srt`, per version, per language. Parsed in the browser, see section 4.
9. **Preview** in the real player, then **Publish**: enabled only when complete, otherwise the button says what is missing.
   A server action confirms the admin, sets `published`, calls `updateTag('portfolio')`, and offers the live link.

**Add a language version:** the same flow from a project, without the project form. **Replace a file:** a new UUID path,
one atomic update of `video_path`, then the old path is removed. A visitor mid-watch recovers through the player's expiry
path.

### Orphan cleanup that cannot delete live files

The trap in the old build was deciding by folder: "anything in this project's folder that is not this version's file".
That deletes another language's video.

1. Nothing lists a folder to decide what to delete. Removal is by exact path only.
2. **The delete policy refuses any object a row references**, for any version in any language, so a code bug cannot do
   the damage. Order is always: remove the row reference first, then the file. If the second step fails, the result is a
   leftover, never a broken project.
3. **Sweep:** an admin-only RPC returns objects that are unreferenced and older than 48 hours, which is longer than the
   24-hour upload URL life. It runs when Studio opens and says what it did: "Removed 2 leftover files, 84 MB freed."
4. `remove()` is expected to return an empty list rather than an error when RLS refuses (from memory, unverified). So the
   code compares what was asked with what was removed.
5. Pinned by a test: with `en` and `fr` both ready, deleting the `fr` object directly must leave it in place, and deleting
   the `en` version must leave the `fr` file playable.

## 4. Player

One `<video>` element with `playsInline` and no `src` at page load. **Zero video bytes move until the press.** Before it, the
visible state is a play `<button>` over the wide poster, shown as an `<img srcSet>` because the `poster` attribute cannot
take a srcset, so a phone does not fetch the 1920 file. Cards never preview video on hover: one idle grid could spend a real
share of the monthly egress.

**Press play.** The click handler sets `video.src = version.video.src`, turns on native `controls` and calls `video.play()`
synchronously. If the browser still refuses (`NotAllowedError`), native controls are already showing and one more tap plays.
There is no dead end. The poster image fades on `playing`.

**Version switch keeps position.** Never use `key={version.id}` on the element: remounting loses position and the iOS
playback permission.

1. Save `currentTime`, whether it was playing, and the chosen subtitle language.
2. Set the new `src` and call `load()`. Every switch takes this path, even when two demo versions share a file.
3. On `loadedmetadata`: set `currentTime` to `min(saved, duration - 0.25)`, because cuts can differ in length. Restore the
   subtitle language if the new version has it, otherwise turn subtitles off. Resume if it was playing.
4. If nothing has been pressed yet, swap poster and duration only, and load nothing.
5. Reflect the choice as `?v=<language>` with `history.replaceState`, which the Next.js docs support, so the owner can send a
   client the French cut. Read it from `window.location` on mount, keeping the page itself cacheable.

**Subtitles.** `<track kind="subtitles">` for the active version only, with `srclang` and a label from
`Intl.DisplayNames(locale)`. Modes are set from a plain subtitle `<select>` beside the version `<select>`, because native
caption menus differ between browsers. Off by default, except that a `subtitled` version turns on its own track, which is
what that version means. Language names are computed on the server and passed as strings, so Node and browser ICU
differences cannot cause a hydration mismatch.

**SRT uploads.** Converted to WebVTT in the browser, stored only as WebVTT, served from `/api/subtitles/<trackId>` as
`text/vtt; charset=utf-8` with `nosniff`:

- Decode strictly as UTF-8, or by BOM for UTF-16. Otherwise refuse with "Please re-save as UTF-8". Guessing would corrupt
  Arabic or Chinese without warning.
- Commas to dots in timestamps, add the header, strip `{\an8}` and `<font>`, keep `<b><i><u>`, escape stray `&` and `<`.
- Show the cue count and first lines. Warn if the last cue ends after the video does, which usually means the wrong file.
- ASS and SSA are refused with a clear message.

**Errors.** The poster stays up, the message sits over it, and real work is never swapped for samples. A media `error`
cannot say why it failed, so the player sends `HEAD` to the `src` route to tell the cases apart:

| Case | Shown |
|---|---|
| 404 | "This version is no longer available", plus any other versions |
| 5xx or offline | "Playback is unavailable right now", plus Retry |
| 200 but the element failed, first time | Silent reload at the saved position (expired signature) |
| 200 but the element failed, second time | "This browser could not play this file", plus other versions |
| Slow network | Spinner after 300 ms of `waiting` |

**Later custom layer.** It adds the same look across browsers, version and subtitle choice inside the frame, a held last
frame during a switch, styled cues, keyboard shortcuts and remembered subtitle choice. Native controls stay as the fallback.

## 5. Admin experience

"Studio" is the portfolio seen by its owner, not a dashboard: same page, same type, same cards. Drafts appear dimmed in the
grid with a small status word, and a card opens an inline sheet with its file, versions, subtitles and Publish. There are
no sidebars or tables. A signed-in admin sees an upload icon on logo hover, an "Add video" action at the head of the
portfolio section, and on mobile a visible tap control; `/studio` is the dedicated view with storage, drafts and everything
else. Public pages stay static: the shortcut is a client component that renders nothing and loads no Supabase code unless a
session cookie exists, so visitors download no admin code and the HTML never contains admin controls. RLS remains the gate.

## 6. Demo media

### Decision needed: how the clips were looked up

The Pexels **licence** allows our use. The Pexels **terms of service** have a separate clause on how content is obtained,
which the licence quotes I was given did not include. I found it only after running the search:

> "Data mining, extraction, scraping and the use of programs or robots for automatic data collection and/or extraction of
> digital data on the Service and/or the content available therein is strictly prohibited for all unauthorised purposes,
> including without limitation for machine learning purposes."
>
> "Bulk, large-scale or systematic copying of Content is strictly prohibited unless explicit permission has been granted by
> us."

**What I did, as instructed and before reading this clause:** on 2026-11-04, from this machine, scripted curl requests with
a browser User-Agent: 42 search pages, 173 still images, and 208 one-byte range requests on video files. WebFetch gets a 403
from pexels.com, so that User-Agent passed something WebFetch does not. No full video was downloaded. Whether this counts
as prohibited is arguable and I do not treat it as settled. I am not a lawyer, and I read this section of the terms, not all
of it. The user should be told.

**What I did next, and recommend:**

1. **I stopped. No further scripted requests to Pexels.** The file URLs below were verified once and should not be scripted.
2. **A person downloads the six recommended files** with the Free download button on each page, choosing the largest size.
   Six individual downloads are ordinary use of the site, not bulk copying. Total about 235 MB.
3. Save them as `C:\Users\DELL\AppData\Local\Temp\claude\a1e53167a7f1637c\83d051af-95b1-4b04-9425-df047bb99ebd\scratchpad\media-review\downloads\<id>\source.mp4`.
   Everything after that is local.
4. If more candidates or scripted access are ever wanted, the official route is the Pexels API with the client's own key.
   That needs a sign-up, which I have not done.

The pages and stills I fetched stay in the scratchpad, are not used as site assets, and can be deleted once the lead has
seen the crop preview.

### Licence verdict

**Pexels: usable, with the presentation rules below.** Page data for all twelve candidates has `license: "Pexels"`. Use on a
website and modification are allowed, and attribution is optional. **Mixkit: not used.** Its video licence is unread, so
it stays out.

### Candidates

Twelve clips at 4K, two per genre, the recommended six first. All files answered a one-byte range request with 206 and
`video/mp4`. I chose them from stills only. The first frame of a clip says nothing about the rest, so see the frame check
under the pipeline.

A preview of these as 4:5 card crops, labelled by ID, is at
`C:\Users\DELL\AppData\Local\Temp\claude\a1e53167a7f1637c\83d051af-95b1-4b04-9425-df047bb99ebd\scratchpad\media-review\out\card-crops.jpg`.

**Recommended six.** Together they run gold, orange, warm dark, teal, coral and cool grey, so the grid brings colour to a
monochrome site.

| Genre | ID, title, author, length | Why it fits |
|---|---|---|
| Brand film | 10140737, Woman and Braille Lights on Wall, cottonbro, 33 s | Low-key close-up in gold bokeh. Reads as a fragrance film. |
| Narrative | 8680224, A Man in a Trench Coat Looking around in Thick Fog, cottonbro, 28 s | The closest match to the reference's orange silhouette card. No visible face in the still. |
| Music video | 8996266, A Man Playing Woodwind Instrument, yankrukov, 25 s | Saxophonist in a dark room with warm practical lamps. Centred for the crop, and sharp. |
| Social ad | 8042293, A Woman With Sunglasses Dancing, ANTHONYSHKRABA-production, 11 s | Teal and rose, in the spirit of the reference's sunglasses card. Already near target length. |
| Documentary | 5635826, Man Looking at Camera, Ono-Kosuki, 10 s | A direct, dignified portrait against coral. The strongest face in the set. No trim needed. |
| Corporate | 7223709, Pensive Woman Looking Through Window, MART-PRODUCTION, 34 s | Tailored and composed, with a strong vertical. No text or logo visible in the still. |

**Alternates**

| Genre | ID, title, author, length | Note |
|---|---|---|
| Brand film | 7846588, A Woman Looking at Camera, cottonbro, 18 s | Near-black with a green streak. The most reserved image. |
| Narrative | 8388352, Man Sitting Inside a Car, cottonbro, 23 s | Vintage car, red practical light, very film-like. Keep the description neutral: no crime framing. |
| Music video | 8041844, A Woman Singing and a Man Playing the Guitar, ANTHONYSHKRABA-production, 12 s | Reads most literally as a music video, but this still is soft. |
| Social ad | 7297197, Portrait Of Woman Wearing Sunglasses, ArtHouseStudio, 13 s | Magenta and violet. The 4:5 crop of this frame loses the eyes, so it needs a different frame. |
| Documentary | 32722528, Solitary Fishing at Sunrise on Tranquil Beach, kelly, 20 s | A silhouette, so no identity concerns, but a second orange beside the fog clip. |
| Corporate | 35331912, Man Working Late in Office with Coffee and Laptop, SHOOTKIN, 9 s | Dark and small, but text on the mug and shirt and recognisable headphones need checking. |

**Pages and verified files** (1080p size / 4K size)

| ID | Page | 1080p file | 4K file | Size |
|---|---|---|---|---|
| 10140737 | https://www.pexels.com/video/woman-and-braille-lights-on-wall-10140737/ | https://videos.pexels.com/video-files/10140737/10140737-hd_2048_1080_25fps.mp4 | https://videos.pexels.com/video-files/10140737/10140737-uhd_4096_2160_25fps.mp4 | 8.7 / 53.0 MB |
| 8680224 | https://www.pexels.com/video/a-man-in-a-trench-coat-looking-around-in-thick-fog-8680224/ | https://videos.pexels.com/video-files/8680224/8680224-hd_2048_1080_25fps.mp4 | https://videos.pexels.com/video-files/8680224/8680224-uhd_4096_2160_25fps.mp4 | 4.2 / 33.6 MB |
| 8996266 | https://www.pexels.com/video/a-man-playing-woodwind-instrument-8996266/ | https://videos.pexels.com/video-files/8996266/8996266-hd_1920_1080_25fps.mp4 | https://videos.pexels.com/video-files/8996266/8996266-uhd_3840_2160_25fps.mp4 | 16.1 / 72.3 MB |
| 8042293 | https://www.pexels.com/video/a-woman-with-sunglasses-dancing-8042293/ | https://videos.pexels.com/video-files/8042293/8042293-hd_2048_1080_25fps.mp4 | https://videos.pexels.com/video-files/8042293/8042293-uhd_4096_2160_25fps.mp4 | 7.3 / 24.8 MB |
| 5635826 | https://www.pexels.com/video/man-looking-at-camera-5635826/ | https://videos.pexels.com/video-files/5635826/5635826-hd_1920_1080_24fps.mp4 | https://videos.pexels.com/video-files/5635826/5635826-uhd_3840_2160_24fps.mp4 | 5.1 / 19.5 MB |
| 7223709 | https://www.pexels.com/video/pensive-woman-looking-through-window-7223709/ | https://videos.pexels.com/video-files/7223709/7223709-hd_1920_1080_25fps.mp4 | https://videos.pexels.com/video-files/7223709/7223709-uhd_3840_2160_25fps.mp4 | 7.5 / 31.0 MB |
| 7846588 | https://www.pexels.com/video/a-woman-looking-at-camera-7846588/ | https://videos.pexels.com/video-files/7846588/7846588-hd_2048_1080_25fps.mp4 | https://videos.pexels.com/video-files/7846588/7846588-uhd_4096_2160_25fps.mp4 | 4.8 / 37.1 MB |
| 8388352 | https://www.pexels.com/video/man-sitting-inside-a-car-8388352/ | https://videos.pexels.com/video-files/8388352/8388352-hd_2048_1080_25fps.mp4 | https://videos.pexels.com/video-files/8388352/8388352-uhd_4096_2160_25fps.mp4 | 9.7 / 53.2 MB |
| 8041844 | https://www.pexels.com/video/a-woman-singing-and-a-man-playing-the-guitar-8041844/ | https://videos.pexels.com/video-files/8041844/8041844-hd_2048_1080_25fps.mp4 | https://videos.pexels.com/video-files/8041844/8041844-uhd_4096_2160_25fps.mp4 | 7.0 / 34.6 MB |
| 7297197 | https://www.pexels.com/video/portrait-of-woman-wearing-sunglasses-7297197/ | https://videos.pexels.com/video-files/7297197/7297197-hd_1920_1080_25fps.mp4 | https://videos.pexels.com/video-files/7297197/7297197-uhd_3840_2160_25fps.mp4 | 9.2 / 39.0 MB |
| 32722528 | https://www.pexels.com/video/solitary-fishing-at-sunrise-on-tranquil-beach-32722528/ | https://videos.pexels.com/video-files/32722528/13950374_1920_1080_24fps.mp4 | https://videos.pexels.com/video-files/32722528/13950376_3840_2160_24fps.mp4 | 36.1 / 106.0 MB |
| 35331912 | https://www.pexels.com/video/man-working-late-in-office-with-coffee-and-laptop-35331912/ | https://videos.pexels.com/video-files/35331912/14970174_1920_1080_25fps.mp4 | https://videos.pexels.com/video-files/35331912/14970176_3840_2160_25fps.mp4 | 2.6 / 9.1 MB |

### How the licence limits are respected

- **No bad light.** My search filter dropped smoking, drugs, weapons, crime, distress, medical scenes, nudity and anything
  naming children. Descriptions talk about the edit only. No invented story, quote, name, brand or client is attached to
  anyone on screen. Subtitles are never written as a person's speech. The Narrative card gets no crime framing.
- **No implied endorsement.** Titles are plain genre labels. The card shows a "Demonstration" label, and the player adds:
  "Demonstration content. Stock footage from Pexels, not a Mayor Studios project. People shown are not connected to the
  studio." `isDemo` drives both, so neither can be forgotten.
- **No implied staff.** I excluded every behind-the-scenes clip of photographers, camera crews and editors, including some
  lovely ones. On a video studio's site those people would read as the team.
- **No trademark use.** Demo stills never appear in the logo or brand marks. If the hero ever uses a demo still, it carries
  the label too.
- **No redistribution.** Clips are trimmed and re-encoded, with no download links and no gallery of files.
- **Credit**, though not required: author and page link in `ProjectVersion.metadata`, shown in the player's demo notice.
- **Real work replaces all of it** when `PORTFOLIO_SOURCE` flips to `supabase`.

### Processing pipeline (local, after the manual download)

`scripts/media/process-demo.mjs` lives in the project but loads `ffmpeg-static` and `sharp` through `createRequire` from a
path given as an argument. They are installed in the scratchpad, so the project stays free of them. Not yet run.

1. **Frame check first.** One frame per second into a contact sheet per clip. I look for logos, readable text, and anything
   that breaks the rules above. A failing clip is swapped for its alternate.
2. **Video.** Trim to 8 to 12 seconds. 1080p, no audio: clips are shown silent, which is what makes `zxx` honest. Short
   keyframe spacing keeps seeks quick, which matters for position restore.

   ```
   ffmpeg -ss <start> -t <len> -i source.mp4 -an -vf "scale=1920:-2:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow
     -crf 23 -maxrate 4500k -bufsize 9000k -profile:v high -level 4.1 -g 48 -keyint_min 24 -sc_threshold 0 -movflags +faststart video.mp4
   ```

3. **Stills, from the 4K source.** Sharper than the video, and a 4:5 crop needs the height: 4K gives 1728 by 2160, 1080p only
   864 by 1080. Card at 480, 720, 960 and 1440. Wide at 1280 and 1920. `sharp().webp({ quality: 78, effort: 6 })`. The
   frame time and `focusX` per clip are recorded in `scripts/media/demo-sources.json`.
4. **Dominant colour** from `sharp().stats().dominant` on the crop, lightness clamped to 28 percent. Same rule as uploads.
5. **Manifest data.** The script writes sizes, colours and durations to `src/lib/portfolio/demo/assets.json`. `ffmpeg-static`
   ships no ffprobe, so these come from parsing `ffmpeg -i`.

**Target weight: under 32 MB in the repo, ceiling 40 MB.** Worst case at the bitrate cap is 34 MB for six 10-second clips,
plus about 5 MB of stills and a few KB of subtitles. These are estimates. If over, drop the noisiest clips to `-crf 25`.

### Subtitles and versions, shown honestly

Four shared files, `public/demo/subtitles/sample.{en,fr,es,ar}.vtt`, about 300 bytes each. Every clip runs at least 8 seconds,
so one set fits all. Same three cues in each language:

```
WEBVTT

00:00.000 --> 00:03.000
Demonstration subtitles.

00:03.000 --> 00:06.000
This sample has no dialogue.

00:06.000 --> 00:08.000
Stock footage. Not a Mayor Studios project.
```

The French, Spanish and Arabic are my own translations, not reviewed by a native speaker. That is fine for a labelled sample,
and the Arabic exercises right-to-left cues.

| Slug | Clip | Versions | Subtitles | What it exercises |
|---|---|---|---|---|
| `brand-film-sample` | 10140737 | `zxx`, none | en, fr, es | One version, no picker |
| `narrative-sample` | 8680224 | `en`, `fr`, `ar`, subtitled, same file | One each | Version picker, position kept, RTL |
| `music-video-sample` | 8996266 | `zxx`, none | None | The no-subtitles state |
| `social-ad-sample` | 8042293 | `zxx`, none | en, es | Two tracks |
| `documentary-sample` | 5635826 | `en`, `fr`, subtitled, same file | One each | Two-version picker |
| `corporate-sample` | 7223709 | `zxx`, none | en, fr, ar | RTL through the subtitle select |

Cards read "No dialogue · Subtitles: English, French, Spanish" or "Subtitles: English, French, Arabic". No card or picker ever
reads as if a dub exists.

## 7. Iteration 1 scope

No Supabase in this iteration. No new dependency in the project. Everything reads through the repository.

**`src/lib/portfolio/`**
- `demo/manifest.ts`: six projects, `isDemo: true`.
- `demo/assets.json`: generated by the pipeline.
- `demo/repository.ts`: `PortfolioRepository` over the manifest.
- `index.ts`: `getPortfolio()`, chosen once from `PORTFOLIO_SOURCE`. Unknown value throws. There is no code path from a
  failed read to the demo, so the outage trap cannot recur.
- `selectors.ts`: `formatDuration`, `formatDurationIso`, `getDisplayDuration`, `getVideoLanguages`,
  `getSubtitleLanguages`, `getLanguageSummary`, `getCategories`, `filterProjects`.
- `language-names.ts`: `getLanguageName(tag, locale)` through `Intl.DisplayNames`, with "zxx" handled by a message key.

**`src/app/[locale]/work/[slug]/`**
- `page.tsx`: server component, `await params` (a Promise in this Next.js), resolves through the repository, `notFound()` on
  null, plain working layout.
- `error.tsx`: a rejected read is an error state, not a 404 and not sample content.
- `not-found.tsx`, `page.module.css`.

**`src/components/portfolio/player/`**
- `VideoPlayer.tsx`: client component with native video, version `<select>`, subtitle `<select>`, position kept on
  switch, error states and the demonstration label.
- `VideoPlayer.module.css`: tokens and logical properties only.

**`scripts/media/`**: `process-demo.mjs` and `demo-sources.json`, which records source URLs, authors, licence field, frame
times and focal points. It is not under `public/`, so it is not served.

**`public/demo/`**: `<slug>/video.mp4`, `<slug>/card-{480,720,960,1440}.webp`, `<slug>/wide-{1280,1920}.webp`,
`subtitles/sample.<lang>.vtt`.

**Blocked on:** the six manual downloads for the media itself, and the `types.ts` changes. The code can start without the
files. The demo cards cannot look right until they arrive.

**Needed from others (not my files)**
- Lead: the `types.ts` changes above, and ownership of `src/app/api/playback/**` and `src/app/api/subtitles/**` for
  Iteration 3.
- Quality Engineer: the `src/proxy.ts` matcher must exclude `/api` and `/demo`. CSP must allow `media-src` and `img-src`
  for `bpxlgvhtteplbzyezmqt.supabase.co`, and `connect-src` for `bpxlgvhtteplbzyezmqt.storage.supabase.co`, because the
  tus endpoint uses the direct hostname. Selector unit tests are theirs under the ownership table.
- Creative Director: confirm the card ratio before I run the pipeline. `messages/en.json` keys for the player (play, version,
  subtitles, off, demo notice, the three errors, retry, no dialogue, subtitled). Cards render
  `<img srcSet sizes loading="lazy" decoding="async">` with `object-position` from the focus values, on a `dominantColor`
  background. No re-encoding.

**Before Iteration 3**
- The dev server now runs on port 3000. Supabase auth redirect URLs were set up for 3001, so `http://localhost:3000/**`
  must be added before login is tested. `ARCHITECTURE.md` section 2 still says 3001.
- Free projects pause after a week of inactivity, which would stop playback for every visitor. A deployed site needs a
  daily keep-alive. That is a new scheduled resource, so it is the lead's decision.

## 8. Verified and not verified

**Verified:**
- Next.js, in `node_modules/next/dist/docs/`: `cacheLife`, `'use cache'` cannot read cookies, `updateTag` scope, the
  `revalidate` failure behaviour (ISR guide), `history.replaceState`, `params` as a Promise, route handlers at request time,
  `proxy.ts`. `cacheComponents: true` is set in `next.config.ts`.
- Pexels: range 206 and `video/mp4` for all twelve files, and the sizes shown. The `license` field in page data. Twelve stills
  viewed as 4:5 crops, about 100 more viewed small. The terms clause quoted above, from the saved copy.

**Not verified:**
- No clip has been watched. No file has been downloaded or processed. Weights are estimates.
- No SQL has been run, and nothing has touched Supabase. I did not query the live project, so its policy names are assumed.
- From memory, to test at the start of Iteration 3: RLS allowing `createSignedUrl` for anon; range and seek on a signed URL
  through a 302 in Chrome, Firefox and iOS Safari; tus under the new insert policy; `remove()` under RLS; the
  `storage.objects` metadata keys used by the ready trigger; `@supabase/ssr` cookies being readable from JavaScript; Safari
  WebP encoding; canvas behaviour on iOS; last-good-data behaviour on the eventual host.

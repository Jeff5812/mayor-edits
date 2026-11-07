# Mayor Edits: architecture

A single-page video editing portfolio. Mayor, the owner, uploads and manages his own samples. Visitors watch them and
get in touch by WhatsApp or email. It is not a platform: new features need a concrete reason.

The longer plans from earlier builds (brief, design system, media and quality plans) are in git history at the baseline
commit on `main`. Where they disagree with this file, this file wins.

## Services

| Service | Plan | Holds | Limits that matter |
|---|---|---|---|
| Vercel | Hobby (free) | The site | Functions cap requests at 4.5 MB, so video never passes through it. Cron runs once a day |
| Supabase | Free | `projects`, `admins`, login, `posters` bucket | Pauses after a week of low database activity, hence `/api/keepalive` |
| Cloudflare R2 | Pay as you go | Video files, private | 10 GB free, then $0.015 per GB a month. Bandwidth is free. Unfinished uploads vanish after 7 days |

## How it works

**Public page.** [src/app/page.tsx](../src/app/page.tsx) reads `getPublishedProjects()`, which is cached with the
`portfolio` tag. Every admin change expires that tag, so published changes appear at once with no redeploy, and ordinary
visits never touch the database. The page never reads cookies and never receives a video's storage key.

**Reel layout.** [PortfolioGrid.tsx](../src/components/site/PortfolioGrid.tsx) always shows at least four positions: the
lead beside the headline, then three across. A position with no video shows only the default frame, with no name or
running time. Those appear only on a real project, which the database guarantees has a finished video.

**Upload.** The browser asks `prepareVideoUpload` what to send. It checks the admin, then returns signed links for each
missing 8 MiB part. The browser sends the parts straight to R2, three at a time, with retries
([multipart-session.ts](../src/lib/media/multipart-session.ts)). `finalizeVideoUpload` lists what R2 holds, completes the
upload, checks the size, then updates the project. R2 remembers which parts arrived, so a pause, a dropped connection or a
closed tab carries on when the same file is chosen again.

**Uploading from the reel.** [owner-session.ts](../src/lib/auth/owner-session.ts) checks for a session cookie, and only then
downloads the Supabase client and asks `is_admin`. [OwnerControls.tsx](../src/components/site/OwnerControls.tsx) renders
nothing for anyone else. Hovering a frame offers "Upload a video", which opens the admin area's own `ProjectEditor` in a
dialog, so there is one form and one upload path. The page itself stays static and identical for everyone.

**Playback.** Nothing loads until a visitor presses play. `/api/playback/[id]` reads the project as an anonymous visitor,
so row-level security only finds published ones, then returns a one-hour signed link. The player fetches a new link if one
expires, and that also fails once a project is unpublished.

**Posters.** A frame from the video is saved automatically after an upload, and the owner can replace it. They are resized
in the browser to at most 1600 px and about 350 KB, because Supabase Free has no image transforms.

## Security

- Every server action calls `assertAdmin()` first. The proxy only refreshes sessions and redirects: it is a convenience.
- Row-level security with `is_admin()` is what enforces access in the database and the posters bucket.
- R2 keys are server-only and must never have a `NEXT_PUBLIC_` prefix. The app needs no Supabase service-role key at all.
- Owner controls on the public page only decide what to show. They grant nothing.

## Design

Dark and cinematic. Display type is League Gothic in capitals, body is Onest, and timecode digits are Chivo Mono. Depth comes
from one material, `.plate`, and one button surface, `.btn`, both in [globals.css](../src/app/globals.css). Change them there
and every card, panel and button follows, admin included. The black never sits alone: its partners are the two colours of a film
grade, ember (`--ember`, the one accent) and teal (the far end of its light). Every button is a pill of black glass with a lit
edge, white-hot at the left and cooling to teal, and the nav is the same pill at full length. Panels pick up the same light from
their corners, and headlines warm to copper at their foot. Life comes from the language of editing: the header's timeline
and scroll playhead, the running timecode, the film strip, the leader sweep and light leak on empty frames, and letters
that catch the light. Everything moving is transform or opacity, and all of it stops for people who ask for less motion.

The admin ("the cutting room") is the same design, not a second one: the same header bar, cards, frames and buttons, with its
shared classes in [styles.ts](../src/components/admin/styles.ts) and only a few pieces of its own at the end of the components
layer in globals.css: the readout, the timeline meter used for storage and upload progress, the labels laid over frames, and the
drop area.

## How the owner gets in

The owner opens `/admin` on any device, by address or through the small "Owner sign in" link in the public footer. Keeping that
address quiet is not what protects anything, so the link costs nothing: every admin page and action checks the session and
`is_admin()` on the server. Signing in is per device, and public sign-ups are off. To add an administrator, create the user in
Supabase (Authentication, Users), then add their id to `public.admins`.

## Rules that are not obvious from the code

- **Fonts** are self-hosted through `@fontsource-variable`. `next/font/google` timed out on the development machine.
- **`turbopack.root`** must stay set, because a stray `package.json` sits in the home folder.
- **Cache Components** is on, so `dynamic` and `revalidate` exports are errors. Admin pages use `export const instant = false`.
- **Playwright** runs one worker in real Chrome, because Playwright's own browser cannot play H.264.
- **Dev CSS.** After editing a CSS file, the dev server can keep serving the old CSS. Stop it and delete `.next/dev/cache`.
- **Migrations.** The Supabase connector declines destructive SQL, so those are run by a person in the SQL Editor.
- **Test footage** must be generated. The owner's `Videos` folder holds personal files, and stock sites forbid scripted access.

## Watching a video

Nothing plays or downloads when the page loads. [CardPlayer](../src/components/video/CardPlayer.tsx) is a card's frame: pointing
at it shows the play button and a few silent seconds of the video, and pressing play starts it there, with sound and full controls
([VideoPlayer](../src/components/video/VideoPlayer.tsx)), and a button for full screen. One video plays at a time, and it pauses if
scrolled away. Previews skip phones, people who asked for less motion, and data-saver connections.

## Subtitles

Any video can have one WebVTT file per language, stored beside it in R2 at `<project-id>/subtitles/<language>.vtt`, so deleting a
project removes them with its folder and no database change was needed. The owner adds a `.srt` or `.vtt` on the project page
([SubtitlesPanel](../src/components/admin/SubtitlesPanel.tsx)). The player asks `/api/subtitles/[id]` which languages exist and
offers them, off by default, and only the chosen language's file downloads. Those files come through
`/api/subtitles/[id]/[lang]` on the site's own address, because a browser will not load a subtitle track from another address
unless the video asks for permission too. Both routes answer only for published projects. The player draws the words itself so they
sit clear of the controls, except in an iPhone's own full screen, where only the browser can draw over the video. A browser never
retries a track file that failed, so the player asks twice more with a new track element, then tells the viewer.

## Tests

`npm run test:unit` covers the upload logic with stand-ins for R2. `npm run test:e2e` runs
[e2e/owner-journey.live.spec.ts](../e2e/owner-journey.live.spec.ts) against the real services. It needs a temporary
administrator and a generated MP4, which it describes at the top.

## Status

- 2026-11-04: restored and trimmed the old build's upload and admin code, moved video to R2, built the public page and
  upload from the reel. Unit tests pass, and the production build passes against a local stand-in.
- 2026-11-05: the migration is applied and the live test passes against real Supabase and real R2, on the dev server: upload,
  playback with seeking, publish, edit, unpublish, duplicates, delete and upload from the reel. A separate run of a 119 MiB
  upload through the page survived a pause, a 45-second connection drop and a reload, sending no confirmed part twice.
- 2026-11-07: deployed to production at https://mayor-edits.vercel.app (Vercel project `mayor-edits`, deployed from this folder
  with the Vercel CLI). Checked live as a visitor: the page, the sign-in redirect, the public routes' refusals, a real play
  with subtitles, and R2 accepting uploads from that address while refusing others.
- **Not yet proven:** a full 500 MB upload, and an owner's upload on the live site (the test administrator was removed first).
- Measured on one slow connection (about 1 to 8 Mbps down) on 2026-11-05: a page view requests nothing from R2, and 2 Mbps
  video played smoothly where 8 Mbps kept stalling. Each video is one file at one quality, so bitrate decides who can watch it.

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
and every card, panel and button follows, admin included. Life comes from the language of editing: the header's timeline
and scroll playhead, the running timecode, the film strip, the leader sweep and light leak on empty frames, and letters
that catch the light. Everything moving is transform or opacity, and all of it stops for people who ask for less motion.

## Rules that are not obvious from the code

- **Fonts** are self-hosted through `@fontsource-variable`. `next/font/google` timed out on the development machine.
- **`turbopack.root`** must stay set, because a stray `package.json` sits in the home folder.
- **Cache Components** is on, so `dynamic` and `revalidate` exports are errors. Admin pages use `export const instant = false`.
- **Playwright** runs one worker in real Chrome, because Playwright's own browser cannot play H.264.
- **Dev CSS.** After editing a CSS file, the dev server can keep serving the old CSS. Stop it and delete `.next/dev/cache`.
- **Migrations.** The Supabase connector declines destructive SQL, so those are run by a person in the SQL Editor.
- **Test footage** must be generated. The owner's `Videos` folder holds personal files, and stock sites forbid scripted access.

## Tests

`npm run test:unit` covers the upload logic with stand-ins for R2. `npm run test:e2e` runs
[e2e/owner-journey.live.spec.ts](../e2e/owner-journey.live.spec.ts) against the real services. It needs a temporary
administrator and a generated MP4, which it describes at the top.

## Status

- 2026-11-04: restored and trimmed the old build's upload and admin code, moved video to R2, built the public page and
  upload from the reel. Unit tests pass, and the production build passes against a local stand-in.
- **Not yet proven against real services:** upload, playback, publish, delete and upload from the reel. The live test is
  written. It needs the migration in `supabase/migrations/20261104120000_realign_single_page_r2.sql` to be run, and R2 keys
  in `.env.local`.

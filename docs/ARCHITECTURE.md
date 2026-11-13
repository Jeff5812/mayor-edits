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
| Cloudflare Workers AI | Same account as R2 | Nothing: it hears and translates for automatic subtitles | 10,000 free neurons a day. A 19-minute film costs about 900 to hear, plus a little to translate |

## How it works

**Public page.** [src/app/page.tsx](../src/app/page.tsx) reads `getPublishedProjects()`, which is cached with the
`portfolio` tag. Every admin change expires that tag, so published changes appear at once with no redeploy, and ordinary
visits never touch the database. The page never reads cookies and never receives a video's storage key.

**Reel layout.** [PortfolioGrid.tsx](../src/components/site/PortfolioGrid.tsx) shows only the films there are. The first, the
featured one, is the lead: the one big frame on every screen, beside the headline on desktop. On a phone and a tablet each other
film is a row beneath it, its frame beside its title. On desktop the others fill rows of two, then three, so a row is never left
half empty ([reel-layout.ts](../src/components/site/reel-layout.ts), with a test). A lone second film takes the lead's width
beneath it, and the headline stays beside the two as the page scrolls. Titles read as names everywhere, because the page shows
them the way saving tidies them, underscores as spaces, even for titles saved before that rule. Titles stop at two lines, a phone's rows all share the
height of their picture, and the frames of one desktop row share one height. The default frame shows only while there is no film
at all. The page is the same for everyone, signed in or not: uploading and editing only happen in the admin. Checked with 20 and
25 films at phone, tablet and desktop sizes: every row stays full, with no sideways scroll. As in any video gallery, each frame
carries its running time in a corner chip, and a film a visitor stopped part-way through shows how far they got.

**Upload.** The browser asks `prepareVideoUpload` what to send. It checks the admin, then returns signed links for each
missing 8 MiB part. The browser sends the parts straight to R2, three at a time, with retries
([multipart-session.ts](../src/lib/media/multipart-session.ts)). With no connection at all it waits, however long, and carries
on by itself, and a part with no progress for a minute counts as dropped and is sent again. `finalizeVideoUpload` lists what R2
holds, completes the upload, checks the size, then updates the project. R2 remembers which parts arrived, so a pause, a
dropped connection or a closed tab carries on when the same file is chosen again.

**Uploads belong to the tab.** [upload-registry.ts](../src/lib/media/upload-registry.ts) holds one upload per project for the
life of the tab, so the owner can move around the admin, or start the next project, while one runs. A project's page only shows
its upload, and the admin header shows any that are running. When a new video arrives the registry saves the thumbnail chosen
with it, or else takes a frame, starts its automatic subtitles, keeps a phone's screen on while anything runs, and asks before
the tab is closed.

**Playback.** Nothing loads until a visitor presses play. `/api/playback/[id]` reads the project as an anonymous visitor,
so row-level security only finds published ones, then returns a one-hour signed link. The player fetches a new link if one
expires, and that also fails once a project is unpublished.

**Thumbnails.** Every card is 16:9, so every thumbnail is too: 1280 x 720, the size of a YouTube thumbnail. An image of any other
shape is cropped to its 16:9 middle in the browser, never enlarged, and kept near 350 KB, because Supabase Free has no image
transforms ([validation.ts](../src/lib/media/validation.ts), with tests). An image already that shape and light enough is kept
untouched. The owner can choose one on "New project", alongside the video, or on the project page, where the panel shows it at
the card's shape, says the size it was saved at, and offers a frame of the video found with a slider. Without one, a frame from
the video is taken after the upload. The database still calls it `poster_path`.

## Security

- Every server action calls `assertAdmin()` first. The proxy only refreshes sessions and redirects: it is a convenience.
- Row-level security with `is_admin()` is what enforces access in the database and the posters bucket.
- R2 keys are server-only and must never have a `NEXT_PUBLIC_` prefix. The app needs no Supabase service-role key at all.
- The public page has no owner controls at all, so it looks the same to every device, signed in or not.
- "Sign out on all devices", in the admin's account menu, ends every session of the account at once.

## Design

Dark and cinematic. Display type is League Gothic in capitals, body is Onest, and timecode digits are Chivo Mono. Depth comes
from one material, `.plate`, and one button surface, `.btn`, both in [globals.css](../src/app/globals.css). Change them there
and every card, panel and button follows, admin included. The black never sits alone: its partners are the two colours of a film
grade, ember (`--ember`, the one accent) and teal (the far end of its light). Every button is a pill of black glass with a lit
edge, white-hot at the left and cooling to teal, and the nav is the same pill at full length. Panels pick up the same light from
their corners, and headlines warm to copper at their foot. Life comes from the language of editing: the header's timeline
and scroll playhead, the running timecode, the film strip, the leader sweep and light leak on an empty frame, and letters
that catch the light. Everything moving is transform or opacity, and all of it stops for people who ask for less motion.

The admin ("the cutting room") is the same design, not a second one: the same header bar, cards, frames and buttons, with its
shared classes in [styles.ts](../src/components/admin/styles.ts) and only a few pieces of its own at the end of the components
layer in globals.css: the readout, the timeline meter used for storage and upload progress, the labels laid over frames, and the
drop area.

## How the owner gets in

The owner opens `/admin` on any device, by address, through the footer link "The cutting room", or by pressing the header logo
three times quickly ([BrandLink](../src/components/site/BrandLink.tsx)). At the owner's request the public page never says
"sign in": the footer link is worded like any studio link, and "The cutting room" is also the admin area's own name. Keeping the
address quiet is not what protects anything: every admin page and action checks the session and `is_admin()` on the server. Signing in is per device, and public sign-ups are off. To add an administrator, create the user in
Supabase (Authentication, Users), then add their id to `public.admins`.

Security is kept basic on purpose: there is one owner, and he only ever signs in. If he forgets his password, "Forgot your
password?" emails him a link to choose a new one, with no one else needed. Supabase sends it through a Gmail account the
developer set up once, because its built-in sender only reaches the Supabase team ([FORGOTTEN_PASSWORD.md](FORGOTTEN_PASSWORD.md)).
A link that lands on the site's plain address, as links sent from the Supabase dashboard do, is passed on to the page for
choosing a password by [AuthLinkHandoff](../src/components/site/AuthLinkHandoff.tsx).

## Rules that are not obvious from the code

- **Fonts** are self-hosted through `@fontsource-variable`. `next/font/google` timed out on the development machine.
- **`turbopack.root`** must stay set, because a stray `package.json` sits in the home folder.
- **Cache Components** is on, so `dynamic` and `revalidate` exports are errors. Admin pages use `export const instant = false`.
- **Playwright** runs one worker in real Chrome, because Playwright's own browser cannot play H.264.
- **Dev CSS.** After editing a CSS file, the dev server can keep serving the old CSS. Stop it and delete `.next/dev/cache`.
- **Pages stay alive when left.** With Cache Components, Next.js hides a page the owner leaves instead of removing it, and
  shows it again on return (React's `Activity`). Effects clean up and re-run, but state and the DOM stay. So a video pauses itself
  in a `useLayoutEffect` cleanup (a hidden video keeps playing otherwise), "New project" is keyed by `bfcacheId` so each visit
  starts empty, messages about something just done clear on leaving, and uploads live in the tab rather than in a page. Tests
  should use visibility-aware locators, because hidden pages are still in the document.
- **Migrations.** The Supabase connector declines destructive SQL, so those are run by a person in the SQL Editor.
- **Test footage** must be generated. The owner's `Videos` folder holds personal files, and stock sites forbid scripted access.

## Watching a video

Nothing plays or downloads when the page loads. [CardPlayer](../src/components/video/CardPlayer.tsx) is a card's frame: pointing
at it shows the play button and a few silent seconds of the video, and pressing play starts it there, with sound and full controls
([VideoPlayer](../src/components/video/VideoPlayer.tsx)), and a button for full screen. One video plays at a time, and it pauses if
scrolled away. Previews skip phones, people who asked for less motion, and data-saver connections.

A touch screen has no hover and a phone's frames are too small to watch in, so there play opens the film full screen, and leaving
full screen puts the card back. An iPhone cannot put a page in full screen, so its film leaves out `playsInline` and opens the
iPhone's own player.

The player keeps the habits of the big video sites. Space or K plays, J and L skip ten seconds, the arrows five, 0 to 9 jump
through the film, C turns subtitles on and off, the < and > keys change the speed, M mutes and F goes full screen. Pointing along
the seek line shows the time there, two quick taps on either side of a touch screen skip, full screen shows the title along the
top, and picture in picture is offered where the browser has it. This browser remembers the volume, the subtitle language, and
where each film was left ([watch-progress.ts](../src/lib/media/watch-progress.ts), with tests), so play carries on from there on a
later visit too. Nothing about viewing leaves the device.

## Subtitles

Any video can have one WebVTT file per language, stored beside it in R2 at `<project-id>/subtitles/<language>.vtt`, so deleting a
project removes them with its folder and no database change was needed. The owner adds a `.srt` or `.vtt` on the project page
([SubtitlesPanel](../src/components/admin/SubtitlesPanel.tsx)). The player asks `/api/subtitles/[id]` which languages exist and
offers them, off by default, and only the chosen language's file downloads. Those files come through
`/api/subtitles/[id]/[lang]` on the site's own address, because a browser will not load a subtitle track from another address
unless the video asks for permission too. Both routes answer only for published projects. The player draws the words itself so they
sit clear of the controls, except in an iPhone's own full screen, where only the browser can draw over the video. A browser never
retries a track file that failed, so the player asks twice more with a new track element, then tells the viewer.

**Automatic subtitles** spare the owner from making files at all. When a new video finishes uploading, or when the owner presses
"Make subtitles automatically", the owner's browser decodes the video's sound at 16 kHz and cuts it into pieces of under half a
minute, at quiet moments so no word is split ([speech-audio.ts](../src/lib/media/speech-audio.ts)). Each piece goes through a
server action to Whisper on Cloudflare Workers AI, which returns timed text and the spoken language
([auto-subtitles.ts](../src/lib/media/auto-subtitles.ts), [workers-ai.ts](../src/lib/ai/workers-ai.ts)). The lines are then
translated by Gemma, in batches that must come back line for line, into the languages of the featured film, or of the first film
with subtitles. Every file is saved through the same check as an uploaded one. It only ever adds missing languages, so a file
corrected by hand is never replaced: to remake one, remove it first. The token stays on the server, in `CLOUDFLARE_AI_TOKEN`, and
without it the feature hides itself. For a stored video the browser fetches the video first, which needs the bucket's CORS rules
to allow GET from the site. If that fails, the panel asks for the file on the device instead.

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
- 2026-11-10: admin sweep. Fixed a video playing on after leaving its page, "New project" coming back with the last project,
  an upload panel left frozen after leaving mid-upload, an old video's running time kept for a new one, and more than one
  featured film. Uploads now carry on across the admin, wait out a lost connection, retry a stalled part and keep a phone's
  screen on. The public page lost its owner controls. Driven in a real browser against a local stand-in for Supabase and the
  real R2 bucket: running times re-checked from the real files, playback stopping on leaving, a 15 MB upload finishing while
  the owner was on another page, its poster, publishing, a fresh "New project", one featured film, deleting, and signing out.
- 2026-11-12: thumbnails as 16:9 at 1280 x 720 with a size note, a frame slider, and a choice on "New project"; automatic
  subtitles; a running-time chip on every frame, and the reel checked with 20 and 25 films; the player's keys, seek-line time,
  double tap, picture in picture, title in full screen, and remembered volume and viewing position. Driven in a real browser
  against local stand-ins: the player with the real videos, and the admin with the real R2 bucket.
- **Not yet proven:** a full 500 MB upload, an owner's upload on the live site (the test administrator was removed first), and
  automatic subtitles end to end, which wait for the Cloudflare AI token.
- Measured on one slow connection (about 1 to 8 Mbps down) on 2026-11-05: a page view requests nothing from R2, and 2 Mbps
  video played smoothly where 8 Mbps kept stalling. Each video is one file at one quality, so bitrate decides who can watch it.

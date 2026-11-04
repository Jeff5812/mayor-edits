# Mayor Studios: architecture and working agreement

Owner: lead architect. Interprets `BRIEF.md`. If they conflict, the brief wins and the lead is told.

## 1. State found on 2026-11-03

- Fresh folder. The previous project's folder is gone from disk. A backup of it is reference material only.
- Supabase project `bpxlgvhtteplbzyezmqt`, Free plan, in the client's org. Named "True Crime Video Editing", healthy.
  Contains: `admins` (1 row), `projects` (0 rows, single-video shape), `testimonials` (0), `contact_messages` (0).
  Buckets: `videos` (private, 50 MB limit), `posters` (public, 5 MB limit). No stored objects.
  One auth user, the owner, who is the one admin row. Public sign-ups are off.
- The Supabase connector is available to the lead this session, so migrations can be applied directly once approved.
- Vercel account exists. Nothing is deployed for this project and hosting is undecided.
- No git history. No commits or deploys without the user's say-so.

## 2. Constraints that are not up for debate

| Constraint | Why |
|---|---|
| Backend is Supabase only. No Cloudinary, R2, or Mux. | The client rejected them. Brief: no unnecessary services. |
| No Docker. | Brief. |
| Dev server on port **3000**, as the client asked on 2026-11-04. Check the port is free first, and never stop whatever else holds it. | ShopWise also uses 3000, so the two cannot run together. Supabase auth redirect URLs were set up for 3001, so add 3000 before testing login in Iteration 3. |
| Fonts self-hosted through `@fontsource-variable/*`, never `next/font/google`. | Google font downloads time out on this machine and returned 500s on every page. |
| Playwright with `--workers=1`, one run at a time. Only the lead restarts the dev server. | Parallel runs overload the server and cause false failures. |
| `turbopack.root` must stay set. | A stray `package.json` sits in `C:\Users\DELL`; the tooling must not treat home as the workspace. |
| Keep agent work bounded. | Three parallel agents have hit the 5-hour usage limit before. |
| Do not use anything from the user's `Videos` folder. | Those are not the studio's work. |
| No scripted access to stock sites. Never change a User-Agent to get past a refusal. Read a source's terms of service as well as its licence before touching it. | On 2026-11-04 scripted requests to Pexels, sent with a browser User-Agent after its normal fetch was refused, ran into a terms clause against automatic collection. Stock files come from a person downloading them by hand, or from the official API with the client's own key. |

Supabase Free limits shape the product: **50 MB per file, 1 GB total storage, 5 GB monthly egress, no image
transformations**, and projects pause after a week of inactivity. Thumbnails must therefore be sized before upload, and
video must never load until asked for.

## 3. Stack

Next.js 16 App Router, React 19, TypeScript strict. **Plain CSS: design tokens in `globals.css`, CSS Modules per
component.** No Tailwind: it is an extra dependency, and CSS logical properties handle RTL natively.
`next-intl` for interface language. `@supabase/ssr` + `supabase-js` for data and auth (Iteration 3). `tus-js-client`
for resumable uploads with progress (Iteration 3). Vitest and Playwright for tests.

## 4. File ownership

Nobody edits a file they do not own. Ask the lead, who routes the change.

| Owner | Files |
|---|---|
| **Lead** | `src/lib/portfolio/types.ts`, `src/lib/contact.ts`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `src/app/[locale]/[...rest]/page.tsx`, `next.config.ts`, `package.json`, `docs/ARCHITECTURE.md`, `docs/BRIEF.md` |
| **Creative Director** | `src/app/globals.css`, `src/app/icon.svg`, `src/app/global-error.tsx`, `src/app/[locale]/not-found.tsx`, `src/app/[locale]/error.tsx`, `src/styles/**`, `src/components/brand/**`, `src/components/layout/**`, `src/components/home/**`, `src/components/ui/**`, `src/components/portfolio/*` (not `player/`), `messages/en.json`, `docs/DESIGN-SYSTEM.md` |
| **Media Engineer** | `src/lib/portfolio/**` (not `types.ts`), `src/lib/supabase/**`, `supabase/migrations/**`, `public/demo/**`, `scripts/media/**`, `src/components/portfolio/player/**`, `src/components/studio/**`, `src/app/[locale]/work/**`, `src/app/[locale]/studio/**`, `src/app/api/playback/**`, `src/app/api/subtitles/**`, `docs/MEDIA-ARCHITECTURE.md` |
| **Quality Engineer** | `src/i18n/**`, `src/proxy.ts`, `messages/*.json` except `en.json`, `e2e/**`, `tests/**`, `playwright.config.ts`, `vitest.config.ts`, `docs/QUALITY-PLAN.md` |

Need a dependency? Ask the lead, who is the only one running `npm install`.

## 5. Shared interfaces

`src/lib/portfolio/types.ts` is the contract between the UI and the data layer. Cards and player read `Project`, never a
database row. The page gets projects from a repository, so demo content and Supabase are interchangeable:

```
page.tsx -> getPortfolio() -> PortfolioRepository -> demo manifest | Supabase
```

Rules:

- **Interface locale and video language are unrelated.** `ProjectVersion.language` is the language spoken in a video.
- **Owner-entered content is not translated.** Title and description show as written. Category labels are UI text.
  Video language names come from `Intl.DisplayNames(locale)`.
- **Demo content is labelled** through `Project.isDemo`, on each card and in the player.
- **An outage must not show sample cards.** A failed query is an error state, never a fallback to demo data.
- Cards link to `/work/[slug]`, a real URL a client can be sent directly.
- All design values come from tokens. CSS uses logical properties (`margin-inline-start`, `inset-inline-end`).

Exact names, so three agents can build at once. Use these. Ask the lead before changing one.

| Module | Exports |
|---|---|
| `src/i18n/locales.ts` | `LOCALES: readonly LocaleEntry[]`, `LocaleEntry`, `ReviewStatus`, `getLocaleEntry(code): LocaleEntry \| undefined` |
| `src/i18n/routing.ts` | `routing`, `AppLocale` |
| `src/i18n/navigation.ts` | `Link`, `getPathname`, `usePathname`, `useRouter`, `redirect` |
| `src/i18n/format.ts` | `videoLanguageName(tag, locale): string`. Server only |
| `src/i18n/seo.ts` | `buildMetadata(locale, pathname): Promise<Metadata>` |
| `src/i18n/client-namespaces.ts` | `CLIENT_NAMESPACES` |
| `src/lib/contact.ts` | `CONTACT` |
| `src/lib/portfolio/index.ts` | `getPortfolio(): PortfolioRepository`, from `PORTFOLIO_SOURCE`, default `demo` in Iteration 1 |
| `src/lib/portfolio/selectors.ts` | `formatDuration(seconds)`, `formatDurationIso(seconds)`, `getDisplayDuration(project)`, `getVideoLanguages(project)`, `getSubtitleLanguages(project)`, `getLanguageSummary(project)`, `languageCode(tag)` |
| `src/lib/portfolio/demo/manifest.ts` | `DEMO_PROJECTS: Project[]`, pure data with no `server-only` |
| `src/components/layout/` | `SiteHeader`, `SiteFooter`, `SkipLink`, `DraftNotice`, all named exports with no props |
| `src/components/home/` | `Hero`, `Services`, `About`, `Contact`, all named exports with no props |
| `src/components/portfolio/PortfolioSection.tsx` | `PortfolioSection({ projects }: { projects: Project[] })` |

`getLanguageSummary(project)` returns `{ spoken: string[]; subtitled: string[]; noDialogue: boolean }`, holding BCP 47 tags.
`languageCode(tag)` returns the display form (`EN`, or `PT-BR` when needed). Neither uses `Intl`.

## 6. Iterations

1. **Design foundation (now).** Brand, visual system, type, navigation, hero, portfolio placement, on real `Project` data
   from the demo repository. Plus a plain working player page so no card is a dead click.
2. Portfolio UI: cards, grid, hover, cinematic player, project detail.
3. Media management: secure auth, real uploads, cards on live data.
4. Languages: all interface translations, video versions, Arabic RTL testing.
5. Visual refinement from screenshots.
6. Final integration and full testing.

## 7. Working agreement

1. Each agent reviews its area independently and reports before major implementation.
2. The lead reconciles the reports and fixes the interfaces.
3. Agents implement only in their own files, in dependency order.
4. The lead integrates, runs the app, and inspects screenshots.
5. Nobody claims something works without having run it.

## 8. Decisions from the first review round

Where the three plans differ, this section wins. Rendering details stay in `DESIGN-SYSTEM.md`, media in
`MEDIA-ARCHITECTURE.md`, and quality in `QUALITY-PLAN.md`.

| Topic | Decision | Why |
|---|---|---|
| Cache Components | On, with Partial Prefetching. Root layout at `src/app/[locale]/layout.tsx`, none at `src/app/layout.tsx`. Locale from `next/root-params`, no `setRequestLocale` | Tested in a scratch build, and becomes permanent in the next major release |
| Admin controls | Client `AdminGate`, Iteration 3. Public pages never read cookies | One `cookies()` read makes the home page `private, no-store` (measured) |
| Language selector | `<details>` with plain `<a>` links, listing all 17 with their status from the registry. `language-selector` test id on the `<summary>`, `language-menu` on the panel | `<details>` works with JavaScript off (Creative Director). Honest statuses and plain links (Quality Engineer) |
| Non-Latin fonts | Packages from the design system, applied only under `html:lang(ar)` and `html:lang(hi)`. Arabic in a title on an English page uses a system font. Selector items use the system stack | Keeps Arabic and Devanagari files from loading for English visitors |
| Card art | 4:5. Card files at 480, 800 and 1200 wide, never upscaled, at most 50, 110 and 200 KB. Wide files at 1280 and 1920 | Design system's widths, media plan's budget approach |
| Categories | `brand`, `short-form`, `long-form`, `documentary`, `narrative`, `music-video`. Client to confirm | Design system's reasoning, with `narrative` kept and `podcast` dropped because the brief never mentions podcasts |
| Card language text | Spoken versions as codes (`EN · FR`). Subtitles only as `Subtitles EN · FR`. `No dialogue` when there is none. Full names in hidden text | Compact like the design system, and cannot imply a dub, as the media plan requires |
| Player media | Same-origin `src` and tracks, no `crossorigin`, `preload="none"`, pause in a `useLayoutEffect` cleanup | Media plan, plus the Quality Engineer's Activity finding |
| Filters | Iteration 2. The design shows them only at 7 or more projects, and the demo has 6 | Nothing to filter yet |
| Demo footage | Neutral placeholders generated locally, with no third-party media, until the client decides where footage comes from | Section 2, Pexels terms |

## 9. Status

Update this whenever a step finishes. Background agents die with the session that launched them, so on resume, a report
counts only if it is on disk.

- 2026-11-03: scaffold complete (Next 16.4.5, React 19.3.0). First round of reviews was lost when its session ended.
- 2026-11-03: reviews relaunched from a session started inside this folder, so the three agent definitions now load as
  real agent types. That session also ended before they finished. Nothing reached the disk.
- 2026-11-04: reviews resumed from their saved transcripts. Dev server moved to port 3000 at the client's request, and
  the scaffold's `next/font/google` import removed. Waiting on `docs/DESIGN-SYSTEM.md`, `docs/MEDIA-ARCHITECTURE.md` and
  `docs/QUALITY-PLAN.md`.
- 2026-11-04: media review finished and flagged the Pexels terms (`docs/MEDIA-ARCHITECTURE.md` section 6). Scripted access
  stopped. Waiting on the client's decision about where demo footage comes from. Until then the UI uses neutral placeholders.
- 2026-11-04: all three reports on disk and reconciled in section 8. `types.ts` and a first `messages/en.json` written.
- Next: implement Iteration 1 in each owner's files, then the lead wires the layout and page, runs it and reviews screenshots.

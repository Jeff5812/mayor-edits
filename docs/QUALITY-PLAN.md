# Mayor Studios: quality plan

Owner: Quality Engineer. Status: review phase. Nothing in this plan is built in the project yet.
"Scratch app" means a throwaway build outside the project, used to test these decisions. Section 9 separates what I verified from
what I could not. Dev server: `http://localhost:3000`, started only by the lead.

## 0. Verdict: Cache Components

**Keep `cacheComponents: true` and `partialPrefetching: true` on.** next-intl 4.14.9 works with them when `request.ts` reads
`next/root-params`. Next's bundled docs also say both become permanent in the next major release, so turning them off only defers a migration.

Scratch app results, production build on Next 16.4.5 with both flags, in JavaScript:

| Test | Result |
|---|---|
| Build with root-params `request.ts`, proxy, `NextIntlClientProvider`, `usePathname` in the root layout with no Suspense | Exit 0 |
| `/`, also with `Accept-Language: yo,fr` and with a `NEXT_LOCALE=fr` cookie | 200, English, no `Set-Cookie`, no `Link` header |
| `/en`, `/en/work/demo` | 307 to `/`, `/work/demo` |
| `/ar` | `<html lang="ar" dir="rtl">`, `noindex, follow` in raw HTML |
| `/yo` (not routable), `/xx/yy` | 404 with the translated not-found page |
| Client navigation through the proxy, card to `/work/demo` and back | Works, soft navigation |
| `getTranslations` and next-intl `Link` inside `"use cache"` | Builds, correct text in each locale |
| Home with a `cookies()` hole in Suspense | `◐`, `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` |
| Home with no request-time read | `○`, `Cache-Control: s-maxage=3600, stale-while-revalidate=82800`, `x-nextjs-cache: HIT` |
| `/work/<unlisted slug>` calling `notFound()` | **HTTP 200**, not-found UI, `noindex` |
| Listed sentinel slug calling `notFound()` | 404 |
| Route Handler and Server Action, explicit `locale` | Correct text |
| Same with no `locale` | Throws: "`import('next/root-params').locale()` was used inside a Server Action" |

### Exactly how it must look

| Question | Answer |
|---|---|
| `[locale]` routing | Root layout at `src/app/[locale]/layout.tsx`. No `src/app/layout.tsx`, so `locale` is a root param. Delete the scaffold's `src/app/layout.tsx`, `page.tsx`, `page.module.css`. |
| `generateStaticParams` | On the root layout: `routing.locales.map((locale) => ({ locale }))`. With Cache Components, an empty result fails the build. |
| `setRequestLocale` | Do not use it. next-intl calls it legacy. |
| Locale in server code | `await locale()` from `next/root-params`, or next-intl's server functions. Never `requestLocale`, which reads `headers()`. |
| Server Actions, Route Handlers, `sitemap.ts` | Always `getTranslations({ locale, namespace })`. Root params throw there. |
| Suspense | Not needed for translated UI, `Link`, metadata or a cached read in the shell. Required around any `cookies()` read: outside one it is a build error. |
| `"use cache"` | On data functions. No `cookies()` inside, no signed URLs. Translated markup is already static, so it does not need caching. next-intl inside a cache scope passed the scratch test, but the maintainer called it "not really reliable" in January (#2229), so do not depend on it without a reason. |
| Unknown routes | `src/app/[locale]/[...rest]/page.tsx` calling `notFound()`, plus `src/app/[locale]/not-found.tsx`. |

```ts
// src/i18n/request.ts
export default getRequestConfig(async ({ locale }) => {
  // `locale` is set only by explicit calls: getTranslations({ locale, namespace }).
  if (!locale) {
    const param = await rootParams.locale();
    if (!hasLocale(routing.locales, param)) notFound();
    locale = param;
  }
  return { locale, messages: await loadMessages(locale), timeZone: "UTC", getMessageFallback, onError };
});
```

### Iteration 3: Supabase data plus admin-only controls

**Public pages must not read cookies.** Measured above: one `cookies()` read turns the public home page `private, no-store`, and every
visit runs the server. So the server hole in Next's auth guide belongs on `/studio/**`, not on public pages.

```tsx
// src/app/[locale]/page.tsx. No cookies() or headers(), so the route stays fully static.
<Hero />
<Suspense fallback={<GridSkeleton />}>
  <Portfolio />   {/* awaits the cached read, renders cards with next-intl outside it */}
</Suspense>
<AdminGate />     {/* client stub, renders nothing for the public */}
```

```ts
// Repository: anon client, no cookies, RLS returns published rows only.
async function listPublishedCached() {
  "use cache";
  cacheTag("portfolio");
  cacheLife("hours");
  /* query */
}
```

- **`AdminGate`** (Media Engineer) is a tiny client stub. After mount it looks for a non-secret hint cookie set at login. Only if present does it lazy-load the admin chunk, which asks the server to verify the session and shows nothing if that fails. A forged hint gains nothing, because RLS and `requireAdmin()` are the enforcement. Public HTML holds no admin UI, public first-load JS holds no `supabase-js` or `tus-js-client`, and the page stays cacheable.
- If the Media Engineer prefers a server hole, it works (`admin` rendered only with the cookie, in the scratch app), at the cost above. That is the lead's call.
- **Publishing** invalidates the `portfolio` tag from the Server Action. A third-party CDN would not see that and could serve a stale page under `s-maxage`, so the hosting decision matters before Iteration 3.
- **Signed URLs are never cached.** `videos` is a private bucket. A signed URL in the shell or a cache entry expires and breaks playback. The player requests one at play time.
- **Outage:** the repository rejects and `error.tsx` shows. I could not find how a rejected read behaves inside `"use cache"`, so this is an Iteration 3 gate, run with an unreachable Supabase URL. A paused project may also fail a build: Next documents a prerender timeout for slow cached reads.
- **`/work/[slug]`:** `projects` has 0 rows today and an empty array is a build error. Return a sentinel slug that resolves to `notFound()`.

### What keeping the flags costs

| Consequence | Handling |
|---|---|
| Unlisted `/work/[slug]` returns 200, not 404 | Accepted: it carries `noindex` and shows the right message. Tests assert the UI and `noindex`, not the status. |
| Partial prerendering is incompatible with nonce CSP (Next docs) | No nonces. `script-src 'unsafe-inline'`, compensated in section 5. |
| Visited routes stay in the DOM with `display: none` (measured: 5 `h1`s after 5 navigations) | A hidden `<video>` keeps playing (Next docs), so the player pauses in a `useLayoutEffect` cleanup. Menus close on navigation. Test-id locators use `.filter({ visible: true })`. |
| `new Date()` during render breaks prerendering | No `relativeTime` without an explicit `now`. |

## 1. Interface language architecture

**English lives at `/`, with no prefix: `localePrefix: "as-needed"`.** Clients get sent `/work/[slug]` (ARCHITECTURE section 5),
and a `/` to `/en` redirect would cost a round trip on every first visit on the slow connections we budget for.

```ts
// src/i18n/routing.ts
export const routing = defineRouting({
  locales: ROUTABLE_LOCALES,     // status !== "not-started"
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeDetection: false,        // everyone lands on English; cookie and Accept-Language are never read
  localeCookie: false,           // no Set-Cookie, which keeps public pages cacheable; the language lives in the URL
  alternateLinks: false,         // the default Link header would advertise every routable locale, drafts included
});
```

```ts
// src/proxy.ts matcher. Paths with dots skip the proxy, so slugs must match ^[a-z0-9-]+$.
export const config = { matcher: "/((?!api|_next|_vercel|.*\\..*).*)" };
```

### Locale registry: `src/i18n/locales.ts`

Pure data, safe in proxy, server and client. The single source for routing, selector, `<html>`, SEO and tests.

```ts
export type ReviewStatus = "reviewed" | "draft" | "not-started";
export interface LocaleEntry {
  code: string;                         // URL segment and messages/<code>.json
  htmlLang: string;                     // <html lang> and hreflang
  nativeName: string;                   // hand-written, never computed or translated
  dir: "ltr" | "rtl";
  status: ReviewStatus;
  review?: { by: string; on: string };  // required for "reviewed": a named fluent reader and a date
}
```

| code | htmlLang | nativeName | dir | Status, Iteration 1 |
|---|---|---|---|---|
| en | en | English | ltr | reviewed (source text, not a translation) |
| fr | fr | Français | ltr | not-started |
| es | es | Español | ltr | not-started |
| pt | pt | Português | ltr | not-started |
| de | de | Deutsch | ltr | not-started |
| it | it | Italiano | ltr | not-started |
| ar | ar | العربية | rtl | draft (needed for RTL testing) |
| zh | zh-Hans | 中文 | ltr | not-started |
| ja | ja | 日本語 | ltr | not-started |
| ko | ko | 한국어 | ltr | not-started |
| hi | hi | हिन्दी | ltr | not-started |
| yo | yo | Èdè Yorùbá | ltr | not-started |
| ha | ha | Hausa | ltr | not-started |
| ig | ig | Igbo | ltr | not-started |
| sw | sw | Kiswahili | ltr | not-started |
| ru | ru | Русский | ltr | not-started |
| tr | tr | Türkçe | ltr | not-started |

Names are hand-written because `Intl.DisplayNames` returns some in lowercase, and because Chromium returned the bare codes `ha` and `ig` (measured).
A unit test compares them case-insensitively with Node's `Intl.DisplayNames` to catch typos. A unit test also fails if `reviewed` has no
`review`, or if a locale other than `en` is `reviewed` without being on an allowlist kept in that test, so review is always a deliberate, visible edit.

### Fallback: raw keys cannot reach the page

1. **Merge.** `loadMessages(locale)` deep-merges the locale over `en.json`, so a missing key shows English.
2. **Sanitise.** Merging alone does not help a malformed message: the key exists, formatting fails, and the default fallback prints `contact.malformed`. So during the merge, any translated leaf that fails ICU parsing, or whose placeholders differ from English, is dropped and English shows instead. This also protects client components, which receive the sanitised result.
3. **Last resort.** `getMessageFallback` returns the English text with ICU arguments removed, or an empty string. It never returns the key. `onError` logs.
4. **Compile time.** `AppConfig.Messages` is typed from `en.json`, so `t("hero.titel")` fails `tsc`.
5. **Proof.** A unit test feeds in a malformed message and asserts English comes out. A Playwright sweep scans visible text, `aria-label`, `alt`, `title`, `placeholder` and `<title>` on every route and locale for any key path from `en.json`.

Clients receive only what they use: `NextIntlClientProvider` gets `pick(messages, CLIENT_NAMESPACES)`. Passing everything would serialise all the merged messages into every page.

### Language selector

All 17 are listed, in the brief's order, each with `lang`, `dir` and `hrefLang` set.

| Status | Behaviour |
|---|---|
| `reviewed` | Link to the same path in that locale. |
| `draft` | Link plus a visible "Draft" tag. Pages carry a `draft-notice` strip with a link to the English page. |
| `not-started` | Not a link. `aria-disabled="true"`, muted (still AA contrast), labelled "Coming soon", and its URL returns 404. Never English content presented as `/yo`. |

**Language links are plain `<a href={getPathname({ href: pathname, locale })}>`, not next-intl `Link`.** Measured in the scratch app:

| | next-intl `Link` with `locale` | Plain `<a>` |
|---|---|---|
| Switch to English from `/fr/work/demo` | Passes through `/en/work/demo`, settles on `/work/demo` | Straight to `/work/demo` |
| Earlier language left hidden in the DOM | Yes | No, one `h1` |
| `<html lang dir>` | Correct | Correct |
| Next page load | Background `_rsc` requests still in flight after 9 s, twice out of two (root cause not found) | Timing not measured |

The cost is one full page load on a rare action, and it also resets the menu. Other selector rules: disclosure pattern (`button[aria-expanded]` plus a list of links, not `role="menu"`), `aria-current` on the active language, Esc closes and returns focus. Query strings are not preserved. No copy anywhere claims a language count.

### Metadata and search

| | `reviewed` | `draft` | `not-started` |
|---|---|---|---|
| `<html lang dir>` | from registry | from registry | none, 404 |
| Canonical | self | none | none |
| hreflang | reviewed locales plus `x-default` to English | none, and not listed by others | none |
| Robots | indexable | `noindex,follow` meta and `X-Robots-Tag: noindex` from the proxy | 404 |
| `sitemap.xml` | listed | not listed | not listed |

Never `Disallow` a draft in `robots.txt`: a crawler that cannot fetch the page cannot see its `noindex`. `/studio/**` is always `noindex`. `src/i18n/seo.ts` builds this metadata so no page does it by hand.

### Formatting

**All `Intl` output is produced on the server and passed down as props.** Node and Chromium 156 differed on 5 of 68 values: Chromium lacks Hausa and Igbo names and has no date formats for Yoruba, Hausa or Igbo, giving `2026 M11 4` where Node gave `4 11 2026`, `4 Nuw, 2026` and `4 Nov 2026`. Client-side formatting would show that and cause hydration mismatches. A unit test fails on `Intl.` or `useFormatter` in `"use client"` files.

- Dates and numbers: `getFormatter`, with `timeZone: "UTC"`. Arabic numbers came out as `1,234.5` in both runtimes.
- Video language names: `videoLanguageName(tag, locale)` on the server, which returns the tag if lookup fails. The player and filters receive labels as props.
- Timecodes and durations: plain arithmetic in Latin digits, never `Intl`.
- Plurals: Arabic has six categories (measured). A unit test checks each `plural` covers `Intl.PluralRules(locale)`.
- `global-error.tsx` sits outside the provider, so it is plain English.

**Translations:** Yoruba, Hausa and Igbo drafts will be the weakest, and need a fluent reader before leaving `draft`. The client should also choose `pt` (Brazil or Portugal).

## 2. Right-to-left

Arabic is right only if the structure flips, not only the text.

- `dir="rtl"` on `<html>`, server-rendered (measured in raw HTML). No `scaleX(-1)` on layout.
- **Logical properties only:** `margin-inline-*`, `padding-inline-*`, `inset-inline-*`, `text-align: start`, `border-inline-*`. A unit test scans all CSS and fails on physical ones, unless the line carries `/* physical-ok: reason */`.
- **Not flipped by the browser, so handle by hand:** `translateX` and keyframes, `transform-origin`, `background-position`, gradients with `to right`, shadow offsets, and `scrollLeft` (use `scrollIntoView`).
- **Mirror:** arrows and chevrons that mean direction: CTA arrow, next and previous, back.
- **Never mirror:** play, pause, volume, fullscreen, logos, WhatsApp logo.
- **Video transport stays LTR.** Set `dir="ltr"` on the scrubber, transport buttons and timecode only. Title, version selector, subtitle menu and labels follow the page.
- **Timecodes:** `<time dir="ltr">`, because `1:23 / 4:56` can otherwise reorder. Asserted in the player test.
- **Latin inside Arabic:** owner titles and descriptions use `<bdi>`, as does anything interpolated into a sentence. Alignment follows the page and internal order stays correct.
- **Phone and email:** `dir="ltr"`, so `+234 906 074 3239` keeps its `+` at the start.
- **Typography:** no `letter-spacing` on Arabic (it breaks cursive joining), no uppercase styling, no tight display line-height (Arabic and Devanagari marks get clipped). The Creative Director exposes these as tokens and overrides them under `html:lang(ar)` and `html:lang(hi)`.
- Keyboard order must match visual order, right to left. Tested.

## 3. Fonts across scripts

**Keeping non-Latin bytes away from English visitors.** `unicode-range` alone is not enough: the selector prints العربية and हिन्दी on every page.

- Scope non-Latin faces to the document language: `html:lang(ar) { --font-body: ... }`, never a bare `:lang(ar)`. A selector item with `lang="ar"` on an English page then falls back to a system font and downloads nothing.
- The closed menu is `display: none`, so its text causes no font fetch.
- Only the Latin face is preloaded.
- Latin, Latin-ext, Vietnamese and Cyrillic subsets stay split, so each is fetched only if the page uses it. The selector item `lang="ru"` uses the system stack, so opening the menu does not fetch Cyrillic.

| Script | Face | Delivery | Bytes |
|---|---|---|---|
| Latin | The Creative Director's pick | Fontsource `latin` subset | Their budget: section 6 |
| Arabic | Noto Sans Arabic | Fontsource, only under `html:lang(ar)` | 165,960 |
| Devanagari | Noto Sans Devanagari | Fontsource, only under `html:lang(hi)` | 121,192 |
| Chinese, Japanese, Korean | None, system stack per language | Selected by `lang`, which is why `zh` uses `zh-Hans` | 0 |

The Arabic file alone takes about 0.8 s at 1.6 Mbps, so non-Latin faces use `font-display: swap` and are not preloaded.

**The Latin face may fail these,** which is the likely defect. A word falling back mid-way looks broken.

- Yoruba: ẹ U+1EB9, ọ U+1ECD, ṣ U+1E63, combining tone marks U+0300 and U+0301, dot below U+0323
- Igbo: ị U+1ECB, ọ U+1ECD, ụ U+1EE5, ṅ U+1E45
- Hausa: ɓ U+0253, ɗ U+0257, ƙ U+0199, ƴ U+01B4
- Turkish: ğ ı İ ş. Russian: Cyrillic.

I check these against the chosen package's `unicode.json`. If the face lacks any, that language gets a whole-document override (for example Noto Sans under `html:lang(yo)`), never a mid-word fallback.

**How it is verified:** Chromium's `CSS.getPlatformFontsForNode` reports the actual fonts used for an element. It works here: on the scratch app's `/ar` h1 it returned `Times New Roman`, `isCustomFont: false`. So `e2e/fonts.spec.ts` asserts each locale's h1 and body text use the intended faces. A request log asserts zero Arabic or Devanagari font requests on `/`, including with the selector open.

## 4. Accessibility

Target: WCAG 2.2 AA.

- **Focus:** one global `:focus-visible` style, white outline plus a dark outer ring, so it shows on dark surfaces and bright thumbnails. `scroll-padding-block-start` equals the nav height, so a sticky nav never covers focus.
- **Keyboard path:** skip link, logo, Work, Services, About, language selector, Contact, hero CTA, filters, cards, contact links. No traps. Tested at desktop and with the mobile menu.
- **Skip link:** first focusable element, visible on focus, targets `<main>`.
- **Filters:** native buttons or radios with `aria-pressed` or `checked`. A result-count `aria-live="polite"` region.
- **Cards:** one `<a>` wrapping the card, no nested controls. Accessible name is title, category, duration and the demo label if any, never "Play". Play icon `aria-hidden`. Hover content is also shown on focus and available on touch.
- **Player:** `aria-label` from the title, `preload="none"`, all controls reachable. Language version selector is a labelled native control.
- **Captions:** `<track kind="subtitles" srclang label>`. Cross-origin VTT needs `crossOrigin="anonymous"` on the `<video>`, so that is required for Supabase media and tested. The Iteration 2 custom player must have a keyboard-reachable subtitle control.
- **Headings:** one visible `h1` (hero), `h2` per section, `h3` per card, no skipped levels, counted on visible elements only.
- **Reduced motion:** with `reducedMotion: "reduce"`, no transform or view-transition animation, no hover video. Asserted through `document.getAnimations()` after load and after hover.
- **Contrast:** axe (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) on real rendered pages, at 1440 and 390, in English and Arabic. Axe cannot judge text over images, so text over a thumbnail must sit on a scrim of at least `rgba(0,0,0,0.55)`. White text on that over pure white is 4.74:1 (computed; 0.5 gives only 3.95:1). Asserted by reading the computed background.
- **Targets:** at least 24 by 24 CSS px, asserted from bounding boxes.

## 5. Security

### Headers

Set in `next.config.ts` `headers()` for `/:path*`, plus `poweredByHeader: false` (the server currently sends `X-Powered-By: Next.js`).

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  media-src 'self' blob:;
  font-src 'self';
  connect-src 'self';
  frame-src 'none';
  frame-ancestors 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  manifest-src 'self';
  upgrade-insecure-requests        (production only)
```

In the scratch app this policy (without the last line) produced zero CSP violations across navigation and Server Actions. That app has no images, fonts or video, so those directives are untested until Iteration 1.

- **Iteration 3 adds,** only then: `https://bpxlgvhtteplbzyezmqt.supabase.co` to `img-src` and `media-src`; that host and `https://bpxlgvhtteplbzyezmqt.storage.supabase.co` (direct upload host) to `connect-src`.
- **Dev only:** `'unsafe-eval'` in `script-src` (Next docs), and `ws:` in `connect-src` if hot reload is blocked.
- **Why `'unsafe-inline'`:** Next injects inline bootstrap scripts, and nonces cannot reach a prerendered shell. Experimental SRI hashes script files; I did not test whether it could replace `'unsafe-inline'`, and it is experimental, so it is not used. Compensation: no `dangerouslySetInnerHTML` anywhere (unit scan), owner content rendered as text, locked `base-uri`, `object-src` and `form-action`, and a tight `connect-src` to limit exfiltration.
- **Also:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`, and in production `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- **Test:** every route loads with zero CSP console violations. Filter on the CSP message: a 404 page also logs a console error.

### No secrets in client code

The app should never read the service-role key at runtime. Owner actions use the owner's session under RLS. `e2e/scan-build.mjs` runs after `next build` on `.next/static/**` and prerendered `.next/server/app/**` (`html`, `rsc`, `segment`):

- Decodes every JWT-shaped string and fails unless its role is `anon`.
- Fails on `sb_secret_`, `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `-----BEGIN`, `postgres://`.
- Fails on the literal value of any non-`NEXT_PUBLIC_` variable in `.env.local`. Values are never printed.
- A unit test runs the scanner on a planted fake secret, proving it can fail.
- `NEXT_PUBLIC_*` names containing `SERVICE` or `SECRET` fail a source scan.

### Upload hardening (Iteration 3)

- Bucket `file_size_limit` and `allowed_mime_types` enforced by a migration: video types on `videos`, `image/webp`, `image/jpeg`, `image/png` on `posters`, and `text/vtt` for subtitles. **No SVG or HTML.**
- RLS on `storage.objects`: only a row in `admins` may write. Anon writes are tested to fail, on the live project only with the lead's confirmation.
- Client checks are for UX only: size, type, and magic bytes before upload.
- Object keys are generated (`<projectId>/<versionId>/<uuid>.<ext>`), never the uploaded file name.
- VTT must begin `WEBVTT`, capped at 1 MB, and is used only through `<track>`.
- TUS authenticates with the owner's access token, never a service key.

### Auth and admin routes

1. Proxy: touches Supabase only on `/studio/**`, for session refresh and an optimistic redirect. Never on public routes, so public responses set no cookies. Not relied on for security.
2. `/studio/**` server pages and every Server Action call `requireAdmin()`: verified user plus an `admins` row. Actions are public endpoints whatever page hosts them.
3. RLS is the real enforcement. A bug above must not grant write access.
4. `/studio/**` responses are `no-store` and `noindex`.
5. Public sign-ups stay off.

**Gate before any Iteration 3 login test:** the lead adds `http://localhost:3000/**` to the Supabase Auth redirect URLs, which were set up for 3001. I will not change the live project myself.

### Contact links

From one constants module, never from data: exactly `https://wa.me/2349060743239` and `mailto:georgesamuel605@gmail.com`, displayed as `+234 906 074 3239`. `target="_blank"` carries `rel="noopener noreferrer"`. No invented details. Asserted exactly, in every locale. Any future owner-entered URL must be `https:` only.

## 6. Performance budget

All measured on a production build. The dev server is unminified and uncompressed, so numbers from it mean nothing.

| Metric | Budget | Measured by |
|---|---|---|
| First-load JS on `/`, compressed | **200 KB** | Playwright, `request.sizes()` on script responses |
| HTML of `/`, compressed | 40 KB | Same. Catches messages over-serialised to the client |
| Thumbnails in first view, before scroll | 1440x900: **300 KB**. 1920x1080: **450 KB**. 390x844 at 2x: **200 KB** | Same, for image responses. Works cross-origin |
| A single thumbnail | 480w: 30 KB. 960w: 80 KB | Same, and a script over `public/demo/**` |
| Fonts on English `/` | 2 files, **120 KB** in total; 0 non-Latin | Font request log |
| Total transfer on `/`, including route prefetches | **1 MB** | Sum of responses |
| LCP on Slow 4G (1.6 Mbps, 150 ms RTT, CPU 4x) | **2.5 s or less** | CDP throttling, `PerformanceObserver` |
| CLS | 0.1 or less | `PerformanceObserver` |
| Video bytes before play | **0** on `/` and on `/work/[slug]`, including after hover | Log of `media` requests and `video/*` responses; must be non-zero after pressing play |
| Public home stays static | Not `private`, `x-nextjs-cache: HIT` | Response headers |
| Admin code for anonymous visitors | No `supabase` or `tus` in loaded scripts | Script response bodies |

- **The JS budget is tight.** The scratch app measured 153,602 compressed bytes in 8 scripts (Next, React, next-intl provider, `Link`) with almost no app code, leaving about 46 KB for ours. An animation library needs the lead's sign-off.
- **Prefetching:** one visible link caused 2 `_rsc` requests in the scratch app. A grid may multiply that. If it breaks the transfer budget, cards use `prefetch={false}`.
- **Requirements behind the budgets:** `width` and `height` on every thumbnail, `srcSet` with accurate `sizes`, `loading="lazy"` beyond the first row, `fetchPriority="high"` on exactly one image, dominant colour painted first, `preload="none"` on every `<video>`, no autoplay, no hover video.
- **Egress reality:** 5 GB a month is about 100 full plays of a 50 MB file.

## 7. Test plan

### Running tests

- `playwright.config.ts`: `baseURL` `http://localhost:3000` (`E2E_BASE_URL` overrides), `workers: 1`, `fullyParallel: false`, `retries: 0`, Chromium only. **No `webServer` block,** because Playwright must never start a server or attach to the wrong one.
- **ShopWise also uses 3000.** `e2e/global-setup.ts` checks the responding app is Mayor Studios, by title and `site-header`, and aborts with a clear message if not. It never stops anything. The two apps share an origin (`localhost:3000`), so a manual browser session can carry ShopWise cookies, storage or a service worker. Playwright's fresh contexts cannot.
- **Tests wait on visible elements, never `networkidle`.** The `_rsc` requests in section 1 made a `networkidle` load time out, and would cause false failures.
- Performance, header and scan gates need a production server: the lead stops dev, runs `npm run build` then `npm run start` (port 3000), and I run `--project=prod`.

### Iteration 1 gates

All must pass, with output shown:

```
npm run lint
npx next typegen          (root-param and route types are generated, so tsc needs this first)
npm run typecheck
npx vitest run
npm run build             (route table must show /en as ○, not ◐)
node e2e/scan-build.mjs
npx playwright test --workers=1
```

Playwright at 1440x900, 1920x1080, 768x1024, 390x844:

| Check | Pass condition |
|---|---|
| Thumbnails in first screen | At least half visible and loaded, before scrolling: 3 at desktop, 2 at tablet, 1 at mobile |
| No horizontal scroll | `scrollWidth <= clientWidth`, in English and Arabic |
| Keyboard | Tab order matches section 4; every stop has visible focus; a card opens with Enter |
| Contact | Exact hrefs and displayed number, in English and Arabic |
| Card to player | Clicking a card reaches `/work/[slug]`, the player is visible, demo label present, no video bytes before play |
| Language routing | `/` is English with `Accept-Language: yo`; `/en` redirects to `/`; `/yo` is 404; no `Set-Cookie`; no `Link` header; unknown slug shows not-found UI and `noindex` |
| Draft honesty | `/ar` has `noindex` in raw HTML and in the header, `draft-notice` visible, the selector shows a Draft tag, not-started items are not links |
| Arabic RTL | `html[lang=ar][dir=rtl]`; logo right of nav links; first card rightmost; number displayed LTR; play icon unmirrored; focus moves right to left; a screenshot is reviewed by eye |
| No raw keys | Sweep passes on all routes in `en` and `ar` |
| Accessibility | No axe violations; heading order valid; reduced motion honoured |

### Files I create in Iteration 1

`src/i18n/`: `locales.ts`, `routing.ts`, `navigation.ts`, `request.ts`, `messages.ts`, `client-namespaces.ts`, `seo.ts`, `format.ts`
`src/proxy.ts`, `messages/ar.json` (draft)
`vitest.config.ts`, `playwright.config.ts`
`tests/unit/`: `locale-registry.test.ts`, `messages.test.ts`, `seo.test.ts`, `format.test.ts`, `css-logical-properties.test.ts`, `no-dangerous-html.test.ts`, `no-client-intl.test.ts`, `scan-build.test.ts`
`e2e/`: `global-setup.ts`, `fixtures.ts`, `scan-build.mjs`, `smoke.spec.ts`, `keyboard.spec.ts`, `contact.spec.ts`, `i18n.spec.ts`, `rtl.spec.ts`, `a11y.spec.ts`, `fonts.spec.ts`, `performance.spec.ts`, `security-headers.spec.ts`

### What I need from others

**Lead:**

- Install the packages in section 8.
- `next.config.ts`: wrap with `createNextIntlPlugin("./src/i18n/request.ts")`, keep `turbopack.root`, add `poweredByHeader: false` and the headers in section 5.
- `[locale]/layout.tsx`: `<html lang={htmlLang} dir={dir}>` from the registry, `generateStaticParams`, and `NextIntlClientProvider` with picked namespaces. No `setRequestLocale`.
- Add `src/app/[locale]/[...rest]/page.tsx` calling `notFound()`.
- `package.json` scripts: `"test:unit": "vitest run"`, `"test:e2e": "playwright test --workers=1"`, `"scan:build": "node e2e/scan-build.mjs"`.
- Decide: client `AdminGate` (my recommendation) or a server hole. Hosting before Iteration 3.

**Creative Director:**

| Component | `data-testid` |
|---|---|
| Layout | `skip-link`, `site-header`, `brand-logo`, `draft-notice` |
| Navigation | `nav-work`, `nav-services`, `nav-about`, `nav-contact` |
| Language | `language-selector` (the button), `language-menu`, `language-option-<code>` (with `data-status`) |
| Hero | `hero`, `hero-cta` |
| Portfolio | `portfolio`, `portfolio-grid`, `portfolio-error`, `filter-category`, `filter-language` |
| Card | `project-card` (with `data-slug`), `project-card-thumbnail`, `project-card-title`, `project-card-duration`, `project-card-languages`, `project-card-demo-label`, `play-icon` |
| Contact | `contact`, `contact-whatsapp`, `contact-whatsapp-number`, `contact-email` |

`messages/en.json` namespaces: `nav`, `hero`, `portfolio`, `categories` (keys exactly matching `PROJECT_CATEGORIES`), `card`, `filters`, `language` (`label`, `draftTag`, `comingSoon`, `draftNotice`, `readInEnglish`), `contact`, `player`, `errors`, `meta`. `studio` arrives in Iteration 3. ICU syntax only, no HTML in strings, no concatenated sentences, plurals as ICU `plural`.

Also: `src/app/[locale]/not-found.tsx`; the selector built from the registry with plain `<a>` language links; font and tracking tokens overridable per script; non-Latin faces scoped with `html:lang()`; the name of the Latin face chosen, so I can check its subsets; any text over a thumbnail on the scrim in section 4; no `Intl` in client components.

**Media Engineer:**

- `data-testid`: `player`, `player-video`, `player-play`, `player-version-select`, `player-subtitle-select`, `player-demo-label`, `player-error`.
- `DEMO_PROJECTS: Project[]` exported as pure data with no `server-only`, so tests derive slugs from it, including at least one project with two or more versions and one with a VTT track.
- `<video preload="none">`, pause in a `useLayoutEffect` cleanup, `crossOrigin="anonymous"` for cross-origin media, `dir="ltr"` on transport and timecode.
- Slugs matching `^[a-z0-9-]+$`. A sentinel in `generateStaticParams` when there are no published projects.
- Repository with `"use cache"` around data only, as in section 0. Signed URLs at play time. `AdminGate` as in section 0.
- Language labels received as props in the player, never computed there.
- Player strings: send keys to the Creative Director for the `player` namespace in `en.json`.

### Later iterations

| Iteration | Gates added |
|---|---|
| 2: Portfolio UI | Custom player keyboard and captions; video pauses after navigating away and back; hover content on focus and touch; filters by keyboard |
| 3: Media | **First: `localhost:3000` in the Supabase redirect URLs.** Login; admin controls and chunk absent for anonymous visitors; forged hint gains nothing; anon writes rejected; upload, edit, publish, delete; published change visible after invalidation; outage shows an error, never demo data; CSP with Supabase; build scan with real env; build with 0 published projects |
| 4: Languages | All locales `draft`; full raw-key sweep; plural and placeholder parity; fonts for every script; hreflang, sitemap; server-only `Intl` for `yo`, `ha`, `ig`; list for a fluent reviewer; video language separate from interface language |
| 5: Refinement | Budgets re-run; 320 px reflow; screenshots of `ar`, `hi`, `zh`, `yo`, long German labels |
| 6: Final | Full suite on production build; every link and flow; a real iPhone and a non-Chromium browser checked by hand, since automation here is Chromium only |

## 8. Packages

Exact versions. The lead runs the install. The parser is already in next-intl's tree at this version (`intl-messageformat` pulls in 3.5.22), so it adds no new code. next-intl also brings `@swc/core` (11 MB on disk).

```
npm install --save-exact next-intl@4.14.9 @formatjs/icu-messageformat-parser@3.5.22
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --save-dev --save-exact @playwright/test@1.64.1 @axe-core/playwright@4.14.0 vitest@5.1.0
```

The second line uses Bash syntax. Do not run `npx playwright install`: the browsers it needs are on disk.

The Creative Director's request should include `@fontsource-variable/noto-sans-arabic@5.3.0` and `@fontsource-variable/noto-sans-devanagari@5.3.0` when those scripts are needed.

## 9. Evidence

### Verified, 2026-11-03 and 2026-11-04

| Claim | How |
|---|---|
| All section 0 results; language link comparison; JS, prefetch and Node versus Chromium numbers | Scratch app outside the project, `next build`, then `next start` on spare port 3987 with `fetch` and Chromium. Only its own process was stopped. Harness: `C:\Users\DELL\AppData\Local\Temp\claude\a1e53167a7f1637c\83d051af-95b1-4b04-9425-df047bb99ebd\scratchpad\scripts\probe-all.js` and `diag.js` in the same folder |
| Playwright 1.64.1 expects chromium 1248, headless shell 1248, ffmpeg 1013, all on disk | `browsers.json` compared with `%LOCALAPPDATA%\ms-playwright` |
| It runs here, nothing downloaded | `playwright-core@1.64.1` launched on-disk Chromium 156.0.8078.4 |
| next-intl internals: lazy `requestLocale`; `alternateLinks` and `localeCookie` default on; `localeDetection: false` skips cookie and `Accept-Language` | Read the 4.14.9 `dist/esm` source, confirmed by the HTTP results |
| `setRequestLocale` legacy; root params from 16.3; dots in paths need explicit matcher entries | next-intl routing setup docs, fetched |
| #2229: closed 29 Jan 2026, no fix linked, maintainer quote | GitHub issue, fetched |
| Flags permanent next major; PPR versus nonces; empty `generateStaticParams`; `<Activity>` and `<video>`; test locators; `cookies()` outside Suspense is a build error | Bundled Next 16.4.5 docs |
| Font file sizes | `tar -tzvf` on the `npm pack` tarballs |
| Scrim contrast | Computed with the WCAG formula |
| Port 3000 in `package.json`, `ARCHITECTURE.md` and my definition file; server answers 200, title "Mayor Studios" | Read files, `curl http://localhost:3000/` |

### Failures seen

- `page.goto: Timeout 9000ms exceeded` loading `/ar` after a next-intl `Link` language switch, twice out of two, with `/ar/work/demo?_rsc=...` still in flight. A fresh `/ar` reached `networkidle` in 840 ms and 769 ms. Root cause not found. Plain `<a>` language links avoid that sequence, though I did not time `networkidle` after them.
- `/work/<unlisted>` returning 200 is a real limitation, accepted in section 0.

### Not verified

- **`next dev`.** The scratch runs were production builds in JavaScript. Dev mode and TypeScript types first get exercised when Iteration 1 is wired up.
- A runtime cache fill for next-intl inside `"use cache"`: only prerendered output was tested.
- How a rejected read behaves inside `"use cache"`.
- `getMessageFallback`, `onError`, the sanitiser and `X-Robots-Tag`: designed, not run.
- next-intl's changelog: not in the tarball.
- Firefox and Safari. Only Chromium and Edge are available here. The `Intl` gaps may differ in those browsers.
- `@playwright/test`, `@axe-core/playwright` and `vitest` at these versions: version numbers from `npm view`, not installed. `@playwright/test` wraps the same `playwright-core` I ran.
- All budgets except the JS baseline are targets, not measurements.
- Supabase hostnames in the CSP are from the project ref and Supabase's documented pattern. Not tested.
- Bidi reordering and font coverage claims in sections 2 and 3 come from Unicode and Fontsource knowledge. They are checked when real pages exist.

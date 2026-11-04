# Mayor Studios design system

Owner: Creative Director. Interprets `BRIEF.md`; if they conflict, the brief wins and the lead is told.

**Status:** Iteration 1 review. Numbers below were rendered and measured in a throwaway static mock, not on the real site,
which does not exist yet. Section 12 records exactly what was and was not verified.

All sizes are CSS px unless stated. Everything is built from tokens (section 4), so a change of direction touches
`globals.css`, not components.

---

## 1. Concept

**The screening room.** The page is a dark room and the thumbnails are the screens. They are the only colour on the
site. Type and lines are white on black and step back, so the first thing anyone sees is the work.

**Signature: floor light.** Each thumbnail casts a small pool of its own light onto the floor directly below it, where
its caption sits.

Verdict on the proposed cinema light spill: **improved, not accepted as proposed.**

- As proposed (colour behind and around each thumbnail) it fails. Three neighbouring glows merge into the coloured
  gradient look the client rejected, it reads as YouTube's Ambient Mode rather than as ours, it echoes the glow of the
  old build, and large low-alpha gradients on near-black band visibly.
- The improved version has a job: **it replaces the card surface.** The caption belongs to its thumbnail with no box,
  border or shadow. The pool lives only under thumbnails, stays inside its own column, and fades out before the next
  row. No coloured light exists anywhere else on the page.
- A dark frame casts almost no light, as it should. That keeps moody work moody.
- Judged on the mock: at rest it is barely there, on hover a warm wash appears under an orange frame, and it does not read
  as a gradient. Kill switch: set `--spill-rest` and `--spill-hover` to `0`. Recipe in section 5.

**Structural rule: three lines.** The first row of thumbnails sets three vertical lines. Every section on the page hangs
from those same lines: hero copy, filters, service names, contact blocks, footer. This is what makes a sparse page look
composed rather than empty.

---

## 2. First screen

### Composition

Exactly the client's reference, in the dark. Small overline. Tight two-line headline on the left. Supporting copy on the
third column line, sharing the headline's last baseline. Three tall thumbnails directly below, each with a title on the
left and one small datum on the right. Nothing else: no hero image, no background video, no filters.

```
1440 x 900        x=40              x=501             x=963            x=1400
                  |                 |                 |                |
y=0    header     Mark Mayor Studios              Work Services About EN [Contact]
y=96   overline   VIDEO EDITING STUDIO
y=124  headline   We make every                       Thoughtful video editing...
                  frame matter.                       Explore our work (down arrow)
y=289  thumbs     +---------------+ +---------------+ +---------------+
                  |   437 x 547   | |               | |               |
y=836             +---------------+ +---------------+ +---------------+
y=848  caption    Title     02:48   Title     01:12   Title     00:45
                  [DEMO] Category  EN FR ...
y=897
```

### Measurements (rendered in the mock, set in Onest)

| Band | 1440 x 900 | 1920 x 1080 | 390 x 844 |
|---|---|---|---|
| Gutter / effective margin | 40 / 40 | 56 / 96 (content capped at 1728) | 20 / 20 |
| Column, gap | 437.33, 24 | 560, 24 | 1 column, 350 |
| Header | 0 to 64 | 0 to 64 | 0 to 56 |
| Hero top padding | 32 | 32 | 20 |
| Overline (line box 16) | 96 to 112 | 96 to 112 | 76 to 92 |
| Overline to headline | 12 | 12 | 8 |
| Headline, 2 lines | 124 to 257 (63.9 px) | 124 to 282 (76 px) | 100 to 183 (40 px) |
| Headline line widths | 436, 373 | 519, 443 | 273, 233 |
| Copy and CTA | Column 3, 163 to 252 | Column 3, 184 to 276 | Stacked: copy 195 to 265, CTA 277 to 301 |
| Gap to thumbnails | 32 | 32 | 24 |
| **Thumbnails start at y** | **289** | **314** | **326** |
| Thumbnail size | 437 x 547 | 560 x 700 | 350 x 438 |
| Thumbnails end at y | 836 | 1014 | 763 |
| Caption ends at y | 897 | 1078 | 819 |
| **First row visible** | **100%, with captions** | **100%, with captions** | **First card 100%, with caption.** Next card starts at 851 |
| In a real browser window* | 92% of thumbnail (1440 x 790) | 91% (1920 x 950) | 77% (390 x 664) |

\* Window sizes are typical after browser chrome. Those three percentages are estimates. The work is on screen in every case.

Header plus hero take 32% of the height at 1440 x 900. The hero itself is 225 px, 25%. A classic 17 px Windows scrollbar
narrows each thumbnail by about 6 px and shortens it by about 7, which only helps the fit.

At exactly 1440 the headline's first line (436) matches the thumbnail below it (437). It looks deliberate, but it is a gift
at that width. Do not engineer it.

### Rules

- **Grid.** At 1024 and up the hero uses the same three columns and gap as the thumbnails. Headline spans columns 1 and 2.
  Copy and CTA sit in column 3. `align-items: last baseline`, with `end` as the fallback, so the CTA shares the headline's
  last baseline. Below 1024 everything stacks.
- **Two lines without a hard break.** `text-wrap: balance; max-inline-size: 12em` on the headline. English landed on
  "We make every / frame matter." at all three measured widths. Translators never deal with a line break. Longer languages
  may take a third line; nothing is absolutely positioned, so the layout just grows.
- **Case.** Sentence case, words unchanged from the brief. See section 11, client question 1. Reasons: the client's
  reference is sentence case; capitals read about 30% larger at the same size, which is the wrong direction after the
  oversized complaint; and Yoruba and Igbo stack tone marks on capitals, which collide at this leading. The source string
  is sentence case because CSS can uppercase it in one line, whereas it cannot do the reverse.
- **CTA.** "Explore our work" is a text link, not a button: 15 px, weight 500, white, line height 24, 12 above it, 1 px underline
  at 5 px offset, 14 px down arrow. The header's Contact is the one solid button on this screen. It targets `#all-work`, the
  section after the first row, so it does real work even though thumbnails are already visible. With 3 projects or fewer it
  targets `#work`.
- **Overline copy.** "Video editing studio". Factual, from the brief.
- **Copy measure.** `max-inline-size: 38ch`, colour `--text-2`, `text-wrap: pretty`.
- **Tablet, 640 to 1023.** Stack the hero, keep three columns of thumbnails. Not yet rendered, see section 12.
- **No entrance animation.** The first screen is simply there.

---

## 3. Type

### Pairing

| Role | Package | CSS family | Used for |
|---|---|---|---|
| Everything | `@fontsource-variable/onest` 5.3.1 | `Onest Variable` | Headlines, body, navigation, captions |
| Timecode digits only | `@fontsource-variable/chivo-mono` 5.3.0 | `Chivo Mono Variable` | Durations on cards and in the player. Never labels, never overlines |
| Arabic | `@fontsource-variable/noto-sans-arabic` 5.3.0 | `Noto Sans Arabic Variable` | Arabic text anywhere, including owner-entered titles |
| Devanagari | `@fontsource-variable/noto-sans-devanagari` 5.3.0 | `Noto Sans Devanagari Variable` | Hindi text anywhere |

All four verified with `npm view`, all OFL-1.1.

### Why Onest: coverage decided it

Each required character was routed through the package's real `wght.css` `unicode-range`, then checked against the cmap of the
file that range would download. Marks were then checked on screen with a serif fallback, so a missing glyph shows at a glance.

| Package | Yoruba | Hausa | Igbo | Turkish | Russian | Result |
|---|---|---|---|---|---|---|
| **`onest`** | Pass | Pass | Pass | Pass | Pass | **Chosen** |
| `inter-tight` | Pass | Pass | Pass | Pass | Pass | Passes, but it is the default |
| `noto-sans-display` | Pass | Pass | Pass | Pass | Pass | Passes, but reads as a system font |
| `hanken-grotesk` | No ṣ, ǹ | No ɓ ɗ ƙ | Pass | Pass | **No Cyrillic face** | My first choice. Failed |
| `wix-madefor-display`, `geologica` | No ṣ, ǹ | No ɓ ɗ ƙ | No ṅ | Pass | Pass | Failed |
| `golos-text`, `sofia-sans` | No ẹ ọ ṣ | No ɓ ɗ ƙ | No ị ọ ụ ṅ | Pass | Pass | Failed |
| `schibsted-grotesk`, `instrument-sans` | No ẹ ọ ṣ | No ɓ ɗ ƙ | No ị ọ ụ ṅ | Pass | No Cyrillic | Failed |

Hausa's hooks are the hard test: most fonts render ɓ ɗ ƙ in a fallback face mid-word, which looks broken in any language it
touches. Coverage, not taste, narrowed this to three.

**Why this is not the AI default.** The default stacks are Inter, Geist, Space Grotesk, DM Sans, Manrope, Plus Jakarta and a mono
eyebrow in JetBrains. Onest is a slightly wide, confident grotesk with a rounded, u-shaped `y`, and at 64 px and weight 500 it
holds the reference's voice without looking like Inter. The mono is restricted to digits because timecode is how an editor reads
time. Used on labels it becomes the familiar AI pattern; used only on `02:48` it is a craft detail.

**Honest risk.** That rounded `y` is Onest's one loud trait and it sits in both "every" and "Mayor". I judged it acceptable on
screen, and it is the source of the distinct voice. If the client dislikes it, `--font-sans` swaps to Inter Tight in one line, at
the price of the default look.

### Import

Import each package's whole `wght.css`, for example `@fontsource-variable/onest/wght.css`. Each subset is a `unicode-range` face and
browsers download only what a page uses. An English visitor loads **59 KB of font**: Onest `latin` (33 KB) and Chivo Mono `latin`
(26 KB). Other subsets load only when their characters appear: Onest `latin-ext` 28 KB, `vietnamese` 12 KB, `cyrillic` 15 KB; Noto
Arabic 162 KB; Noto Devanagari 118 KB.

**Do not import only `latin` and `latin-ext`.** ẹ ọ ị ụ and the combining marks U+0300 and U+0323 are only reachable through the
**`vietnamese`** subset (U+0301 through `vietnamese` or `cyrillic`). A Latin-only import would silently break Yoruba and Igbo mid-word.

**Fallback metrics.** There is no `next/font`, so add a metric-matched fallback face to limit layout shift when Onest arrives:
`src: local("Arial"); ascent-override: 97%; descent-override: 30.5%; line-gap-override: 0%`. Those come from Onest's own metrics
(hhea 970 / -305 / 0, 1000 upm). `size-adjust` must be measured at implementation.

### Stacks

```css
--font-sans:
  "Onest Variable", "Onest Fallback", var(--font-cjk), "Noto Sans Arabic Variable",
  "Noto Sans Devanagari Variable", ui-sans-serif, system-ui, -apple-system,
  "Segoe UI", "Helvetica Neue", Arial, sans-serif;
--font-time: "Chivo Mono Variable", ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;

/* System fonts for CJK: good on every OS, while self-hosting costs many MB. */
--font-cjk: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"; /* default, so a Chinese title on a French page still renders */
:lang(zh) { --font-cjk: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC"; }
:lang(ja) { --font-cjk: "Hiragino Sans", "Yu Gothic UI", "Yu Gothic", "Noto Sans CJK JP"; }
:lang(ko) { --font-cjk: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR"; }
```

The fallback face must sit after Onest but carry a `unicode-range` limited to Latin, or it will take CJK, Arabic and Devanagari from
the fonts behind it. The `lang` attribute selects the right forms for unified Han characters. Latin words inside CJK pages stay in
Onest. `font-synthesis: none` globally, so fallback fonts never get faux bold. No italics anywhere: Arabic and CJK have none.

### Scale

Each row: token, `clamp()`, computed px at 390 / 1024 / 1440 / 1920.

| Token | Value | 390 | 1024 | 1440 | 1920 | Weight | Line | Tracking |
|---|---|---|---|---|---|---|---|---|
| `--fs-display` (H1, once) | `clamp(2.5rem, 1.25rem + 3.05vw, 4.75rem)` | 40 | 51 | 64 | **76 ceiling** | 500 | 1.04 | -0.035em |
| `--fs-h2` | `clamp(1.75rem, 1.35rem + 1.2vw, 2.5rem)` | 28 | 34 | 39 | 40 | 500 | 1.1 | -0.025em |
| `--fs-statement` (About) | `clamp(1.375rem, 1.1rem + 0.9vw, 1.875rem)` | 22 | 27 | 30 | 30 | 400 | 1.3 | -0.015em |
| `--fs-h3` (service names, contact values) | `clamp(1.25rem, 1.15rem + 0.35vw, 1.5rem)` | 20 | 22 | 23 | 24 | 500 | 1.2 | -0.015em |
| `--fs-lead` (hero copy) | `clamp(1rem, 0.95rem + 0.2vw, 1.1875rem)` | 16 | 17 | 18 | 19 | 400 | 1.45 | 0 |
| `--fs-body` | `1rem` | 16 | 16 | 16 | 16 | 400 | 1.55 | 0 |
| `--fs-ui` (nav, filters, buttons) | `0.875rem` | 14 | 14 | 14 | 14 | 500 | 1.3 | 0 |
| `--fs-overline` | `clamp(0.75rem, 0.7rem + 0.12vw, 0.8125rem)` | 12 | 12 | 13 | 13 | 500 | 16 px | +0.08em, capitals |
| `--fs-tag` (Demo) | `0.6875rem` | 11 | 11 | 11 | 11 | 600 | 1 | +0.06em, capitals |

Card type scales with the card, not the viewport, using container query units. `container-type: inline-size` on the card:

| Token | Value | Card 224 | Card 350 | Card 437 | Card 560 | Weight | Line |
|---|---|---|---|---|---|---|---|
| `--fs-card-title` | `clamp(0.9375rem, 4.8cqi, 1.375rem)` | 15 | 17 | 21 | 22 | 500 | 1.25 |
| `--fs-card-meta` | `clamp(0.8125rem, 3.2cqi, 0.9375rem)` | 13 | 13 | 14 | 15 | 400 | 1.35 |

**Oversize versus lightweight.** The display ceiling is 76 px and two lines take about 15% of the screen height, slightly less than
the reference (16%). The headline stops being large before it starts being loud. Weight comes from elsewhere: a card title of 21 px
rather than the usual 14 to 16, because the reference's captions are proportionally large and that is a big part of why it does not
look thin; white as the primary text colour; statement-size About copy; and hairline structure.

Card titles carry **zero tracking**. They are owner-entered and may be in any script, and letter-spacing breaks Arabic joining.
Negative tracking only applies to interface strings, whose language `:lang()` can see. Durations alone take -0.01em.

### Script overrides

Set by overriding tokens only, in one block of `globals.css`. Interface `--fs-*` values are multiplied by `--script-scale`.

| Selector | Tracking tokens | Overline | `--lh-display` | `--lh-heading` | `--lh-body` | Notes |
|---|---|---|---|---|---|---|
| `:lang(ar)` | All 0 | No capitals | 1.22 | 1.3 | 1.7 | Letter-spacing breaks joining. `--script-scale: 1.05` |
| `:lang(hi)` | All 0 | No capitals | 1.24 | 1.3 | 1.7 | Letter-spacing breaks the headstroke. `--script-scale: 1.04` |
| `:lang(zh)`, `:lang(ja)`, `:lang(ko)` | All 0 | No capitals | 1.2 | 1.3 | 1.75 | `word-break: auto-phrase` on `ja` headlines |
| `:lang(yo)`, `:lang(ig)`, `:lang(ha)` | Unchanged | Capitals allowed | 1.16 | 1.22 | 1.65 | Stacked tone marks and dots need clearance |
| All others | Unchanged | Capitals | Unchanged | Unchanged | Unchanged | `text-transform` follows `lang`, so Turkish gets İ correctly |

`line-clamp` sets `overflow: hidden`, which can clip stacked marks. Add `padding-block: 0.12em` and a matching negative margin to any
clamped text.

---

## 4. Tokens

```css
:root {
  color-scheme: dark;

  /* Surfaces. Neutral on purpose: R = G = B, so the thumbnails are the only colour. */
  --bg: #050505;          /* The room. Not #000: OLED pixels switching fully off smear during scroll. */
  --surface-1: #0e0e0e;   /* Charcoal: contact band, player chrome */
  --surface-2: #161616;   /* Panels: language menu, hover on ghost buttons */
  --surface-3: #1f1f1f;   /* Pressed states */

  /* Lines */
  --line-1: #1c1c1c;      /* Section hairlines. Decorative */
  --line-2: #2b2b2b;      /* Row hairlines. Decorative */
  --line-3: #6b6b6b;      /* Borders that identify a control. Meets 3:1 */

  /* Text */
  --text-1: #ffffff;      /* Headlines, titles, navigation */
  --text-2: #b3b3b3;      /* Supporting copy */
  --text-3: #8c8c8c;      /* Metadata, inactive filters */
  --text-off: #5c5c5c;    /* Disabled only. Never essential text */

  /* Accent: white and nothing else */
  --accent: #ffffff;
  --accent-hover: #e6e6e6;
  --accent-press: #cccccc;
  --on-accent: #050505;
  --danger: #ff7a70;      /* Studio validation and upload errors only. Never on the public page. */

  /* Space: name = multiple of 4 */
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-5: 20px;  --space-6: 24px;  --space-8: 32px;  --space-10: 40px;
  --space-12: 48px; --space-16: 64px; --space-20: 80px; --space-24: 96px;

  /* Layout: mobile first, see table below */
  --gutter: 20px;
  --grid-gap: 16px;
  --grid-row-gap: 32px;
  --header-h: 56px;
  --hero-top: 20px;
  --hero-gap: 8px;
  --hero-bottom: 24px;
  --content-max: 1728px;
  --section-y: clamp(4rem, 3rem + 3.2vw, 6.5rem); /* 64 at 390, 94 at 1440, 104 at 1920 */

  /* Radii: near-square. Nothing on the site exceeds 4px. */
  --radius-media: 2px;
  --radius-control: 2px;
  --radius-panel: 4px;

  /* Motion */
  --dur-1: 120ms;  /* Press */
  --dur-2: 200ms;  /* Colour and opacity on text and controls */
  --dur-3: 360ms;  /* Panels opening */
  --dur-4: 640ms;  /* The thumbnail hover */
  --ease-settle: cubic-bezier(0.16, 1, 0.3, 1); /* Thumbnails */
  --ease-ui: cubic-bezier(0.2, 0, 0, 1);        /* Everything else */

  /* Thumbnail: the single place to change the look of every card */
  --thumb-ratio: 4 / 5;
  --thumb-scale-hover: 1.025;
  --thumb-dim-rest: 0.08;
  --spill-rest: 0.08;
  --spill-hover: 0.18;

  --script-scale: 1;
}

@media (prefers-reduced-motion: reduce) {
  :root { --thumb-scale-hover: 1; --dur-3: 1ms; --dur-4: 120ms; }
}
```

### Contrast (calculated by script)

| Token | On `--bg` | On `--surface-1` | On `--surface-2` | Use |
|---|---|---|---|---|
| `--text-1` | 20.4:1 | 19.3:1 | 18.1:1 | AAA |
| `--text-2` | 9.7:1 | 9.2:1 | 8.6:1 | AAA |
| `--text-3` | 6.1:1 | 5.7:1 | 5.4:1 | AA. Also 5.1:1 on the brightest possible floor light (about `#1c1c1c`) |
| `--line-3` | 3.8:1 | 3.6:1 | 3.4:1 | Non-text 3:1 |
| `--danger` | 8.0:1 | 7.6:1 | 7.1:1 | AAA |
| `--text-off` | 3.0:1 | 2.9:1 | 2.7:1 | Disabled only, exempt |
| `--on-accent` on `--accent` | 20.4:1 | | | 16.3:1 on hover, 12.7:1 pressed |

### Layout by breakpoint

| Min width | Gutter | Column gap | Row gap | Header | Hero top, gap, bottom | Columns |
|---|---|---|---|---|---|---|
| 0 | 20 | n/a | 32 | 56 | 20, 8, 24 | 1 |
| 640 | 32 | 16 | 32 | 64 | 32, 12, 32 | 3 |
| 1024 | 40 | 24 | 40 | 64 | 32, 12, 32 | 3 |
| 1600 | 56 | 24 | 48 | 64 | 32, 12, 32 | 3 |

Page shell: `max-inline-size: calc(var(--content-max) + 2 * var(--gutter)); margin-inline: auto; padding-inline: var(--gutter)`.
Past 1840 px wide, the margins simply grow.

**Grid.** One grid everywhere: `grid-template-columns: repeat(3, minmax(0, 1fr))` at 640 and up, one column below. There is no 12-column
grid. Later sections place content on these same three lines. There is deliberately no two-column stage: featured projects come in
threes, and two columns would orphan the third.

**RTL.** CSS logical properties only: `margin-inline`, `inset-inline`, `padding-block`, `text-align: start`. Layout order mirrors on its
own. These do **not** mirror, and sit in `<bdi dir="ltr">` or `dir="ltr"` where they contain text: the play triangle, durations (always
Latin digits), phone number, email address, language codes, the logo lockup and the down arrow. Any fade or arrow that depends on
reading direction flips with `:dir(rtl)`.

---

## 5. Thumbnail and card

### Ratio: 4:5, one token

| Ratio | 16:9 source keeps | 9:16 source keeps | Card at 1440 | Verdict |
|---|---|---|---|---|
| 16:9 | 100% | 32% of height | 437 x 246 | Rejected. A YouTube grid, and the lightweight look the client complained about. Vertical work is destroyed |
| 1:1 | 56% of width | 56% of height | 437 x 437 | Fair to both, but loses the reference's tall presence |
| **4:5** | **45% of width** | **70% of height** | **437 x 547** | **Chosen. The reference measures 0.80 (about 202 x 251 in the image). The row fills the first screen like posters on a wall** |
| 9:16 | 32% of width | 100% | 437 x 777 | Rejected. A row cannot fit on the first screen |

**The honest cost:** a 16:9 frame loses 55% of its width, and most of the client's work is 16:9. Burned-in titles and two-shot
compositions will not survive the crop. How it is handled:

1. **The thumbnail is chosen, not automatic.** Upload shows a live 4:5 preview with a draggable focal point.
2. **Clean frames only.** Single subject, no burned-in text or logos. Text never appears on a thumbnail in this design.
3. **What the owner previews is what publishes.** The crop is generated in the browser at upload, because Supabase Free has no image
   transforms.
4. **Never letterbox, never blurred fill.** Every card is the same shape. Consistency is the brief's explicit requirement.
5. **One-token escape.** If the client rejects the crop after seeing real work, `--thumb-ratio` changes everywhere. The grid, captions
   and floor light all derive from the card, not from fixed heights.

### Image delivery

- **Card image:** a pre-cut 4:5 file at widths 480, 800 and 1200 (1200 x 1500 at most), never upscaled. This also reduces egress: a 16:9
  image under `object-fit: cover` would send 2.2 times the pixels anyone sees, which matters at 5 GB a month.
- **Source quality check:** a 1920 x 1080 frame crops to 864 x 1080, which is sharp at 437 CSS px on a 2x screen. The uploader warns below
  800 px wide after cropping.
- **`sizes`:** `(min-width: 1600px) 560px, (min-width: 640px) 31vw, calc(100vw - 40px)`.
- **Tolerance:** if an image is not 4:5, the card multiplies `sizes` by `max(1, (w / h) / 0.8)` and applies
  `object-position: focusX% focusY%`. Without that multiplier, a 16:9 image picks a candidate about half the needed resolution and looks
  soft. This is the most likely way for thumbnails to look cheap.
- **Element:** plain `<img srcset sizes>`, since widths are pre-generated and nothing downstream re-encodes them. First row
  `loading="eager"`, first card `fetchPriority="high"`, everything else `loading="lazy" decoding="async"`.
- **Placeholder:** `dominantColor` as a flat background on the frame. No shimmer, no blur-up.
- **`dominantColor` is taken from the cropped image.** Use the most prominent saturated cluster, not the mean, which turns most frames to
  mud.

### Anatomy

```
<article> (container-type: inline-size; isolation: isolate)
  <a href="/work/[slug]">
    .frame     aspect-ratio var(--thumb-ratio); overflow hidden; radius 2; background dominantColor;
               outline 1px solid rgb(255 255 255 / 0.06), offset -1px
      <img alt="">   (the title is right below, so the image is decorative in this context)
      .dim     black overlay, opacity var(--thumb-dim-rest)
      .play    chip, bottom-start corner
    .caption   position relative; padding-block-start 12
      ::before the floor light, z-index -1
      row 1    <h3> title (inline-start)      <time> duration (inline-end)
      row 2    [Demo] Featured · Category     EN · FR · ES (inline-end)
```

Gap between the caption rows: 4. Both rows use `justify-content: space-between`. Row 1 aligns on baseline.

**Row 1.** Title: `--fs-card-title`, `--text-1`, `dir="auto"`, at most 2 lines, not translated. Duration: `--fs-card-meta`, `--font-time`,
`--text-2`, `<time datetime="PT2M48S">`, from `versions[0].durationSeconds`, format `m:ss` or `h:mm:ss` with the minutes padded (`02:48`,
`1:02:48`). If absent, omit it and the title takes the row. This is the reference's title and small datum.

**Row 2.** Everything `--fs-card-meta`, `--text-3`. Wraps when the card is narrow. Nothing essential is hover-only, so touch and keyboard
users get the same information.

| Item | Rule |
|---|---|
| **Demo** | When `isDemo`. Tag: `--fs-tag`, `--text-2`, 1 px `--line-3` border, radius 2, padding-inline 5, height 18. Always visible, first in the row, on every card and in the player. Hidden text for assistive tech: "Demonstration content". Below the first row, when any project on the page is a demo, one line, 14 px, `--text-3`, 20 above it: "Demo marks sample content made to show this site, not client work." |
| **Featured** | When `isFeatured`, the word in `--text-1`, followed by a middle dot. **Suppressed in the first row**, where position already says it, and shown in the grid below, where it adds information |
| **Category** | UI text from messages |
| **Video languages** | Uppercase primary subtag, `dir="ltr"`, separated by middle dots: `EN · FR · ES`. At most 3, then `+2`. Region only when two versions share a language (`PT-BR · PT-PT`). Hidden text: "Available in English, French, Spanish", from `Intl.DisplayNames(locale)`. Never implies anything about interface language |

### States

| State | Behaviour |
|---|---|
| **Rest** | Pure image, dimmed 8%. Floor light at 8%. No play chip on hover-capable devices. No overlay, border, shadow or text on the image |
| **Hover** (`@media (hover: hover)`) | The one motion, below |
| **Keyboard focus** | Same as hover, plus `outline: 2px solid var(--text-1); outline-offset: 3px` on `.frame` when the link matches `:focus-visible` (20:1 on the page) |
| **Touch** (`@media (hover: none)`) | No scale. Play chip always visible at lower emphasis: 32 x 32, `rgb(5 5 5 / 0.55)` with a white triangle. On press, dim goes to 0.2 for `--dur-1` |
| **Reduced motion** | No scale. Dim, light and chip still change, as plain fades |
| **Forced colours** | Floor light off. Outline uses `Highlight` |
| **Image failed** | The `dominantColor` block stays, caption intact, still a working link |

### The one hover motion

Every card, everywhere, exactly this. Nothing else moves. The frame itself never moves, lifts or gains a shadow.

| Property | From | To | Duration | Easing |
|---|---|---|---|---|
| `img` transform | `scale(1)` | `scale(1.025)` | 640 ms | `--ease-settle` |
| `.dim` opacity | 0.08 | 0 (the lamp comes up) | 640 ms | `--ease-settle` |
| Floor light opacity | 0.08 | 0.18 | 640 ms | `--ease-settle` |
| Play chip opacity | 0 | 1, no movement | 200 ms | `--ease-ui` |
| Row 2 colour | `--text-3` | `--text-2` | 200 ms | `--ease-ui` |

Same timing on the way out, no delay.

**Play chip.** `clamp(32px, 9cqi, 44px)` square, radius 2, solid white, black triangle (`M6 4 L16 10 L6 16 Z` in a 20 box, drawn at 50% of
the chip), inset 12 from the bottom and inline-start. It echoes the solid Contact button. Off-centre so it never sits on a face. The position
mirrors in RTL through logical properties. The triangle does not mirror, because media controls do not.

**No video on hover.** Video never loads until asked for (architecture, section 2).

### Floor light recipe (as rendered in the mock)

```css
.card { --floor: oklch(from var(--thumb-color) min(l, 0.62) min(c, 0.11) h); } /* --thumb-color: inline, from dominantColor */
.caption::before {
  content: ""; position: absolute; z-index: -1; pointer-events: none;
  inset-block-start: 0; inset-inline: 0;
  block-size: clamp(64px, 22cqi, 110px); /* Always ends before the next row */
  background: radial-gradient(ellipse 62% 100% at 50% 0,
    var(--floor) 0%,
    color-mix(in oklab, var(--floor) 62%, transparent) 25%,
    color-mix(in oklab, var(--floor) 28%, transparent) 50%,
    color-mix(in oklab, var(--floor) 8%, transparent) 75%,
    transparent 100%);
  opacity: var(--spill-rest);
  transition: opacity var(--dur-4) var(--ease-settle);
}
.card:hover .caption::before, .card:focus-within .caption::before { opacity: var(--spill-hover); }
@supports not (color: oklch(from white l c h)) { .caption::before { display: none; } }
```

Clamps: lightness at most 0.62 so a white frame never makes a halo; chroma at most 0.11 so a neon frame never colours the page. Only opacity
animates, so there is no repaint during hover. Eased stops reduce banding. **No `filter: blur`, ever.**

---

## 6. Portfolio grid and filters

### Structure

1. **First row, `#work`.** The first three projects, ordered by `isFeatured` then newest. Visually hidden H2 "Selected work". No filters,
   exactly the reference. Featuring exactly three projects gives the owner full control of this row without any new data or reordering
   interface. The Studio should warn when more than three are featured.
2. **All work, `#all-work`.** Everything else. Top margin 72 at 1024 and up, 56 below. Omitted with 3 projects or fewer.

The first row and the rest are two sections, so filters never disturb the first screen. With filter "All", first-row projects are hidden from
the lower grid to avoid showing them twice. With any other filter, every match appears, including first-row projects. Without JS the lower grid
simply shows the rest.

Three columns at 640 and up, one below. Same ratio, type and motion in both sections. A partial last row stays partial; cards are never
stretched. `scroll-margin-block-start: calc(var(--header-h) + 16px)` on anchors.

### Filter bar

Sits on the "All work" H2 row, sharing its baseline, starting at the second column line. 24 below to the grid.

**Shown only when useful:** 7 or more projects, and 2 or more categories. Otherwise the H2 stands alone.

| Part | Rule |
|---|---|
| **Category** | Plain text buttons in a labelled group, `aria-pressed`. "All" first, then only categories that have published work. `--fs-ui`, `--text-3`, hover `--text-1`. Active: `--text-1`, 1 px underline at 6 px offset. No pills, no boxes, no counts. Gap 20. Hit area 36 tall, 44 on touch |
| **Video language** | One native `<select>`, inline-end of the row, labelled "Video language", default "All languages". Names from `Intl.DisplayNames`. Only when 2 or more languages exist. 1 px `--line-3`, radius 2, transparent, 36 tall |
| **Logic** | Category AND language. Reflected in `?category=&lang=` so a filtered view can be sent to a client |
| **Change** | Cards appear at once, with a 200 ms opacity fade on the new set. No shuffling |
| **No match** | "Nothing in this combination yet." with a text button "Show all work" |
| **JS off** | The filter bar is hidden, and every card is on the page. No dead controls |

Below 640: H2, then the category row, scrolling sideways with no scrollbar and a 24 px fade at the inline-end edge (flip with `:dir(rtl)`).
Language select on its own line below.

**Administrator slot.** "Add video" and "Manage work" sit at inline-end of the All work row, or under the first row when All work is omitted.
Ghost buttons, visible on every screen size including mobile. Rendered only for an authenticated administrator, so they are not in public HTML
at all.

### Other states

- **Empty:** H2 hidden. One line in `--text-2`: "New work is on the way." The Add video button for an administrator.
- **Error:** One line: "The work could not be loaded." with a Retry link. Never sample cards.
- **Loading:** cards are server-rendered, so no skeletons on the public page.

---

## 7. Header and identity

### Layout, 1024 and up

Height 64. Lockup at inline-start. Everything else at inline-end, in brief order:

`Work` `Services` `About` · language selector · **Contact**

- Links: `--fs-ui`, `--text-1`. Hover: 1 px underline at 6 px offset, no colour change. Gap 28.
- Language selector 20 after About, Contact 16 after that.
- **Contact:** the one solid button. White, `--on-accent` text, 36 tall, padding-inline 16, radius 2. Hover `--accent-hover`, press
  `--accent-press`. Links to `#contact`.
- Links point at `/{locale}#work` and so on, so they work from `/work/[slug]`.

### Sticky

`position: sticky; inset-block-start: 0`. Fixed height, never shrinks, never hides, so nothing can jump. Background
`color-mix(in srgb, var(--bg) 86%, transparent)` with `backdrop-filter: blur(16px)`, solid `--bg` where unsupported. Thumbnails pass faintly
behind it while scrolling, the page's real overlap. A 1 px `--line-1` bottom hairline fades in over the first 64 px of scroll using a
scroll-driven animation; without support there is simply no hairline.

### Language selector

- `<details>` and `<summary>` containing plain links, so it works with JS off. Light JS adds Escape and click-outside.
- Summary: 16 px globe outline and the current language code (`EN`), `--fs-ui`, `--text-2`, hover `--text-1`. **No flags.** A flag is a country,
  not a language.
- Panel: `--surface-2`, 1 px `--line-2`, radius 4, padding 8, two columns, opens at inline-end, opacity fade `--dur-3`, no shadow.
- Panel label: **"Site language"**, deliberately different from the "Video language" filter, so visitors never confuse them.
- Items are autonyms, each with its own `lang` attribute, so each renders in the right font and direction: English, Français, Español, Português,
  Deutsch, Italiano, العربية, 中文, 日本語, 한국어, हिन्दी, Yorùbá, Hausa, Igbo, Kiswahili, Русский, Türkçe.
- Current language: `aria-current="true"`, white with a 1 px underline. Others `--text-2`.
- Only locales actually shipped are listed. The Quality Engineer owns that list.

### Below 1024

Lockup at inline-start. Contact (32 tall, 13 px, padding-inline 12, hit area extended to 44 with a pseudo-element) and a 44 x 44 menu toggle at
inline-end. Two lines, not three: 18 wide, 1.5 thick. Height 64, or 56 below 640. Language moves into the menu.

Menu: `<details>`-based sheet under the header, solid `--bg`, full height. Links at `--fs-h2`, `--text-1`, gap 8, then a hairline, then the
two-column language list. 360 ms opacity. Light JS closes it on link tap and Escape, and locks scroll. With JS off the toggle still opens and closes
it, and a link tap needs one more tap to close the sheet. That is acceptable.

### Brand mark: the playhead

The silhouette is a single frame. The notch and slit are a **playhead**, the marker every editor watches all day: the triangle head drops into the
top edge and its line runs through to the bottom. Together they read as an **M**. It is the tagline as a drawing: this frame, right here.

```svg
<svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
  <path d="M1 2H5L9 7.6V18H1Z"/>
  <path d="M19 2H15L11 7.6V18H19Z"/>
</svg>
```

- Sharp corners, one colour via `currentColor`, no gradients. The slit is 2 units, which lands on whole pixels at 20 px.
- Rendered at 16, 20, 24, 32, 64 and 160 px: reads as an M at all of them, with the slit still open at 16.
- Sizes: 20 in the header, 16 in the favicon, on `--bg`.
- Wordmark: "Mayor Studios", 16 px, Onest 600, -0.01em, `--text-1`. Mark to wordmark gap 8. No two-tone.
- The lockup keeps `dir="ltr"` in Arabic, so the mark stays left of the Latin wordmark. The whole lockup still moves to the inline-start side. The
  brand name is never translated.

### Administrator upload shortcut

The room is reserved: nothing sits within 44 px of the wordmark at any width.

- A 28 x 28 ghost icon button (arrow into a tray, 16 px) at `inset-inline-start: calc(100% + 8px)` of the lockup.
- Hover-capable devices: `opacity: 0`, to 1 in 200 ms on lockup `:hover` and `:focus-within`. 8 px of padding bridges the gap, so the pointer can
  reach it without it vanishing.
- Touch: always visible for an administrator, as the brief requires a visible tap-based control.
- Rendered only for an authenticated administrator. **Public HTML contains nothing.**

---

## 8. Sections after the portfolio

Order: Services, About, Contact, footer. Together about 1.3 screens at 1440 x 900. All on the three lines. Judged on the mock: they carry weight through
white type and structure and do not read as lightweight beside the thumbnails, though the empty column below each H2 must be re-checked on the real build.

### Services, `#services`

Editorial rows, not three feature cards with icons.

- A 1 px `--line-1` hairline across the page shell, 64 above it (clear of the floor light), `--section-y` below it, `--section-y` after the rows.
- 1024 and up: H2 in column 1. Rows span columns 2 and 3, each with a 1 px `--line-2` top border and 24 padding, plus a bottom border on the last row.
  Service name (`--fs-h3`, `--text-1`) on the second line, description (`--fs-body`, `--text-2`, 44ch at most) on the third line.
- 640 to 1023: H2 above, rows use one third and two thirds. Below 640: name above description, gap 8.

| Service | Description | Support in the brief |
|---|---|---|
| Video editing | From raw footage to a finished cut, with thoughtful decisions shot by shot. | "Thoughtful video editing", "professional video editing studio" |
| Cinematic storytelling | Pace, mood and structure that hold attention, across different genres and styles. | "Cinematic storytelling", "across different genres, styles" |
| Language versions | A separate version of the video for each language, with subtitles where needed. | Implied by "samples across... languages". **Client must confirm this is a service** |

Colour grading, sound design and motion graphics are **not listed**, because the brief does not say the studio offers them.

### About, `#about`

- No top padding, so the gap from Services is one `--section-y`. `--section-y` below.
- H2 in column 1. Copy in columns 2 and 3 at `--fs-statement`, `--text-1`, 34em at most, 0.8em between paragraphs. Large, white and short, so it carries weight
  with no filler.

> Mayor Studios is a video editing studio. We work across genres, styles and languages, and we treat every cut as a decision that matters.
>
> Send us your footage and tell us what it needs to do.

No founder name, location, years in business or client names, because none are in the brief. If the client supplies them, they go here. **The tone is my
proposal; the client should confirm it.**

### Contact, `#contact`

Full-bleed `--surface-1` band, the one section change of surface, so the page ends on something solid. Block padding `--section-y`. No form: the brief asks for
WhatsApp and email only.

| Column 1 | Column 2 | Column 3 |
|---|---|---|
| H2 "Contact", then `--text-2` line "Tell us about your project.", 12 between | Overline "WhatsApp" | Overline "Email" |
| | `+234 906 074 3239` (`--fs-h3`) | `georgesamuel605@gmail.com` (`--fs-h3`, `overflow-wrap: anywhere`) |
| | Solid white button with WhatsApp logo: "Chat on WhatsApp" | Ghost button: "Send an email" |

- Buttons 48 tall, padding-inline 20, radius 2, 16 below the value. 12 from overline to value.
- WhatsApp: `https://wa.me/2349060743239`. Logo 20 px, official glyph, monochrome in `--on-accent`. No green, since white is the only accent. See section 11.
- Email: `mailto:georgesamuel605@gmail.com`.
- Values are selectable plain text, so nobody has two links to the same place.
- 640 to 1023: H2 above, two equal blocks. Below 640: everything stacks, 32 between blocks, full-width buttons.

### Footer

`--bg`, 1 px `--line-1` top, 72 tall at 640 and up. `© 2026 Mayor Studios` (year computed) on the first line in `--text-3`, at `--fs-ui`. Links `Work` `Services`
`About` `Contact` on the third line, `--text-2`, hover `--text-1`, gap 24. Below 640 it stacks. Nothing else: no newsletter, no social links (none given), no fake
address.

---

## 9. Depth

Depth comes from light and layering, never from shadows. `box-shadow` is not used for elevation anywhere.

1. **Floor light.** Real colour from real work, as the only coloured light on the page.
2. **The lamp comes up.** Thumbnails rest 8% dim and reach full brightness on hover.
3. **Luminance steps.** `--bg` to `--surface-1` to `--surface-2`, 1.06:1 and 1.13:1. Panels are defined by a step and a hairline.
4. **Edge catch.** A 1 px inset line at 6% white on thumbnails, so dark frames keep their edge against a dark page.
5. **Real overlap.** The translucent sticky header passing over moving thumbnails, the play chip over the image, the player over the page. Thumbnails never overlap
   each other: that would crop the artwork and break the consistent proportions the brief asks for.
6. **Contact band.** One tonal shift, at the end of the page.

---

## 10. What I will not do

- Text, gradients or scrims on thumbnails.
- Card containers, borders or shadows around thumbnails, or cards inside cards.
- Glow, neon, glass panels, blur blobs, gradient text, grain or noise.
- Any colour outside the thumbnails, except `--danger` in the Studio. No green WhatsApp, no crimson, no serif from the old build.
- Pills or any radius above 4 px.
- Three-up icon feature grids, numbered 01 02 03 lists, or mono capitals as eyebrow labels.
- Scroll-triggered fade-ups, parallax, marquees, custom cursors, magnetic buttons, page-load sequences or shimmer skeletons.
- A second hover behaviour on any card.
- Hover or background video, or anything that autoplays.
- Flags for languages.
- Stats, client logos, testimonials, awards or invented facts.

---

## 11. Requests and open questions

### For the lead: `src/lib/portfolio/types.ts`

1. **Replace the categories before anything is seeded or translated.** Current values are film-production genres, and `brand-film` overlaps `corporate`, `social` overlaps
   everything. Buyers of editing shop by format, as CreatorCut's filters show. Proposed: `long-form`, `short-form`, `documentary`, `brand`, `music-video`, `podcast`. Cheap
   now; expensive after the database constraint and 16 translation files exist. Client to confirm.
2. **Add `Project.poster?: ThumbnailImage`.** With 4:5 card crops, the player has nothing suitable for its 16:9 first frame. This is also where the uncropped master lives,
   so cards can be re-cut if `--thumb-ratio` ever changes.
3. **Redefine `thumbnail` in the comment:** "Pre-cut to the card ratio, widths 480/800/1200, `dominantColor` from the crop." `focusX` and `focusY` stay, as the fallback for
   non-4:5 images.

No other change is needed. Cards read the first version's duration and all versions' languages as typed.

### For the lead: other

4. **Install:** `@fontsource-variable/onest`, `@fontsource-variable/chivo-mono`, `@fontsource-variable/noto-sans-arabic`, `@fontsource-variable/noto-sans-devanagari`.
5. **Load them from the root layout**, which the lead owns, importing each package's `wght.css`. I made no check of this against `node_modules/next/dist/docs/`, so confirm the
   import form there.
6. **Port conflict.** The note for this review says the dev server is on `localhost:3000`, but `ARCHITECTURE.md` reserves 3000 for the user's ShopWise app and requires 3001. I did
   not touch either port. Later screenshot reviews assume 3001.

### For the Media Engineer

7. Upload: 4:5 preview with a focal point, derivatives at 480/800/1200, a warning below 800 wide after the crop, dominant colour from the crop, and a warning above three
   featured projects.
8. Demo thumbnails are the first impression and carry this whole design. Cinematic frames, single subject, no text or logos, passing a 4:5 crop, with varied hue across the first
   row. The Creative Director reviews them on screen before sign-off.

### For the Quality Engineer

9. Test that `html[lang]` and `dir` are set correctly, because every script override depends on `:lang()`.
10. Test with real glyphs: `Ẹ́ iṣẹ́ ọ̀` (Yoruba), `ɓ ɗ ƙ` (Hausa), `ị ọ ụ ṅ` (Igbo). These are glyph tests, not translations.
11. Match the headline and CTA text case-insensitively in end-to-end tests, as the case is an open client question.

### For the client

1. **Headline case.** Sentence case ("We make every frame matter.", "Explore our work") as in your reference, or capitals as written in the brief? Changing is one line.
2. **4:5 crop.** Most of your work is 16:9, so cards show a tall slice. Do your existing thumbnails have burned-in text? If so they need clean frames.
3. **Categories.** Do the six proposed match how you describe your work?
4. **Services.** Are language versions and subtitles something you sell? Should colour, sound or motion graphics be listed?
5. **About.** Anything factual you want added (name, location, how long you have worked)? Nothing has been invented.
6. **WhatsApp logo.** Monochrome here, to keep white as the only accent. Tell us if you want the green.

---

## 12. Verification log

Plain record of what was actually checked, on 2026-11-04.

### Verified by running it

| Item | How | Result |
|---|---|---|
| Packages exist | `npm view` on 16 `@fontsource-variable/*` packages | All exist. Versions in section 3 |
| Glyph coverage | Characters routed through each package's real `wght.css` ranges, then checked against the served file's cmap | Table in section 3. My first checker wrongly failed `ı` and `œ` on every font, because ranges overlap; corrected and re-run for Onest, Inter Tight, Hanken and Chivo Mono |
| Marks stacking | Viewed at 19 px, with a serif fallback that makes misses obvious, in headless Edge | Onest clean for Yoruba, Hausa, Igbo, Russian and Turkish |
| Contrast | Calculated by script | Table in section 4. Floor-light worst case rests on my estimate of `#1c1c1c` |
| First-screen numbers | Static mock in headless Edge. Elements measured at exact 1440 x 900, 1920 x 1080 and 390 x 844 | Table in section 2 |
| Composition | **Looked at** the screenshots: 1440 x 900, 390 x 844, and the full page at 1440 | Basis of the judgements in this document |
| Mark | **Looked at** six sizes | Reads as an M at all |
| Arabic, Devanagari | **Looked at** 48 px specimens | Joined and shaped correctly |

Mock screenshots, scratch only, not in the project:
`C:\Users\DELL\AppData\Local\Temp\claude\a1e53167a7f1637c\83d051af-95b1-4b04-9425-df047bb99ebd\scratchpad\fontcheck\out\first.png`,
`C:\Users\DELL\AppData\Local\Temp\claude\a1e53167a7f1637c\83d051af-95b1-4b04-9425-df047bb99ebd\scratchpad\fontcheck\out\full.png`,
`C:\Users\DELL\AppData\Local\Temp\claude\a1e53167a7f1637c\83d051af-95b1-4b04-9425-df047bb99ebd\scratchpad\fontcheck\out\spec.png`.

### Not verified

- **The real site.** None of it exists yet. The mock is hand-written static HTML, not the build. Nothing is finished.
- **The mock flatters.** Its thumbnails are crops of the client's reference image, which is unusually strong. Real and demo thumbnails will decide how this looks, and they are not 4:5
  crops of 16:9 frames yet. That is the largest open risk.
- **1920 x 1080** was measured, but I did not look at the image.
- **Tablet, 640 to 1023**, was not rendered at all. Three narrow columns may need caption work.
- **RTL layout** was not rendered. Only Arabic text was.
- **Motion:** the hover was only seen as a static end state. Timing, reduced motion and the sticky header during scroll were not seen.
- **Floor-light banding** on a real display. A screenshot cannot settle it, and near-black is where it shows.
- **Yoruba at display size in Onest.** The 48 px specimen ran before the switch from Hanken, so Onest was only seen at 19 px. Line height 1.16 needs a re-check.
- **The Demo tag in `--text-2`.** The mock showed it in `--text-1`, where three tags competed with the titles, so I lowered it without re-rendering.
- **Other browsers.** Edge only. Firefox and Safari mark stacking, `last baseline` and `oklch(from ...)` were not tested.
- **Touch, keyboard focus and JS-off behaviour** were specified, not exercised.
- **The dev server** was not contacted on any port.

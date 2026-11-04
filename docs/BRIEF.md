# Client brief (verbatim)

Received 2026-11-03. Do not edit. Decisions that interpret this brief live in `ARCHITECTURE.md`.

Alongside the brief, the client attached `docs/reference/vidhub-reference.png` and wrote:

> this is image is to be used to give you idea on how things should be, i prefer darl layouts to white though
> https://www.framer.com/marketplace/templates/creatorcut/
> https://frame.io/

---

MAYOR STUDIOS

Premium Video Editing Portfolio | Fresh Build and Multi-Agent Orchestration

You are the lead creative director, product designer, frontend engineer, and technical architect working on Mayor Studios.

We are starting a fresh implementation. Previous project work should be treated as reference material and design guidance only. Do not blindly reuse old layouts, branding, components, or assumptions.

The brand name is now Mayor Studios.

Mayor Studios is a professional video editing studio that showcases video editing samples across different genres, styles, and languages.

The purpose of the website is to present the studio's work beautifully, allow visitors to explore video samples, communicate the studio's capabilities, and make it easy for potential clients to get in touch.

The most important priorities are:

1. Premium visual design.
2. Video portfolio presentation.
3. Real, convenient video upload and media management.
4. Multilingual interface and video-language support.
5. Clean, professional user experience.
6. Excellent responsive behavior.

This is a portfolio for a video editing studio, not a true crime website, generic agency template, or complicated streaming platform.

PHASE 1: CREATIVE DIRECTION

Before implementation, establish a clear visual concept.

The website should feel like a premium independent creative studio. Simple, confident, cinematic, and visually rich.

Visual language

Use:

- Deep black and charcoal backgrounds.
- Pure, bright white typography.
- High-contrast headlines.
- Refined typography pairing.
- Strong visual hierarchy.
- Subtle atmospheric depth.
- Clean media compositions.
- Carefully controlled spacing.
- Smooth transitions.
- High-quality video thumbnails.
- Elegant, understated interaction states.

The typography should be crisp and bright against the dark interface.

Use depth through composition, overlapping media, subtle lighting, and carefully designed surfaces rather than heavy shadows or excessive gradients.

The interface should feel polished and intentional.

Avoid:

- Generic AI-generated website layouts.
- Excessive cards within cards.
- Unnecessary decorative elements.
- Excessive rounded corners.
- Bright colors that compete with the media.
- Heavy shadows.
- Noisy backgrounds.
- Excessive animation.
- Large sections of unnecessary text.
- Fake testimonials, statistics, or clients.

Use pure white as the primary visual accent. Other colors should be used sparingly and only when they improve clarity.

Graphic direction

Treat the video thumbnails as the visual artwork of the website.

The portfolio should feel like a curated screening gallery.

Use consistent thumbnail proportions, refined spacing, high-quality previews, and subtle motion.

Hover interactions may reveal:

- A play icon.
- Project title.
- Category.
- Language availability.
- A subtle visual transition.

Avoid making every card animate in a different way.

The motion should feel smooth, deliberate, and premium.

PHASE 2: WEBSITE STRUCTURE

The portfolio must be visible and accessible near the top of the page.

Do not bury the actual video work below a long hero section or multiple marketing sections.

1. Navigation

Create a minimal navigation system featuring:

- Mayor Studios identity.
- Work.
- Services.
- About.
- Language selector.
- Contact.

Use a clean, understated layout.

The navigation should remain simple and responsive.

2. Hero

Create a compact but visually memorable introduction.

Suggested headline:

"WE MAKE EVERY FRAME MATTER."

Supporting copy:

"Thoughtful video editing. Cinematic storytelling. Content crafted to leave an impression."

CTA:

"Explore Our Work"

The hero must not dominate the entire page.

The portfolio should appear immediately after the hero or be integrated into the first screen where appropriate.

Do not make visitors scroll through a large hero to reach the actual work.

3. Featured Video Portfolio

This is the centerpiece of the website.

The portfolio should be one of the first major sections visitors encounter.

Create a visually striking, responsive grid of video cards.

Each card should support:

- High-quality thumbnail.
- Video title.
- Category.
- Duration.
- Language or available language versions.
- Optional featured label.
- Play interaction.

The card should have a polished visual treatment.

Use a consistent aspect ratio and allow the media to occupy most of the card.

Clicking a card should open a cinematic player or project detail view.

The player should support available video versions and subtitles where configured.

Include simple category and language filters if useful. Keep filtering minimal and easy to understand.

Use real portfolio data. Clearly label any initial sample content as demonstration content.

PHASE 3: MEDIA MANAGEMENT EXPERIENCE

Media management is a core product feature, not an afterthought.

The studio owner must be able to upload and manage portfolio samples easily.

Upload interaction

Explore a refined interaction in which an authenticated administrator can hover over the Mayor Studios logo to reveal a small upload shortcut.

However, do not make hover the only way to upload.

The recommended design is:

- Public visitors see the clean Mayor Studios logo.
- An authenticated administrator sees a subtle upload icon or quick action on hover.
- The portfolio section includes an administrator-only "Add Video" or "Manage Work" action.
- An authenticated administrator can access a dedicated media management view.
- On mobile, upload actions must be available through a visible tap-based control.

The interaction should feel natural and integrated into the design.

Do not expose upload controls to unauthenticated public visitors.

Media management interface

Create a clean, premium media management experience.

It should feel like a natural extension of the portfolio rather than a separate, generic admin dashboard.

The owner should be able to:

- Securely log in.
- Upload videos.
- Upload or select thumbnails.
- Add titles and descriptions.
- Select categories.
- Add duration and relevant metadata.
- Add language versions.
- Upload subtitle files where supported.
- Preview videos.
- Feature or unfeature projects.
- Publish or unpublish projects.
- Edit existing projects.
- Delete projects.
- View upload progress.
- See clear validation and error states.

Use an intuitive upload workflow.

A good experience could include a drag-and-drop upload area, followed by metadata entry and a clear publish action.

Avoid unnecessary steps.

Portfolio data model

Design the system around projects and their media versions.

A project should have:

- ID.
- Title.
- Description.
- Category.
- Thumbnail.
- Featured status.
- Publication status.
- Created and updated timestamps.

A project may contain multiple video versions.

Each version should support:

- Language.
- Video asset.
- Optional thumbnail.
- Optional subtitle file.
- Optional duration.
- Optional version-specific metadata.

The public portfolio cards should read from the actual project data.

Do not hardcode the portfolio as static cards.

PHASE 4: MULTILINGUAL SUPPORT

The website must support multiple interface languages.

English should be the default.

Prepare support for:

French, Spanish, Portuguese, German, Italian, Arabic, Chinese, Japanese, Korean, Hindi, Yoruba, Hausa, Igbo, Swahili, Russian, and Turkish.

Requirements:

- Proper centralized translation resources.
- Functional language switching.
- Consistent translation coverage.
- Sensible fallback behavior.
- Right-to-left layout support for Arabic.
- Correct language metadata.
- Localized navigation, buttons, forms, and messages.

Do not pretend that translations are complete if they have not been implemented and reviewed.

Distinguish interface language from video language

The language of the website is separate from the language of the uploaded video.

For example, a visitor may browse the website in French while viewing a video available in English, Spanish, or another language.

A project may have multiple uploaded versions.

Allow the visitor to select the available version in the video player.

Do not automatically translate video files or assume that a translated interface means a translated video exists.

The administrator must be able to upload each language version separately.

PHASE 5: CONTACT

Include a clean contact section with:

WhatsApp: +234 906 074 3239

Email: georgesamuel605@gmail.com

Use a WhatsApp logo beside the WhatsApp CTA.

Use the direct link:

https://wa.me/2349060743239

Display the phone number in international format.

Ensure all contact links work.

Do not invent additional contact details.

PHASE 6: MULTI-AGENT ORCHESTRATION

Use Claude Code's native subagent capabilities where available.

Do not merely describe agents. Actually invoke them.

The main Claude agent acts as the lead architect and orchestrator.

Use the following team:

Agent 1: Creative Director and UI Specialist

Responsible for:

- Visual research.
- Design system.
- Typography.
- Layout composition.
- Portfolio visual treatment.
- Graphic quality.
- Motion and transitions.
- Responsive UI review.

The agent should focus on making the site visually premium, clean, and professional.

Agent 2: Media and Portfolio Engineer

Responsible for:

- Portfolio architecture.
- Video cards.
- Media player.
- Upload workflow.
- Project management.
- Video language versions.
- Media storage integration.
- Admin experience.

Agent 3: Technical Quality Engineer

Responsible for:

- Multilingual architecture.
- Accessibility.
- Security.
- Performance.
- Responsive testing.
- Integration review.
- Build and functional testing.

Orchestration requirements

1. First inspect the current repository and identify the actual state.
2. Establish clear ownership of files and components.
3. Have agents independently review their areas.
4. Ask for findings and recommendations before major implementation.
5. Agree on shared component interfaces.
6. Delegate independent tasks.
7. Avoid multiple agents editing the same components.
8. Integrate and review all changes.
9. Run the actual application and inspect the rendered result.
10. Do not claim that an agent completed work unless it actually did.

If persistent custom agents would be useful, create appropriate definitions in ".claude/agents/".

If those definitions require a fresh Claude Code session to load, explain that clearly.

Do not create unnecessary agents or parallelize tasks that depend on one another.

PHASE 7: ITERATIVE IMPLEMENTATION

Build and refine the project in controlled iterations.

Do not attempt to generate the entire website in one uncontrolled pass.

Iteration 1: Design foundation

Establish the brand identity, visual system, typography, navigation, hero, and portfolio placement.

Implement the first visual version.

Run the application and inspect the actual interface.

Iteration 2: Portfolio UI

Refine the video cards, grid, hover states, player, and project detail experience.

Focus on composition, thumbnail quality, and premium visual treatment.

Iteration 3: Media management

Implement secure authentication and real upload capabilities.

Connect portfolio cards to the actual media data.

Test upload, editing, publishing, and video playback.

Iteration 4: Multilingual functionality

Implement interface translations and video-language variants.

Test language switching, fallback behavior, and Arabic RTL.

Iteration 5: Visual refinement

Inspect the rendered website.

Improve typography, spacing, transitions, depth, loading states, and responsive layouts.

Keep the site minimal.

Do not add decorative features that do not improve the experience.

Iteration 6: Final integration and testing

Verify the complete website.

Test every major interaction, media upload, language switch, video player, and contact link.

Fix issues before completion.

PHASE 8: PERFORMANCE AND QUALITY

Video files can be large.

Implement appropriate media handling:

- Optimized thumbnails.
- Lazy loading.
- No unnecessary autoplay.
- Load video assets when required.
- Appropriate formats.
- Efficient upload handling.
- Clear upload progress.
- Responsive video playback.
- Sensible loading and error states.

Use existing infrastructure where suitable.

Do not introduce unnecessary dependencies or services.

Never expose private credentials in frontend code.

Do not use Docker unless there is a genuine technical need.

FINAL DESIGN OBJECTIVE

Create a clean, premium, visually impressive portfolio for Mayor Studios.

The website should feel like a high-quality independent creative studio.

The portfolio must be visible near the top of the page.

The video cards should be beautiful, functional, and connected to a real upload system.

The owner should be able to manage media without struggling through a complicated dashboard.

The design should use bright typography against dark surfaces, subtle depth, smooth transitions, and high-quality graphics.

Keep the website simple. Every element should have a purpose.

The finished result should be professional enough to present to real clients.

Start by inspecting the current state, coordinate the specialized agents, and implement the first iteration. Do not stop at an audit or a list of recommendations.

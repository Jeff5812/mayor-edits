import type { Metadata } from "next";
import { ContactSection } from "@/components/site/ContactSection";
import { EndTitle } from "@/components/site/EndTitle";
import { FilmStrip } from "@/components/site/FilmStrip";
import { LiveTimecode } from "@/components/site/LiveTimecode";
import { PointerDepth } from "@/components/site/PointerDepth";
import { PortfolioGrid } from "@/components/site/PortfolioGrid";
import { SiteHeader } from "@/components/site/SiteHeader";
import { buttonClass } from "@/components/ui/Button";
import { getPublishedProjects } from "@/lib/projects/queries";
import { SITE } from "@/lib/site";

// A link shared on WhatsApp shows the lead project's poster, so the preview is real work.
export async function generateMetadata(): Promise<Metadata> {
  const [lead] = await getPublishedProjects();
  return lead?.poster_url ? { openGraph: { images: [lead.poster_url] } } : {};
}

// Takes the column beside the lead frame on desktop, so the work is on screen from the very top of the page. The headline is
// three short lines on every screen, so it keeps one shape everywhere instead of breaking wherever the width happens to fall.
// Its one action sits beside it on a tablet, where there is room, and under it on a phone and on desktop.
function Hero() {
  return (
    <section aria-labelledby="hero-title" className="col-span-2 pb-6 pt-2 sm:pb-8 sm:pt-3 lg:py-2">
      <div className="anim-rise flex items-center justify-between gap-4">
        <p className="label">Video editing studio</p>
        <LiveTimecode />
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-6 lg:block">
        <h1 id="hero-title" className="display display-hero display-lift anim-playhead relative w-fit">
          <span className="anim-scrub block">
            <span className="display-deep block">We make </span>
            <span className="display-deep block">every frame </span>
            <span className="display-deep block">matter.</span>
          </span>
        </h1>
        <div className="anim-rise lg:mt-7">
          <a href="#contact" className={buttonClass("primary")}>
            Send your footage
          </a>
        </div>
      </div>
    </section>
  );
}

export default async function Home() {
  const projects = await getPublishedProjects();
  const leadPoster = projects[0]?.poster_url;
  return (
    <div id="top" className="relative isolate overflow-x-clip">
      <div aria-hidden="true" className="room-light anim-lights">
        {/* The same file as the lead card, so this costs no extra download. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {leadPoster ? <img src={leadPoster} alt="" decoding="async" /> : null}
      </div>
      <PointerDepth />
      <SiteHeader />
      <main>
        <section id="work" aria-label="The reel" className="page-shell pb-10 pt-4 sm:pb-12 sm:pt-5">
          <PortfolioGrid projects={projects}>
            <Hero />
          </PortfolioGrid>
        </section>
        <FilmStrip />
        <EndTitle />
        <ContactSection />
      </main>
      <footer>
        <div className="page-shell flex items-center justify-between gap-4 py-6 text-sm text-mute">
          <span>{SITE.name}</span>
          <span className="flex items-center gap-5">
            {/* A plain link, so the page never fetches the owner's area ahead of time. Everything behind it checks for itself. */}
            <a href="/admin" className="inline-flex min-h-11 items-center text-mute hover:text-bone">
              <span className="link-draw">Owner sign in</span>
            </a>
            <a href="#top" className="inline-flex min-h-11 items-center text-ash hover:text-bone">
              <span className="link-draw">Back to top</span>
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

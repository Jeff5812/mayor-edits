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

// Takes the column beside the lead frame on desktop, so the work is on screen from the very top of the page.
function Hero() {
  return (
    <section aria-labelledby="hero-title" className="sm:col-span-2 lg:col-span-2 lg:py-2">
      <div>
        <div className="anim-rise flex items-center justify-between gap-4">
          <p className="label">Video editing studio</p>
          <LiveTimecode />
        </div>
        <h1 id="hero-title" className="display display-hero display-lift anim-playhead relative mt-2 w-fit lg:mt-3">
          <span className="anim-scrub block">
            <span className="display-deep">We make every frame matter.</span>
          </span>
        </h1>
      </div>
      {/* Desktop only: on a phone the header's button is enough, and the first frame comes sooner. */}
      <div className="anim-rise mt-7 hidden lg:block">
        <a href="#contact" className={buttonClass("primary")}>
          Send your footage
        </a>
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
        <section id="work" aria-label="The reel" className="page-shell pb-8 pt-4 sm:pt-5 lg:pb-12">
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
          <a href="#top" className="inline-flex min-h-11 items-center text-ash hover:text-bone">
            <span className="link-draw">Back to top</span>
          </a>
        </div>
      </footer>
    </div>
  );
}

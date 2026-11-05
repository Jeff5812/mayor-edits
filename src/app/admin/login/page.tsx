import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BackIcon } from "@/components/admin/AdminIcons";
import { LoginForm } from "@/components/admin/LoginForm";
import { SetPasswordForm } from "@/components/admin/SetPasswordForm";
import { BrandMark } from "@/components/site/BrandMark";
import { FilmStrip } from "@/components/site/FilmStrip";
import { LiveTimecode } from "@/components/site/LiveTimecode";
import { assertAdmin } from "@/lib/auth/admin";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

// Reads the URL and the session, so it cannot render ahead of the request.
export const instant = false;

async function isSignedInAdmin() {
  try {
    await assertAdmin();
    return true;
  } catch {
    return false;
  }
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string | string[] }>;
}) {
  const { flow } = await searchParams;
  const settingPassword = flow === "set-password";
  const title = settingPassword ? "Choose your password" : "Sign in";

  // Only administrators are sent on, so a signed-in non-admin cannot bounce between the two pages.
  if (!settingPassword && (await isSignedInAdmin())) redirect("/admin");

  return (
    // Clipped both ways, because the room light is taller than a short page and must not make it scroll.
    <div className="relative isolate flex min-h-dvh flex-col overflow-clip">
      <div aria-hidden="true" className="room-light anim-lights" />
      <div className="page-shell flex items-center justify-between gap-4 pt-3 sm:pt-5">
        <p className="inline-flex items-center gap-2 text-bone">
          <BrandMark />
          <span className="display text-[1.625rem] leading-none">{SITE.name}</span>
        </p>
        <Link href="/" className="group inline-flex min-h-11 items-center gap-2 text-sm text-ash transition-colors duration-200 hover:text-bone">
          <span className="transition-transform duration-300 ease-[var(--ease-settle)] group-hover:-translate-x-1">
            <BackIcon />
          </span>
          Back to the site
        </Link>
      </div>
      <main id="main" className="page-shell grid flex-1 content-center gap-6 py-6 sm:gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
        <div className="anim-rise min-w-0">
          <div className="flex items-center gap-4">
            <p className="label">Owner sign in</p>
            <LiveTimecode />
          </div>
          <h1 className="display display-hero display-lift anim-playhead relative mt-3 w-fit max-w-[5em] lg:mt-4">
            <span className="anim-scrub block">
              <span className="display-deep">The cutting room.</span>
            </span>
          </h1>
        </div>
        <section aria-label={title} className="plate anim-rise w-full max-w-md justify-self-center p-6 sm:p-8 lg:justify-self-end">
          <h2 className="display display-small text-[2.25rem] leading-none tracking-[0.014em]">{title}</h2>
          <div className="mt-6">{settingPassword ? <SetPasswordForm /> : <LoginForm />}</div>
        </section>
      </main>
      {/* Only where the form has room to spare above it: the form always comes first. */}
      <div className="max-lg:hidden [@media(max-height:780px)]:hidden">
        <FilmStrip />
      </div>
    </div>
  );
}

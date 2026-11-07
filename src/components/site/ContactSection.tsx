import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/Button";
import { SITE } from "@/lib/site";

export function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2" aria-hidden="true">
      <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5 shrink-0 fill-none stroke-current stroke-2 transition-transform duration-500 ease-[var(--ease-settle)] group-hover:translate-x-1"
    >
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

// A contact button at a button's size: the icon in its own circle set into the pill's rounded end, the action in plain words,
// and the number or address beneath it, which stays on one line.
function ContactAction({
  href,
  external,
  variant,
  icon,
  action,
  value,
}: {
  href: string;
  external?: boolean;
  variant: "primary" | "outline";
  icon: ReactNode;
  action: string;
  value: string;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={buttonClass(variant, "reveal-scroll group w-full !justify-between !gap-4 !py-3 !pe-5 !ps-3 text-left")}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-ember">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[0.9375rem] font-semibold leading-snug">{action}</span>
          <span className="block truncate text-[0.8125rem] font-medium leading-snug text-ash">{value}</span>
        </span>
      </span>
      <Arrow />
    </a>
  );
}

export function ContactSection() {
  return (
    <section id="contact" aria-labelledby="contact-title" className="page-shell pb-2">
      <div className="plate contact-panel grid gap-7 p-6 sm:gap-8 sm:p-10 lg:grid-cols-6 lg:items-center lg:gap-x-6 lg:p-14">
        <div className="reveal-scroll lg:col-span-3">
          <p className="label">Start a project</p>
          <h2 id="contact-title" className="display display-section display-lift mt-3 max-w-[9em]">
            <span className="display-deep">Got raw footage? Let&apos;s make the cut.</span>
          </h2>
        </div>
        <div className="grid w-full max-w-md gap-3 lg:col-span-3 lg:justify-self-end">
          <ContactAction href={SITE.whatsappUrl} external variant="primary" icon={<WhatsAppIcon />} action="Contact us on WhatsApp" value={SITE.whatsappDisplay} />
          <ContactAction href={SITE.emailUrl} variant="outline" icon={<MailIcon />} action="Email us your brief" value={SITE.email} />
        </div>
      </div>
    </section>
  );
}

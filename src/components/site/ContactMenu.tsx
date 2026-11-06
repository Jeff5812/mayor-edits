import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/Button";
import { SITE } from "@/lib/site";
import { MailIcon, WhatsAppIcon } from "./ContactSection";

const MENU_ID = "contact-menu";

function MenuLink({ href, external, icon, label, value }: { href: string; external?: boolean; icon: ReactNode; label: string; value: string }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="group flex items-center gap-3 rounded-[3px] px-3 py-2.5 transition-colors duration-200 hover:bg-white/[0.07] focus-visible:bg-white/[0.07]"
    >
      <span className="btn-outline flex size-9 shrink-0 items-center justify-center rounded-full">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-bone">{label}</span>
        <span className="block text-[0.8125rem] text-ash [overflow-wrap:anywhere]">{value}</span>
      </span>
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="size-4 shrink-0 fill-none stroke-ash stroke-[1.75] transition-transform duration-300 ease-[var(--ease-settle)] group-hover:translate-x-1"
      >
        <path d="M2 8h11M9 3.500 13.500 8 9 12.500" />
      </svg>
    </a>
  );
}

// Contact options from anywhere on the page. It is the browser's own popover, so it needs no JavaScript: it opens
// on press, closes on Escape or a press elsewhere, and works from the keyboard.
export function ContactMenu() {
  return (
    <>
      <button type="button" popoverTarget={MENU_ID} data-testid="contact-button" className={buttonClass("primary", "header-menu-trigger shrink-0 !min-h-9 !gap-2 !px-3.5 !py-1.5 sm:!px-4")}>
        Contact us
        <svg viewBox="0 0 12 12" aria-hidden="true" className="header-menu-chevron size-3 fill-none stroke-current stroke-[1.75]">
          <path d="M2.500 4.500 6 8l3.500-3.500" />
        </svg>
      </button>
      <div id={MENU_ID} popover="auto" data-testid="contact-menu" className="header-menu plate">
        <MenuLink href={SITE.whatsappUrl} external icon={<WhatsAppIcon />} label="WhatsApp" value={SITE.whatsappDisplay} />
        <MenuLink href={SITE.emailUrl} icon={<MailIcon />} label="Email" value={SITE.email} />
      </div>
    </>
  );
}

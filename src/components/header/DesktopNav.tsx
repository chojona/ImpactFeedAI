import Link from "next/link";

import { NAV_LINKS, type HeaderSection } from "./navLinks";

const LINK_CLASS =
  "inline-flex min-h-10 shrink-0 items-center rounded-md px-3 text-[13px] transition-colors";

export function DesktopNav({ active }: { active?: HeaderSection }) {
  return (
    <nav
      aria-label="Main"
      className="hidden items-center gap-1 md:flex"
    >
      {NAV_LINKS.map((link) => {
        const current = link.section === active;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={`${LINK_CLASS} ${
              current
                ? "border border-brand/35 bg-brand-tint-strong font-medium text-brand-bright"
                : "border border-transparent text-ink-3 hover:bg-brand-tint hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { isMenuCloseKey, nextMenuFocusTarget } from "./menuKeyboard";
import { NAV_LINKS, type HeaderSection } from "./navLinks";

const PANEL_ID_SUFFIX = "panel";

export function MobileNav({ active }: { active?: HeaderSection }) {
  const [open, setOpen] = useState(false);
  const reactId = useId();
  const panelId = `${reactId}-${PANEL_ID_SUFFIX}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const firstLink = panel?.querySelector<HTMLElement>("a[href]");
    firstLink?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (isMenuCloseKey(event.key)) {
        event.preventDefault();
        setOpen(false);
        queueMicrotask(() => buttonRef.current?.focus());
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>("a[href], button"),
      );
      const next = nextMenuFocusTarget(
        items,
        document.activeElement,
        event.shiftKey,
      );
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-line bg-surface-1 text-ink-2 hover:border-line-brand hover:bg-brand-tint hover:text-ink"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        ) : (
          <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
        )}
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute inset-x-0 top-16 z-30 border-b border-line bg-canvas/95 px-5 py-3 backdrop-blur-xl sm:px-6"
        >
          <nav aria-label="Main">
            <ul className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => {
                const current = link.section === active;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={current ? "page" : undefined}
                      className={`flex min-h-10 items-center rounded-md px-3 text-[14px] transition-colors ${
                        current
                          ? "border border-brand/35 bg-brand-tint-strong font-medium text-brand-bright"
                          : "border border-transparent text-ink-2 hover:bg-brand-tint hover:text-ink"
                      }`}
                      onClick={() => setOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      ) : null}
    </div>
  );
}

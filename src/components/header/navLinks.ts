/**
 * Shared in-app destinations for the research terminal header.
 *
 * Only shipped surfaces appear here. Regimes and notebooks stay off the nav
 * until they have real data behind them.
 */
export type HeaderSection =
  | "brief"
  | "calendar"
  | "events"
  | "patterns"
  | "quality";

export type NavLink = {
  href: string;
  label: string;
  section: HeaderSection;
};

export const NAV_LINKS: readonly NavLink[] = [
  { href: "/brief", label: "Brief", section: "brief" },
  { href: "/calendar", label: "Calendar", section: "calendar" },
  { href: "/feed", label: "Events", section: "events" },
  { href: "/patterns", label: "Patterns", section: "patterns" },
  { href: "/quality", label: "Quality", section: "quality" },
] as const;

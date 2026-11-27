import type { Metadata } from "next";
import Link from "next/link";

import { Header } from "@/components/Header";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSection } from "@/components/ui/PageSection";

export const metadata: Metadata = {
  title: "Legal & attribution — ImpactFeedAI",
  description:
    "Data source attribution, research disclaimers, and publisher terms for the personal macro research terminal.",
};

type NoticeLink = { href: string; label: string };

type Notice = {
  title: string;
  body?: string;
  links?: readonly NoticeLink[];
};

const NOTICES: readonly Notice[] = [
  {
    title: "FRED",
    body: "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.",
    links: [
      {
        href: "https://fred.stlouisfed.org/docs/api/terms_of_use.html",
        label: "FRED API terms of use",
      },
      { href: "https://fred.stlouisfed.org/legal/", label: "FRED legal" },
    ],
  },
  {
    title: "Bureau of Labor Statistics",
    body: "BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov.",
    links: [
      {
        href: "https://www.bls.gov/developers/termsOfService.htm",
        label: "BLS developer terms of service",
      },
    ],
  },
  {
    title: "Federal Reserve Board",
    links: [
      {
        href: "https://www.federalreserve.gov/disclaimer.htm",
        label: "Federal Reserve Board disclaimer",
      },
    ],
  },
  {
    title: "U.S. Treasury",
    links: [
      {
        href: "https://fiscaldata.treasury.gov/about-us/",
        label: "About Fiscal Data",
      },
    ],
  },
  {
    title: "Market prices",
    body: "Market prices are shown for personal research only and are not investment advice.",
  },
];

/**
 * Attribution and disclaimer surface for required data-provider notices.
 * Quotes are verbatim from the linked publisher terms.
 */
export default function LegalPage() {
  return (
    <div className="flex flex-1 flex-col text-ink-2">
      <Header />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl px-5 pt-10 pb-24 outline-none sm:px-6 sm:pt-12"
      >
        <PageHeader
          eyebrow="Attribution"
          title="Legal & data attribution"
          lede="Publisher notices for the series and prices shown in this personal research tool."
        />

        <div className="mt-10 space-y-10">
          <PageSection title="Research disclaimer">
            <div className="body-copy space-y-3">
              <p>
                ImpactFeedAI is a personal research tool. It is not investment
                advice.
              </p>
              <p>
                Data may be incomplete or delayed. Values that cannot be
                measured are shown as &ldquo;—&rdquo;.
              </p>
              <p>This app runs locally and does not collect personal data.</p>
            </div>
          </PageSection>

          {NOTICES.map((notice) => (
            <PageSection key={notice.title} title={notice.title}>
              <div className="body-copy space-y-3">
                {notice.body !== undefined && <p>{notice.body}</p>}
                {notice.links !== undefined && (
                  <p>
                    {notice.links.map((link, index) => (
                      <span key={link.href}>
                        {index > 0 ? " · " : null}
                        <a
                          href={link.href}
                          className="text-brand-bright underline-offset-2 hover:underline"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {link.label}
                        </a>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </PageSection>
          ))}

          <p className="caption">
            <Link
              href="/brief"
              className="text-brand-bright underline-offset-2 hover:underline"
            >
              Back to daily brief
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

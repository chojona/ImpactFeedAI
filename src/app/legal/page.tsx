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

/**
 * Attribution and disclaimer surface for required data-provider notices.
 *
 * Quotes are taken verbatim from the linked publisher terms. No privacy policy
 * is invented here — the local-only statement reflects the absence of
 * analytics, tracking, or cookie code in the application source.
 */
export default function LegalPage() {
  return (
    <div className="flex flex-1 flex-col text-ink-2">
      <Header />
      <main className="mx-auto w-full max-w-3xl px-5 pt-10 pb-24 sm:px-6 sm:pt-12">
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
                advice, a brokerage, or a recommendation to buy or sell any
                instrument.
              </p>
              <p>
                Data may be incomplete or delayed. Values that cannot be
                measured are shown as &ldquo;—&rdquo;.
              </p>
              <p>
                This app runs locally and does not collect personal data.
              </p>
            </div>
          </PageSection>

          <PageSection title="FRED">
            <div className="body-copy space-y-3">
              <p>
                This product uses the FRED® API but is not endorsed or
                certified by the Federal Reserve Bank of St. Louis.
              </p>
              <p>
                <a
                  href="https://fred.stlouisfed.org/docs/api/terms_of_use.html"
                  className="text-brand-bright underline-offset-2 hover:underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  FRED API terms of use
                </a>
                {" · "}
                <a
                  href="https://fred.stlouisfed.org/legal/"
                  className="text-brand-bright underline-offset-2 hover:underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  FRED legal
                </a>
              </p>
            </div>
          </PageSection>

          <PageSection title="Bureau of Labor Statistics">
            <div className="body-copy space-y-3">
              <p>
                BLS.gov cannot vouch for the data or analyses derived from
                these data after the data have been retrieved from BLS.gov.
              </p>
              <p>
                <a
                  href="https://www.bls.gov/developers/termsOfService.htm"
                  className="text-brand-bright underline-offset-2 hover:underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  BLS developer terms of service
                </a>
              </p>
            </div>
          </PageSection>

          <PageSection title="Federal Reserve Board">
            <div className="body-copy space-y-3">
              <p>
                Federal Reserve Board data are cited to the Board of Governors
                of the Federal Reserve System.
              </p>
              <p>
                <a
                  href="https://www.federalreserve.gov/disclaimer.htm"
                  className="text-brand-bright underline-offset-2 hover:underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Federal Reserve Board disclaimer
                </a>
              </p>
            </div>
          </PageSection>

          <PageSection title="U.S. Treasury">
            <div className="body-copy space-y-3">
              <p>
                U.S. Treasury Fiscal Data series are attributed to the U.S.
                Department of the Treasury.
              </p>
              <p>
                <a
                  href="https://fiscaldata.treasury.gov/about-us/"
                  className="text-brand-bright underline-offset-2 hover:underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  About Fiscal Data
                </a>
              </p>
            </div>
          </PageSection>

          <PageSection title="Market prices">
            <div className="body-copy space-y-3">
              <p>
                Market prices are shown for personal research only and are not
                investment advice.
              </p>
            </div>
          </PageSection>

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

import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { AssignMainSkipTarget } from "@/components/header/AssignMainSkipTarget";
import { DataAttribution } from "@/components/ui/DataAttribution";

import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ImpactFeedAI — Personal macro research terminal",
  description:
    "Personal macroeconomic research terminal: daily briefs, economic calendar, event reactions, patterns and data-quality visibility.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AssignMainSkipTarget />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <DataAttribution />
      </body>
    </html>
  );
}

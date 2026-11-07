import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import localFont from "next/font/local";
import { resolveSiteUrl } from "@/config/site-url";
import "./globals.css";

/**
 * Typography system:
 * - Display: Basement Grotesque Black (OFL-1.1, basement.studio) — poster headlines only.
 * - Body/UI and smaller headings: Instrument Sans (variable weight + width).
 * - Technical data: IBM Plex Mono.
 */
const basementGrotesque = localFont({
  src: "./fonts/basement-grotesque/BasementGrotesque-Black_v1.202.woff2",
  weight: "900",
  style: "normal",
  variable: "--font-basement",
  display: "swap",
  adjustFontFallback: "Arial",
  preload: true,
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-instrument",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: resolveSiteUrl(),
  title: {
    default: "IntentShield — Know what you sign.",
    template: "%s · IntentShield",
  },
  description:
    "Describe a SOL transfer, inspect the exact supported transaction fields, and confirm what your wallet is being asked to sign. Solana Devnet · non-custodial · deterministic checks.",
  applicationName: "IntentShield",
  openGraph: {
    title: "IntentShield — Know what you sign.",
    description:
      "Plain-language Solana Devnet transfers, verified deterministically against the exact message before your wallet signs.",
    type: "website",
  },
  icons: { icon: "/brand/intentshield-mark.svg" },
};

export const viewport: Viewport = {
  themeColor: "#080d10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${basementGrotesque.variable} ${instrumentSans.variable} ${plexMono.variable}`}
    >
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

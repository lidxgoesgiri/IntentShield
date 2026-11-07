import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { resolveSiteUrl } from "@/config/site-url";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
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
      className={`${spaceGrotesk.variable} ${geistSans.variable} ${geistMono.variable}`}
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

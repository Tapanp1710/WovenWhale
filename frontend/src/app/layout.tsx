import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toaster";
import { SITE_URL } from "@/lib/format";
import "./globals.css";

// One family, two widths: expanded for display (echoing the wordmark), normal for reading.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "WovenWhale — Handwoven shirts and kurtas", template: "%s | WovenWhale" },
  description:
    "Handwoven ikat, jamdani and kalamkari shirts and kurtas for men, made with Indian artisan weavers. Free delivery over ₹999, cash on delivery and 14-day returns.",
  applicationName: "WovenWhale",
  openGraph: {
    type: "website",
    siteName: "WovenWhale",
    locale: "en_IN",
    images: [{ url: "/brand/wovenwhale-logo.jpeg", width: 1024, height: 274 }],
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/brand/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#16324f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={archivo.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

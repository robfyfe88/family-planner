import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import Providers from "@/components/Providers";
import ToasterProvider from "@/components/ToasterProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const title = "Kinfold — family life, planned together";
  const description =
    "One shared household plan for money, childcare, leave cover and family activities.";

  return {
    title,
    description,
    metadataBase: base,
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      shortcut: [{ url: "/favicon-32x32.png" }],
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{
        url: new URL("/og-kinfold.png", base).toString(),
        width: 1200,
        height: 630,
        alt: "Kinfold — family life, planned together",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL("/og-kinfold.png", base).toString()],
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ToasterProvider />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

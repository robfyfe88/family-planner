import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import ToasterProvider from "@/components/ToasterProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HearthPlan — family planning made simple",
  description:
    "Plan annual leave around school closures, model nursery costs with real funding rules, and keep a shared family budget — all in HearthPlan.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001"),
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" }, 
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: [{ url: "/favicon-32x32.png" }],
  },
  openGraph: { /* ... */ },
  twitter: { card: "summary_large_image", title: "HearthPlan" },
};


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

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Caboodle — family planning made simple",
  description:
    "Plan annual leave around school closures, model nursery costs with real funding rules, and keep a shared family budget — all in Caboodle.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001"),
  openGraph: {
    title: "Caboodle",
    description:
      "The all-in-one planner for busy families: leave, childcare costs, and budget in one place.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Caboodle" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

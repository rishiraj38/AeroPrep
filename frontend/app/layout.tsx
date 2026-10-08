import type { Metadata } from "next";
import { Mona_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const monaSanas = Mona_Sans({
  variable: "--font-mona-sans",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai-interview-coach-eight-mu.vercel.app';
const DESCRIPTION = 'Practise job interviews out loud with an AI interviewer that has read your resume. Real follow-up questions, an optional coding round, and a scored report. Three interviews free.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'AeroPrep: spoken mock interviews with an AI interviewer',
    template: '%s | AeroPrep',
  },
  description: DESCRIPTION,
  icons: {
    icon: '/ap.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'AeroPrep',
    title: 'AeroPrep: practise the interview before the interview',
    description: DESCRIPTION,
    url: '/',
    images: [{ url: '/ap.png' }],
  },
  twitter: {
    card: 'summary',
    title: 'AeroPrep: practise the interview before the interview',
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${monaSanas.className} antialiased pattern`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Mona_Sans } from "next/font/google";
import "./globals.css";


const monaSanas = Mona_Sans({
  variable: "--font-mona-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AeroPrep",
  description: "An AI powered platform for mock interviews",
  icons: {
    icon: '/ap.png',
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
      </body>
    </html>
  );
}

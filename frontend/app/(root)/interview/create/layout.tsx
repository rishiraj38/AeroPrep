import type { Metadata } from 'next';

export const metadata: Metadata = { title: "Start an interview" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

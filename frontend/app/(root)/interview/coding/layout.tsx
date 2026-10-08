import type { Metadata } from 'next';

export const metadata: Metadata = { title: "Coding round" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

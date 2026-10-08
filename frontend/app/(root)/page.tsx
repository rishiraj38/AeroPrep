import { cookies } from 'next/headers';
import Dashboard from '@/components/Dashboard';
import LandingEffects from '@/components/LandingEffects';
import { LandingHero } from '@/components/LandingHero';
import { SIGNED_IN_COOKIE } from '@/lib/auth';

// The login itself lives in the browser, so the server goes by a plain "signed in" cookie:
// signed-out visitors get the landing page as real HTML, signed-in ones the dashboard shell.
export default async function HomePage() {
  const signedIn = (await cookies()).has(SIGNED_IN_COOKIE);
  if (signedIn) return <Dashboard />;

  return (
    <>
      <LandingEffects />
      <LandingHero />
    </>
  );
}

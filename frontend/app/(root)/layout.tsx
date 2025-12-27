"use client";


import React, { ReactNode, useEffect, useState } from 'react'
import { isAuthenticated, getUser } from '@/lib/auth'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { MobileNav } from '@/components/MobileNav'

const Layout = ({children}: {children: ReactNode}) => {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isAuthenticated()) {
      setUser(getUser());
    }
  }, [pathname]); 


  if (!mounted) return null;

  const showSidebar = user && !['/sign-in', '/sign-up'].includes(pathname);

  return (
    <main className="min-h-screen bg-dark-100 bg-none font-sans selection:bg-primary-200/30 flex flex-col md:flex-row">
        {showSidebar && (
          <>
            <Sidebar user={user} />
            <MobileNav user={user} />
          </>
        )}
        <div className="flex-1 w-full relative min-w-0">
            {children}
        </div>
    </main>
  )
}

export default Layout

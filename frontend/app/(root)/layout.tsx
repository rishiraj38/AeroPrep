"use client";

import SnowOverlay from '@/components/SnowOverlay'

import React, { ReactNode, useEffect, useState } from 'react'
import { isAuthenticated, getUser } from '@/lib/auth'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Sidebar } from '@/components/Sidebar'
import { MobileNav } from '@/components/MobileNav'

const PUBLIC_PAGES = ['/resources', '/help'];

const Layout = ({children}: {children: ReactNode}) => {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loginChecked, setLoginChecked] = useState(false);
  const [isSnowing, setIsSnowing] = useState(false);

  const toggleSnow = () => setIsSnowing(!isSnowing);

  // The login lives in the browser, so the page renders first and the sidebar joins it once
  // the login has been read; nothing waits on scripts to show content
  useEffect(() => {
    setUser(isAuthenticated() ? getUser() : null);
    setLoginChecked(true);
  }, [pathname]);

  const showSidebar = user && !['/sign-in', '/sign-up'].includes(pathname) && !pathname.includes('/interview/session');
  // Pages a visitor can read without an account have no sidebar, so they get a small header
  const showPublicHeader = loginChecked && !user && PUBLIC_PAGES.includes(pathname);

  return (
    <main className="min-h-screen bg-dark-100 bg-none font-sans selection:bg-primary-200/30 flex flex-col md:flex-row">
        {isSnowing && <SnowOverlay />}
        {showSidebar && (
          <>
            <Sidebar user={user} isSnowing={isSnowing} toggleSnow={toggleSnow} />
            <MobileNav user={user} isSnowing={isSnowing} toggleSnow={toggleSnow} />
          </>
        )}
        <div className="flex-1 w-full relative min-w-0">
            {showPublicHeader && (
              <header className="flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-4 border-b border-white/5">
                <Link href="/" className="flex items-center gap-2">
                  <Image src="/ap.png" alt="" width={48} height={32} />
                  <span className="text-lg font-bold text-white">AeroPrep</span>
                </Link>
                <nav className="flex items-center gap-2">
                  <Link href="/sign-in" className="px-3 py-2 text-sm font-medium text-light-400 hover:text-white transition-colors">Sign in</Link>
                  <Link href="/sign-up" className="btn-primary">Get started</Link>
                </nav>
              </header>
            )}
            {children}
        </div>
    </main>
  )
}

export default Layout

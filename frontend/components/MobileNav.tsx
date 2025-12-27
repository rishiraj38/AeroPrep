"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  History, 
  Settings, 
  LogOut, 
  Play,
  Menu,
  X,
  User,
  HelpCircle
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth";

interface MobileNavProps {
  user: any;
}

export const MobileNav = ({ user }: MobileNavProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const isLocked = pathname.includes('/interview/session') || pathname.includes('/interview/coding');

  const handleLogout = () => {
    logout();
    window.location.href = "/sign-in";
  };

  const routes = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      href: "/",
      active: pathname === "/",
    },
    {
      label: "Start Interview",
      icon: Play,
      href: "/interview/create",
      active: pathname === "/interview/create",
    },
    {
      label: "History",
      icon: History,
      href: "/interview/history",
      active: pathname.startsWith("/interview/history"),
    },
    {
      label: "Settings",
      icon: Settings,
      href: "/settings",
      active: pathname === "/settings",
      disabled: true,
    },
    {
      label: "Help & Support",
      icon: HelpCircle,
      href: "/help",
      active: pathname === "/help",
    },
  ];

  return (
    <div className="md:hidden border-b border-white/5 bg-[#0a0a0f] sticky top-0 z-50">
      <div className="flex items-center justify-between p-4">
         <Link href="/" className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="font-bold text-white tracking-tight">AeroPrep</span>
         </Link>
         <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => !isLocked && setIsOpen(!isOpen)} 
            disabled={isLocked}
            className={cn("text-white hover:bg-white/10", isLocked && "opacity-50 cursor-not-allowed")}
            title={isLocked ? "Finish interview to navigate" : "Open Menu"}
         >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
         </Button>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="absolute top-16 left-0 right-0 bg-[#0a0a0f] border-b border-white/5 px-4 py-6 shadow-2xl animate-in slide-in-from-top-2 duration-200">
           <div className="flex flex-col space-y-2">
              {routes.map((route) => (
                <Link
                  key={route.href}
                  href={route.disabled ? "#" : route.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center px-4 py-3 rounded-xl transition-all duration-200 font-medium",
                    route.active 
                      ? "bg-primary-200/10 text-primary-200" 
                      : "text-gray-400 hover:text-white hover:bg-white/5",
                    route.disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <route.icon className={cn("h-5 w-5 mr-3", route.active ? "text-primary-200" : "text-gray-400")} />
                  {route.label}
                </Link>
              ))}
           </div>
           
           <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
                <div className="flex items-center gap-3 px-4">
                    <div className="h-10 w-10 rounded-full bg-primary-200/10 flex items-center justify-center text-primary-200 border border-primary-200/20">
                        <User className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-white">{user?.name}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                    </div>
                </div>
                <Button 
                    onClick={handleLogout}
                    variant="ghost" 
                    className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4"
                >
                    <LogOut className="h-4 w-4 mr-3" />
                    Sign Out
                </Button>
           </div>
        </div>
      )}
    </div>
  );
};

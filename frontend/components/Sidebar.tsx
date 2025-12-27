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
  User,
  HelpCircle,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth";

interface SidebarProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any;
}

export const Sidebar = ({ user }: SidebarProps) => {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Determine if the user is currently in an active interview session
  const isLocked = pathname.includes('/interview/session') || pathname.includes('/interview/coding');

  const handleLogout = () => {
    if (isLocked) {
      // Optionally, show a toast or alert that they need to finish the interview first
      console.log("Cannot log out during an active interview session.");
      return;
    }
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
  ];

  return (
    <div 
      className={cn(
        "hidden md:flex flex-col h-screen bg-[#0a0a0f] border-r border-white/5 sticky top-0 left-0 z-40 transition-all duration-300 ease-in-out relative group",
        isCollapsed ? "w-20" : "w-72"
      )}
    >
      {/* Toggle Button */}
      <button 
        onClick={() => !isLocked && setIsCollapsed(!isCollapsed)}
        disabled={isLocked}
        className={cn(
          "absolute -right-3 top-10 bg-primary-200 rounded-full p-1 text-white shadow-lg z-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100",
          isLocked ? "cursor-not-allowed bg-gray-600 hover:bg-gray-600" : "hover:bg-primary-300 cursor-pointer"
        )}
        title={isLocked ? "Finish interview to navigate" : "Toggle Sidebar"}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={cn("flex-1 py-6 flex flex-col", isCollapsed ? "px-2" : "px-4")}>
        <Link 
          href={isLocked ? "#" : "/"} 
          onClick={(e) => isLocked && e.preventDefault()}
          className={cn(
            "flex items-center gap-3 mb-8 transition-all px-2", 
            isCollapsed ? "justify-center" : "",
            isLocked && "cursor-not-allowed"
          )}
          title={isLocked ? "Finish interview to navigate" : ""}
        >
          <Logo size="xl" className={cn("transition-all duration-300", isCollapsed ? "w-20 h-20" : "w-24 h-24", isLocked && "opacity-50 grayscale")} />
          {!isCollapsed && (
            <h1 className={cn(
              "text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent tracking-tight whitespace-nowrap overflow-hidden",
              isLocked && "text-gray-500 bg-none"
            )}>
              AeroPrep
            </h1>
          )}
        </Link>
        
        <div className="space-y-2">
          {routes.map((route) => {
            const isStartInterview = route.label === "Start Interview" && !route.active;
            const isDisabled = route.disabled || isLocked;
            
            return (
            <Link
              key={route.href}
              href={isDisabled ? "#" : route.href}
              onClick={(e) => isDisabled && e.preventDefault()}
              title={isLocked ? "Finish interview to navigate" : (isCollapsed ? route.label : undefined)}
              aria-disabled={isDisabled}
              className={cn(
                "group flex items-center py-3 text-sm font-medium rounded-xl transition-all duration-200 ease-in-out relative",
                isCollapsed ? "justify-center px-0" : "px-4",
                route.active 
                  ? "bg-primary-200/10 text-primary-200 shadow-[0_0_20px_rgba(59,130,246,0.1)] border border-primary-200/20" 
                  : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent",
                isStartInterview && !isCollapsed && !isDisabled && "border-primary-200/30 bg-primary-200/5 hover:bg-primary-200/10",
                isDisabled && "opacity-40 cursor-not-allowed hover:bg-transparent text-gray-600"
              )}
            >
              <div className="relative">
                <route.icon className={cn("transition-colors", isCollapsed ? "h-6 w-6" : "h-5 w-5 mr-3", route.active || (isStartInterview && !isDisabled) ? "text-primary-200" : "text-gray-500 group-hover:text-white", isDisabled && "text-gray-700 group-hover:text-gray-700")} />
                {isStartInterview && !isDisabled && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-500"></span>
                  </span>
                )}
              </div>
              {!isCollapsed && <span className={cn("whitespace-nowrap overflow-hidden", isStartInterview && !isDisabled && "text-white", isDisabled && "text-gray-600")}>{route.label}</span>}
              
              {/* Optional click ring */}
              {isStartInterview && !isCollapsed && !isDisabled && (
                 <div className="absolute inset-0 rounded-xl ring-1 ring-primary-200/50 animate-pulse pointer-events-none" />
              )}
            </Link>
          )})}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Helper Link */}
        <div className={cn("pb-2", isCollapsed ? "flex justify-center" : "px-2")}>
           <Link href="/help" className={cn("flex items-center py-3 text-sm text-gray-500 hover:text-white transition-colors", isCollapsed ? "justify-center" : "px-4")}>
              <HelpCircle className={cn(isCollapsed ? "h-5 w-5" : "h-4 w-4 mr-3")} />
              {!isCollapsed && <span className="whitespace-nowrap">Help & Support</span>}
           </Link>
        </div>
        
        {/* User Section */}
        <div className={cn("border-t border-white/5 bg-black/20 rounded-xl mt-2 overflow-hidden", isCollapsed ? "mx-1 p-2" : "m-2 p-4")}>
            <div className={cn("flex items-center mb-4 transition-all", isCollapsed ? "justify-center mb-2" : "gap-3")}>
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary-200 to-primary-300 flex items-center justify-center text-white shadow-lg flex-shrink-0">
                    <User className="h-4 w-4" />
                </div>
                {!isCollapsed && (
                  <div className="overflow-hidden">
                      <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
                  </div>
                )}
            </div>
            <Button 
              onClick={handleLogout}
              variant="ghost" 
              className={cn("w-full text-gray-400 hover:text-red-400 hover:bg-red-500/10 h-9 transition-all cursor-pointer", isCollapsed ? "px-0 justify-center" : "justify-start px-2")}
              title="Sign Out"
            >
              <LogOut className={cn(isCollapsed ? "h-5 w-5" : "h-4 w-4 mr-2")} />
              {!isCollapsed && "Sign Out"}
            </Button>
        </div>
      </div>
    </div>
  );
};

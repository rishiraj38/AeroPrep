import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export const Logo = ({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" | "xl" }) => {
  const sizeClasses = {
    sm: 40,
    md: 145,
    lg: 200,
    xl: 200,
  };

  const pxSize = sizeClasses[size];

  return (
    <div className={cn("relative flex items-center justify-center cursor-pointer", className)}>
      <Image 
        src="/ap.png" 
        alt="Aero Prep Logo" 
        width={pxSize} 
        height={pxSize} 
        className="object-contain" 
        priority
      />
    </div>
  );
};

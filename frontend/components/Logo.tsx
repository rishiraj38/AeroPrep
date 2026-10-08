import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export const Logo = ({ className, size = "md", isSnowing = false }: { className?: string; size?: "sm" | "md" | "lg" | "xl"; isSnowing?: boolean }) => {
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
        height={Math.round(pxSize * 2 / 3)} // the file is 600x400
        className="object-contain" 
        priority
      />
      {isSnowing && (
        <Image
          src="/santa-hat.svg"
          alt="Santa Hat"
          width={pxSize * 0.5}
          height={pxSize * 0.5}
          className="absolute -top-[45%] -right-[20%] rotate-12 z-10 pointer-events-none"
        />
      )}
    </div>
  );
};

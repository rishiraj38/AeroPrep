"use client";
import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Rocket } from "lucide-react";

export const CTASection = () => {
  return (
    <section className="py-24 relative z-20 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-blue-900/20 to-black pointer-events-none" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary-200/20 blur-[100px] rounded-full pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 relative z-10 text-center">
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight">
                Ready to launch your career?
            </h2>
            <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
                Join thousands of developers logging flight hours with AeroPrep and landing their dream jobs at top tech companies.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/sign-up">
                    <Button className="h-16 px-8 text-xl font-semibold rounded-full bg-white text-black hover:bg-primary-100 hover:text-primary-300 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                        Start Your Mission
                        <Rocket className="ml-2 h-6 w-6" />
                    </Button>
                </Link>
                <Link href="/sign-in">
                    <Button variant="outline" className="h-16 px-8 text-xl font-medium rounded-full border-white/20 text-white hover:bg-white/10 hover:border-white/40">
                        View Demo
                    </Button>
                </Link>
            </div>

            <div className="mt-12 flex items-center justify-center gap-8 text-sm text-gray-500 font-medium">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary-200" />
                    No credit card required
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary-200" />
                    Free tier available
                </div>
            </div>
        </div>
    </section>
  );
};

"use client";
import React from "react";
import { Brain, Code2, LineChart, Sparkles, Terminal, Shield } from "lucide-react";

const features = [
  {
    title: "Real-time AI Analysis",
    description: "Get instant feedback on your code quality, complexity, and approach as you type.",
    icon: <Brain className="w-6 h-6 text-primary-200" />,
  },
  {
    title: "Live Execution Environment",
    description: "Run your code in a secure, sandboxed environment supporting 20+ languages.",
    icon: <Terminal className="w-6 h-6 text-primary-300" />,
  },
  {
    title: "Performance Metrics",
    description: "Visual analytics for time complexity, memory usage, and execution speed.",
    icon: <LineChart className="w-6 h-6 text-blue-400" />,
  },
  {
    title: "Smart Hints",
    description: "Stuck? Get context-aware hints that nudge you without giving away the answer.",
    icon: <Sparkles className="w-6 h-6 text-indigo-400" />,
  },
  {
    title: "Industry Standard Patterns",
    description: "Learn best practices and system design patterns used by top tech companies.",
    icon: <Shield className="w-6 h-6 text-blue-500" />,
  },
  {
    title: "Role-Specific Tracks",
    description: "Curated paths for Frontend, Backend, and Full Stack methodologies.",
    icon: <Code2 className="w-6 h-6 text-indigo-500" />,
  },
];

export const FeaturesSection = () => {
  return (
    <section className="py-24 relative z-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-200 to-primary-300 mb-4">
            Everything you need to ace the interview
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            Our platform mimics real-world interview scenarios with advanced AI to prepare you for the toughest technical rounds.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
                <div key={idx} className="group p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-primary-200/30 hover:bg-white/[0.07] transition-all duration-300">
                    <div className="w-12 h-12 rounded-lg bg-black/50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-white/5">
                        {feature.icon}
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-primary-200 transition-colors">
                        {feature.title}
                    </h3>
                    <p className="text-gray-400 leading-relaxed">
                        {feature.description}
                    </p>
                </div>
            ))}
        </div>
      </div>
    </section>
  );
};

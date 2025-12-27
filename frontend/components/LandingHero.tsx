"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Code, Target, TrendingUp, Zap, Award, CheckCircle2, BarChart3, Brain } from "lucide-react";
import { Timeline } from "@/components/ui/timeline";
import { FeaturesSection } from "@/components/FeaturesSection";
import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";

export function LandingHero() {
  const timelineData = [
    {
      title: "Step 1",
      content: (
        <div>
          <p className="text-white text-sm md:text-base font-semibold mb-2">
            Choose Your Role
          </p>
          <p className="text-gray-400 text-xs md:text-sm font-normal mb-8">
            Select from Frontend, Backend, or Full Stack developer tracks. Our AI adapts interview questions based on your chosen specialization and experience level.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-primary-200/10 to-primary-300/10 border border-primary-200/20 rounded-xl p-6 backdrop-blur-sm hover:border-primary-200/40 transition-all cursor-pointer">
              <Code className="h-8 w-8 text-primary-200 mb-3" />
              <p className="text-white font-semibold mb-1">Frontend</p>
              <p className="text-gray-400 text-xs">React, Vue, Angular</p>
            </div>
            <div className="bg-gradient-to-br from-primary-300/10 to-blue-400/10 border border-primary-300/20 rounded-xl p-6 backdrop-blur-sm hover:border-primary-300/40 transition-all cursor-pointer">
              <Target className="h-8 w-8 text-primary-300 mb-3" />
              <p className="text-white font-semibold mb-1">Backend</p>
              <p className="text-gray-400 text-xs">Node.js, Python, Java</p>
            </div>
            <div className="bg-gradient-to-br from-blue-400/10 to-indigo-500/10 border border-blue-400/20 rounded-xl p-6 backdrop-blur-sm hover:border-blue-400/40 transition-all cursor-pointer">
              <Zap className="h-8 w-8 text-blue-400 mb-3" />
              <p className="text-white font-semibold mb-1">Full Stack</p>
              <p className="text-gray-400 text-xs">End-to-end development</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Step 2",
      content: (
        <div>
          <p className="text-white text-sm md:text-base font-semibold mb-2">
            Real-Time AI Interview
          </p>
          <p className="text-gray-400 text-xs md:text-sm font-normal mb-8">
            Practice with our advanced AI interviewer that asks follow-up questions, analyzes your code in real-time, and provides instant feedback on your approach.
          </p>
          <div className="bg-black/40 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-start gap-3 mb-4">
              <Brain className="h-6 w-6 text-primary-200 flex-shrink-0 mt-1" />
              <div>
                <p className="text-white font-medium mb-2">AI Interview Coach</p>
                <p className="text-gray-400 text-sm mb-3">
                  Our AI interviewer asks contextual follow-up questions based on your answers, simulating real interview scenarios.
                </p>
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <div className="flex items-center gap-2 text-gray-300 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary-200" />
                <span>Live code syntax checking</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary-200" />
                <span>Performance optimization tips</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary-200" />
                <span>Best practice suggestions</span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Step 3",
      content: (
        <div>
          <p className="text-white text-sm md:text-base font-semibold mb-2">
            Detailed Performance Analytics
          </p>
          <p className="text-gray-400 text-xs md:text-sm font-normal mb-4">
            Get comprehensive feedback immediately after each session with detailed breakdowns of your performance.
          </p>
          <div className="mb-8">
            <div className="flex items-center gap-2 text-gray-300 text-sm mb-2">
              <BarChart3 className="h-4 w-4 text-primary-200" />
              <span>Overall interview score</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300 text-sm mb-2">
              <BarChart3 className="h-4 w-4 text-primary-300" />
              <span>Code quality assessment</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300 text-sm mb-2">
              <BarChart3 className="h-4 w-4 text-blue-400" />
              <span>Communication effectiveness</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300 text-sm mb-2">
              <BarChart3 className="h-4 w-4 text-indigo-400" />
              <span>Problem-solving approach</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-primary-200/10 to-primary-200/5 border border-primary-200/20 rounded-xl p-6">
              <TrendingUp className="h-8 w-8 text-primary-200 mb-2" />
              <p className="text-2xl font-bold text-white mb-1">85%</p>
              <p className="text-gray-400 text-xs">Average Score</p>
            </div>
            <div className="bg-gradient-to-br from-primary-300/10 to-primary-300/5 border border-primary-300/20 rounded-xl p-6">
              <Award className="h-8 w-8 text-primary-300 mb-2" />
              <p className="text-2xl font-bold text-white mb-1">12</p>
              <p className="text-gray-400 text-xs">Completed Interviews</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Step 4",
      content: (
        <div>
          <p className="text-white text-sm md:text-base font-semibold mb-2">
            Track Your Progress
          </p>
          <p className="text-gray-400 text-xs md:text-sm font-normal mb-8">
            Monitor your improvement over time with comprehensive analytics and personalized recommendations for your interview success path.
          </p>
          <div className="bg-gradient-to-br from-primary-200/5 via-primary-300/5 to-blue-400/5 border border-primary-200/20 rounded-xl p-6 backdrop-blur-sm">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-medium">Technical Knowledge</span>
                  <span className="text-primary-200 text-sm font-semibold">92%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary-200 to-primary-300 w-[92%]"></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-medium">Code Quality</span>
                  <span className="text-primary-300 text-sm font-semibold">78%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary-300 to-blue-400 w-[78%]"></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-medium">Problem Solving</span>
                  <span className="text-blue-400 text-sm font-semibold">85%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 w-[85%]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden font-sans antialiased selection:bg-primary-200/30 bg-black text-white">
        
      {/* WORLD-CLASS BACKGROUND */}
      <div className="absolute inset-0 z-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-black to-black"></div>
          
          <div 
            className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-30 blur-[120px]"
            style={{
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, rgba(37, 99, 235, 0.15) 50%, transparent 70%)',
              animation: 'float 20s ease-in-out infinite'
            }}
          ></div>
          
          <div 
            className="absolute top-1/3 right-0 w-[500px] h-[500px] rounded-full opacity-25 blur-[100px]"
            style={{
              background: 'radial-gradient(circle, rgba(96, 165, 250, 0.25) 0%, rgba(59, 130, 246, 0.12) 60%, transparent 70%)',
              animation: 'float 18s ease-in-out infinite 2s'
            }}
          ></div>
          
          <div 
            className="absolute bottom-1/4 left-0 w-[400px] h-[400px] rounded-full opacity-20 blur-[90px]"
            style={{
              background: 'radial-gradient(circle, rgba(147, 197, 253, 0.2) 0%, transparent 70%)',
              animation: 'float 15s ease-in-out infinite 4s'
            }}
          ></div>
          
          <div className="absolute inset-0 opacity-[0.15]" style={{
            backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.15) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 80%)'
          }}></div>
          
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_70%,rgba(0,0,0,0.8)_100%)]"></div>
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
      `}</style>

      {/* Header */}
      <header className="relative z-50 w-full max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
              <Link href="/" className="group flex items-center gap-3 cursor-pointer">
                  <Logo size="md" /> 
                  <span className="text-2xl font-bold text-white group-hover:text-primary-200 transition-colors duration-300">AeroPrep</span>
              </Link>

              <div className="flex items-center gap-4">
                  <Link href="/sign-in">
                      <button className="text-sm font-medium text-gray-300 hover:text-white transition-colors duration-300 cursor-pointer">
                          Login
                      </button>
                  </Link>
                  <Link href="/sign-up">
                      <Button className="group relative overflow-hidden rounded-full bg-gradient-to-r from-primary-200 to-primary-300 hover:from-primary-200 hover:to-primary-300 text-white px-6 py-6 font-medium shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] transition-all duration-300 cursor-pointer">
                          <span className="relative z-10 flex items-center gap-2">
                              Get Started 
                              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                          </span>
                          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                      </Button>
                  </Link>
              </div>
          </div>
      </header>

      {/* Hero Content - Left Aligned */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-20 w-full">
          
          <div className="max-w-4xl mb-32">
              {/* Main Headline */}
              <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tight mb-8 leading-[0.95]">
                  <span className="block text-white">Ace Your</span>
                  <span className="block bg-gradient-to-r from-primary-200 via-primary-300 to-blue-400 bg-clip-text text-transparent">
                    Technical Interviews
                  </span>
              </h1>
              
              {/* Subheadline */}
              <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mb-12 leading-relaxed font-light">
                  Master your coding skills with advanced AI feedback. Get real-time performance insights, detailed analytics, and a personalized path to interview success.
              </p>

              {/* CTA */}
              <div className="flex items-center gap-4">
                  <Link href="/sign-up">
                      <Button className="group h-14 px-10 text-lg font-semibold rounded-2xl bg-gradient-to-r from-primary-200 to-primary-300 hover:from-primary-200 hover:to-primary-300 text-white shadow-[0_0_40px_rgba(59,130,246,0.4)] hover:shadow-[0_0_50px_rgba(59,130,246,0.6)] transition-all duration-300 cursor-pointer">
                         Test Yourself Now
                          <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                      </Button>
                  </Link>
              </div>
          </div>

      </main>

      {/* How It Works Timeline Section */}
      <div className="relative z-10 -mt-20">
        <Timeline data={timelineData} />
      </div>

      {/* Features Section */}
      <FeaturesSection />

      {/* Final CTA Section */}
      <CTASection />

      {/* Updated Footer */}
      <Footer />

    </div>
  );
}

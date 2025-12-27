"use client";

import { Button } from '@/components/ui/button'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { isAuthenticated, getUser, logout } from '@/lib/auth'
import { getInterviewHistory } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Rocket, BarChart2, Palette, Server, Layers, Clock, CheckCircle, TrendingUp, Shield, Plane, ArrowRight } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { LandingHero } from '@/components/LandingHero'

interface Interview {
  id: number;
  status: string;
  createdAt: string;
  feedback: {
    totalScore: number;
    recommendation: string;
  } | null;
  _count: {
    questions: number;
  };
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [averageScore, setAverageScore] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated()) {
      setUser(getUser());
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchDashboardData() {
    try {
      const data = await getInterviewHistory();
      
      // Calculate Average Score
      const completedInterviews = data.filter((i: any) => i.status === 'completed' && i.feedback);
      if (completedInterviews.length > 0) {
        const total = completedInterviews.reduce((acc: number, curr: any) => acc + (curr.feedback?.totalScore || 0), 0);
        setAverageScore(Math.round(total / completedInterviews.length));
      }
      
      setInterviews(data);
    } catch (error) {
      console.error('Failed to fetch interviews:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = () => {
    logout();
    setUser(null);
    router.refresh();
  };

  if (!user && !loading) {
    return <LandingHero />;
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Hero / Welcome Section */}
      <section className="relative mb-16">
        <div className="card-cta overflow-hidden relative">
            <div className="z-10 relative max-w-2xl">
                <h2 className="text-4xl sm:text-5xl font-bold leading-tight mb-4 text-white">
                    {user ? `Welcome back, ${user.name.split(' ')[0]}` : "Elevate Your Career."}
                </h2>
                <p className="text-lg text-light-100 mb-8 max-w-lg">
                    {user 
                        ? "Ready to reach new heights? Your preparation plan for interview success is ready." 
                        : "Master your technical interviews with our precision-engineered interview simulator for your career."}
                </p>
                
                <div className="flex flex-wrap gap-4">
                    <Link href={user ? "/interview/create" : "/sign-up"} className="btn-primary flex items-center gap-2">
                        <Rocket className="h-4 w-4" /> 
                        {user ? "Start New Interview" : "Start Preparation"}
                    </Link>
                    {user && (
                        <Link href="/interview/history" className="btn-secondary flex items-center gap-2">
                            <BarChart2 className="h-4 w-4" /> History
                        </Link>
                    )}
                </div>
            </div>
            
            {/* Abstract Decorative Element */}
            <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-gradient-to-l from-primary-200/10 to-transparent pointer-events-none hidden md:block"></div>
            {/* Minimalist abstract shape instead of literal plane */}
            <div className="absolute right-10 top-1/2 -translate-y-1/2 h-64 w-64 border-[20px] border-white/5 rounded-full hidden md:block" />
        </div>
      </section>

      {user && (
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {/* Average Score Card */}
            <div className="card p-6 flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <TrendingUp className="h-24 w-24 text-primary-200" />
                </div>
                <div>
                   <p className="text-light-400 text-sm font-medium uppercase tracking-wider mb-2">Overall Performance</p>
                   <h3 className="text-4xl font-bold text-white mb-1">{averageScore > 0 ? averageScore : '-'}<span className="text-xl text-light-600">/100</span></h3>
                   <p className="text-xs text-light-400">Average across {interviews.filter(i => i.status === 'completed').length} completed interviews</p>
                </div>
                <div className="w-full bg-dark-300 h-1.5 rounded-full mt-6 overflow-hidden">
                    <div className="bg-primary-200 h-full rounded-full" style={{ width: `${averageScore}%` }}></div>
                </div>
            </div>

            {/* Quick Actions / Stats */}
            <div className="card p-6 flex flex-col justify-center gap-4">
                 <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-success-200/20 text-success-200 flex items-center justify-center">
                        <CheckCircle className="h-6 w-6" />
                    </div>
                    <div>
                        <h4 className="text-white font-bold text-xl">{interviews.length}</h4>
                        <p className="text-sm text-light-400">Total Interviews</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary-200/20 text-primary-200 flex items-center justify-center">
                        <Clock className="h-6 w-6" />
                    </div>
                    <div>
                        <h4 className="text-white font-bold text-xl">{interviews.filter(i => i.status !== 'completed').length}</h4>
                        <p className="text-sm text-light-400">In Progress</p>
                    </div>
                 </div>
            </div>

            {/* Latest Activity */}
            <div className="card p-0 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <h3 className="font-semibold text-white">Recent Interviews</h3>
                    <Link href="/interview/history" className="text-xs text-primary-200 hover:text-white transition-colors">View All</Link>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[200px] p-2">
                    {interviews.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-light-600 text-sm">No recent activity</div>
                    ) : (
                        <div className="space-y-1">
                            {interviews.slice(0, 3).map(i => (
                                <Link key={i.id} href={`/interview/history/${i.id}`} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-lg transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-2 w-2 rounded-full ${i.status === 'completed' ? 'bg-success-200' : 'bg-yellow-500'}`}></div>
                                        <div>
                                            <p className="text-sm text-white font-medium">Interview #{i.id}</p>
                                            <p className="text-xs text-light-400">{new Date(i.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    {i.feedback && <span className="text-sm font-bold text-primary-200">{i.feedback.totalScore}%</span>}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
         </div>
      )}

      {/* Quick Start Modules */}
      <section>
        <div className="flex items-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-primary-200" />
            <h2 className="text-xl font-bold text-white">Simulation Modules</h2>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
           {[
             { role: 'Frontend Developer', icon: Palette, desc: "React, CSS mastery, and DOM manipulation." },
             { role: 'Backend Developer', icon: Server, desc: "API design, Database scaling, and System correctness." },
             { role: 'Full Stack Developer', icon: Layers, desc: "End-to-end system design and integration." }
           ].map((item) => (
             <Link 
               key={item.role}
               href={user ? `/interview/create?role=${encodeURIComponent(item.role)}` : "/sign-up"}
               className="card p-6 group hover:border-primary-200/50 transition-all cursor-pointer relative overflow-hidden"
             >
               <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
                  <item.icon className="h-32 w-32" />
               </div>
               
               <div className="relative z-10">
                   <div className="w-12 h-12 rounded-xl bg-dark-300 border border-white/10 flex items-center justify-center text-primary-200 mb-4 group-hover:bg-primary-200 group-hover:text-white transition-colors">
                     <item.icon className="h-6 w-6" />
                   </div>
                   <h3 className="font-bold text-lg text-white mb-2">{item.role}</h3>
                   <p className="text-sm text-light-400 mb-4 h-10">{item.desc}</p>
                   
                   <div className="flex items-center text-xs font-bold text-primary-200 group-hover:text-white transition-colors">
                      START MODULE <ArrowRight className="ml-2 h-3 w-3 group-hover:translate-x-1 transition-transform" />
                   </div>
               </div>
             </Link>
           ))}
        </div>
      </section>
      
      {!user && (
          <div className="mt-20 text-center border-t border-white/5 pt-10">
              <p className="text-light-600 text-sm">© 2025 AeroPrep Inc. All rights reserved.</p>
          </div>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useState, useRef } from 'react';
import { generateFeedback, saveInterviewCoding, saveInterviewFeedback } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plane, CheckCircle, AlertCircle, Target, Trophy, ArrowRight, Home, RotateCcw } from 'lucide-react';

export default function FeedbackPage() {
  const router = useRouter();
  const [feedback, setFeedback] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [progress, setProgress] = useState('Initiating analysis...');
  const hasStartedFetch = useRef(false);

  useEffect(() => {
    if (hasStartedFetch.current) return;
    hasStartedFetch.current = true;
    
    // Check if feedback already exists in localStorage
    const cachedFeedback = localStorage.getItem('generatedFeedback');
    if (cachedFeedback) {
      try {
        const parsed = JSON.parse(cachedFeedback);
        setFeedback(parsed);
        setLoading(false);
        setSaved(true);
        return;
      } catch (e) {
        // Invalid cache, continue to generate
      }
    }
    
    fetchFeedback();
  }, []);

  const fetchFeedback = async () => {
    try {
      const interviewId = localStorage.getItem('interviewId');
      const interviewQuestions = JSON.parse(localStorage.getItem('interviewQuestions') || '[]');
      const interviewAnswers = JSON.parse(localStorage.getItem('interviewAnswers') || '[]');
      
      const interviewData = {
          questions: interviewQuestions,
          answers: interviewAnswers
      };
      
      const codingChallenge = JSON.parse(localStorage.getItem('codingChallenge') || '{}');
      const codingResult = JSON.parse(localStorage.getItem('codingResult') || '{}');
      const codingCode = localStorage.getItem('codingCode') || "";
      
      const codingData = {
          challenge: codingChallenge,
          code: codingCode,
          result: codingResult
      };
      
      setProgress('Processing interview data (ETA: 15-30s)...');
      
      // Generate feedback from AI
      const data = await generateFeedback(interviewData, codingData);
      setFeedback(data);
      
      // Cache the feedback
      localStorage.setItem('generatedFeedback', JSON.stringify(data));
      
      setProgress('Saving interview data...');
      
      // Save to database if authenticated
      if (isAuthenticated() && interviewId) {
        const id = parseInt(interviewId);
        
        try {
          await saveInterviewCoding(id, codingChallenge, codingCode, codingResult, codingResult?.skipped || false);
          await saveInterviewFeedback(id, data);
          
          setSaved(true);
          toast.success('Interview saved to history!');
        } catch (saveError) {
          console.error('Failed to save to database:', saveError);
          toast.error('Failed to save interview data');
        }
      }
    } catch (error) {
      console.error("Failed to generate feedback", error);
      toast.error('Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const goHome = () => {
    // Clear interview session data
    localStorage.removeItem('interviewQuestions');
    localStorage.removeItem('interviewAnswers');
    localStorage.removeItem('codingChallenge');
    localStorage.removeItem('codingResult');
    localStorage.removeItem('codingCode');
    localStorage.removeItem('resumeURL');
    localStorage.removeItem('interviewId');
    localStorage.removeItem('generatedFeedback');
    
    router.push('/');
  };

  const startNewInterview = () => {
    localStorage.removeItem('interviewQuestions');
    localStorage.removeItem('interviewAnswers');
    localStorage.removeItem('codingChallenge');
    localStorage.removeItem('codingResult');
    localStorage.removeItem('codingCode');
    localStorage.removeItem('resumeURL');
    localStorage.removeItem('interviewId');
    localStorage.removeItem('generatedFeedback');
    
    router.push('/interview/create');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-10 text-center bg-dark-100">
        <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-200 mb-6"></div>
            <Target className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[130%] text-primary-200 h-6 w-6 animate-pulse" />
        </div>
        <h2 className="text-xl text-white font-bold tracking-wide">ANALYZING INTERVIEW</h2>
        <p className="text-sm text-light-400 mt-2 max-w-md animate-pulse">{progress}</p>
        
        <div className="mt-8 p-4 bg-primary-200/10 border border-primary-200/30 rounded-lg max-w-sm">
          <p className="text-xs text-primary-100 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> 
            <strong>Do not close.</strong> Analysis in progress.
          </p>
        </div>
      </div>
    );
  }
  
  if (!feedback) return <div className="p-10 text-center text-red-500">Analysis Failed. Please retry.</div>;

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 py-8 bg-dark-100">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Mission Status Header */}
        <div className="card-cta relative overflow-hidden">
           <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                <Trophy className="h-48 w-48 text-primary-200" />
           </div>
           
           <div className="z-10 w-full">
               <div className="flex items-center gap-3 mb-2">
                   <div className="h-8 w-8 rounded-full bg-primary-200 flex items-center justify-center text-white">
                        <CheckCircle className="h-5 w-5" />
                   </div>
                   <h2 className="text-light-400 font-bold uppercase tracking-widest text-xs">Interview Feedback</h2>
               </div>
               
               <h1 className="text-4xl font-bold text-white mb-6">Analysis Complete</h1>
               
               <div className="flex flex-wrap gap-8 items-end">
                   <div>
                       <p className="text-light-400 text-sm mb-1">Overall Score</p>
                       <div className="text-5xl font-bold text-white">{feedback.totalScore}<span className="text-2xl text-light-600">/100</span></div>
                   </div>
                   
                   <div className="h-12 w-[1px] bg-white/10 hidden sm:block"></div>
                   
                   <div>
                       <p className="text-light-400 text-sm mb-1">Status</p>
                       <div className="text-xl font-bold text-primary-100 bg-primary-200/20 px-4 py-2 rounded-lg border border-primary-200/30">
                           {feedback.hiringRecommendation}
                       </div>
                   </div>
                   
                    {saved && (
                        <div className="ml-auto flex items-center gap-2 text-success-200 text-sm bg-success-200/10 px-3 py-1.5 rounded-full border border-success-200/20">
                            <CheckCircle className="h-3 w-3" /> Interview Saved
                        </div>
                    )}
               </div>
           </div>
        </div>

        {/* Detailed Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Verbal Performance */}
          <div className="card p-6 border-l-4 border-l-primary-200">
              <div className="flex justify-between items-start mb-4">
                  <div>
                      <h3 className="text-lg font-bold text-white">Communication Skills</h3>
                      <p className="text-xs text-light-400">Verbal & Technical Articulation</p>
                  </div>
                  <Target className="h-6 w-6 text-primary-200" />
              </div>
              <div className="text-4xl font-bold text-white mb-2">{feedback.interviewScore}%</div>
              <div className="w-full bg-dark-300 h-2 rounded-full overflow-hidden">
                 <div className="bg-primary-200 h-full" style={{ width: `${feedback.interviewScore}%` }}></div>
              </div>
          </div>
          
          {/* Coding Performance */}
          <div className="card p-6 border-l-4 border-l-primary-300">
               <div className="flex justify-between items-start mb-4">
                  <div>
                      <h3 className="text-lg font-bold text-white">Technical Skills</h3>
                      <p className="text-xs text-light-400">Code Quality & Efficiency</p>
                  </div>
                  <Target className="h-6 w-6 text-primary-300" />
              </div>
              <div className="text-4xl font-bold text-white mb-2">{feedback.codingScore}%</div>
              <div className="w-full bg-dark-300 h-2 rounded-full overflow-hidden">
                 <div className="bg-primary-300 h-full" style={{ width: `${feedback.codingScore}%` }}></div>
              </div>
          </div>
        </div>

        {/* Strengths & Weaknesses Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="card p-6">
               <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-4">
                   <CheckCircle className="h-5 w-5 text-success-200" />
                   <h3 className="font-bold text-white">Strengths</h3>
               </div>
               <ul className="space-y-3">
                   {feedback.strengths?.map((s:string, i:number) => (
                       <li key={i} className="flex gap-3 text-light-100 text-sm">
                           <span className="h-1.5 w-1.5 rounded-full bg-success-200 mt-1.5 shrink-0"></span>
                           {s}
                       </li>
                   ))}
               </ul>
           </div>
           
           <div className="card p-6">
               <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-4">
                   <AlertCircle className="h-5 w-5 text-destructive-100" />
                   <h3 className="font-bold text-white">Areas for Improvement</h3>
               </div>
               <ul className="space-y-3">
                   {feedback.weaknesses?.map((w:string, i:number) => (
                       <li key={i} className="flex gap-3 text-light-100 text-sm">
                           <span className="h-1.5 w-1.5 rounded-full bg-destructive-100 mt-1.5 shrink-0"></span>
                           {w}
                       </li>
                   ))}
               </ul>
           </div>
        </div>

        {/* Detailed Feedback */}
        <div className="card p-8">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <Target className="h-5 w-5 text-primary-200" /> 
                Detailed Report
            </h3>
            <div className="prose prose-invert max-w-none text-light-100 text-sm leading-relaxed whitespace-pre-wrap bg-dark-300/30 p-6 rounded-xl border border-white/5">
                {feedback.detailedFeedback}
            </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
            <Button onClick={goHome} size="lg" variant="ghost" className="text-light-400 hover:text-white hover:bg-white/5">
              <Home className="mr-2 h-4 w-4" /> Return to Dashboard
            </Button>
            
            <Button onClick={startNewInterview} size="lg" className="btn-primary min-w-[200px]">
              <RotateCcw className="mr-2 h-4 w-4" /> Start New Interview
            </Button>
            
            {isAuthenticated() && (
              <Button asChild size="lg" className="btn-secondary min-w-[200px]">
                <Link href="/interview/history">
                    History <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
        </div>
      </div>
    </div>
  );
}

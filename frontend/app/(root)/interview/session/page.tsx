"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { saveInterviewAnswers } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { Bot, Loader2, Flag, Code2, CheckCircle, SkipForward, ArrowLeft, ArrowRight } from 'lucide-react';

interface Question {
  question: string;
  answer: string;
}

export default function InterviewSessionPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const [answers, setAnswers] = useState<{questionIndex: number, answer: string}[]>([]);
  const [showCodingChoice, setShowCodingChoice] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('interviewQuestions');
    if (stored) {
      setQuestions(JSON.parse(stored));
    } else {
      router.push('/interview/create');
    }
  }, []);

  const startInterview = () => {
    setIsStarted(true);
    setCurrentIndex(0);
  };

  const submitAnswer = () => {
    if (isSaving) return;
    
    const newAnswers = [...answers, { questionIndex: currentIndex, answer: userAnswer }];
    setAnswers(newAnswers);
    localStorage.setItem('interviewAnswers', JSON.stringify(newAnswers));
    
    if (currentIndex >= questions.length - 1) {
      finishQA(newAnswers);
    } else {
      setCurrentIndex(currentIndex + 1);
      setUserAnswer("");
    }
  };

  const finishQA = async (finalAnswers: {questionIndex: number, answer: string}[]) => {
    setIsSaving(true);
    
    const interviewId = localStorage.getItem('interviewId');
    if (isAuthenticated() && interviewId) {
      try {
        await saveInterviewAnswers(parseInt(interviewId), finalAnswers);
      } catch (err) {
        console.error('Failed to save answers:', err);
      }
    }
    
    setIsSaving(false);
    setShowCodingChoice(true);
  };

  const goToCoding = () => {
    if (isNavigating) return;
    setIsNavigating(true);
    router.push('/interview/coding');
  };

  const skipCoding = () => {
    if (isNavigating) return;
    setIsNavigating(true);
    localStorage.setItem('codingResult', JSON.stringify({ passed: false, feedback: 'Skipped coding round', skipped: true }));
    localStorage.setItem('codingChallenge', JSON.stringify({ title: 'Skipped' }));
    localStorage.setItem('codingCode', '// Coding round was skipped');
    router.push('/interview/feedback');
  };

  if (questions.length === 0) return (
    <div className="p-10 text-center flex flex-col items-center justify-center min-h-screen">
       <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
       <p>Loading Interview...</p>
    </div>
  );

  // Show coding round choice screen
  if (showCodingChoice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950/50">
        <div className="max-w-xl w-full bg-card border rounded-xl p-8 text-center">
          <div className="flex justify-center mb-6">
            <Code2 className="h-16 w-16 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Q&A Complete!</h2>
          <p className="text-muted-foreground mb-8">
            Great job answering the interview questions! Would you like to take the coding round?
          </p>
          
          <div className="flex flex-col gap-4">
            <Button 
              onClick={goToCoding} 
              size="lg" 
              className="w-full py-6 text-lg bg-green-600 hover:bg-green-700 cursor-pointer"
              disabled={isNavigating}
            >
              {isNavigating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...</>
              ) : (
                <><CheckCircle className="mr-2 h-5 w-5" /> Yes, Take Coding Round</>
              )}
            </Button>
            
            <Button 
              onClick={skipCoding} 
              variant="outline" 
              size="lg"
              className="w-full py-6 text-lg cursor-pointer"
              disabled={isNavigating}
            >
              {isNavigating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...</>
              ) : (
                <><SkipForward className="mr-2 h-5 w-5" /> Skip & View Feedback</>
              )}
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground mt-6">
            The coding round includes a programming challenge based on your resume skills.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950/50">
      <div className="max-w-4xl w-full flex flex-col items-center gap-10">
        
        {/* Header / Progress */}
        <div className="w-full flex justify-between items-center px-4">
           <Button variant="ghost" size="sm" onClick={() => router.push('/')} className="cursor-pointer">
             <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
           </Button>
           <h2 className="text-xl font-semibold text-muted-foreground hidden sm:block">
             Question {currentIndex + 1} / {questions.length}
           </h2>
           {!isStarted && (
             <Button 
               onClick={startInterview} 
               size="lg" 
               className="shadow-[0_0_20px_rgba(59,130,246,0.6)] border border-primary-200 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite] hover:animate-none hover:scale-105 transition-all cursor-pointer font-bold tracking-wide"
             >
               Start Interview
             </Button>
           )}
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-3xl h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Central Agent Interface */}
        <div className="my-6 w-full max-w-3xl">
          <div className="bg-card border rounded-lg p-6 shadow-sm mb-6">
             <div className="flex items-start gap-4">
                <div className="min-w-[50px] h-[50px] rounded-full bg-primary/10 flex items-center justify-center">
                   <Bot className="h-8 w-8 text-primary" />
                </div>
                <div>
                   <h3 className="font-semibold mb-1">AI Interviewer</h3>
                   <p className="text-lg leading-relaxed">{questions[currentIndex]?.question}</p>
                </div>
             </div>
          </div>

          <div className="bg-muted/30 border rounded-lg p-6">
             <label className="block text-sm font-medium mb-2">Your Answer</label>
             <textarea 
               className="w-full min-h-[120px] p-3 rounded-md border bg-background cursor-text"
               placeholder="Type your answer here..."
               value={userAnswer}
               onChange={(e) => setUserAnswer(e.target.value)}
             />
          </div>
        </div>

        {/* User Controls */}
        <div className="w-full max-w-2xl flex flex-col items-center gap-4">
           {isStarted && (
             <div className="flex gap-4">
               <Button 
                 onClick={submitAnswer} 
                 className="btn-primary min-w-[200px] py-6 text-lg cursor-pointer"
                 disabled={!userAnswer.trim() || isSaving} 
               >
                 {isSaving ? (
                   <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                 ) : (currentIndex === questions.length - 1 ? (
                   <><Flag className="mr-2 h-4 w-4" /> Finish Q&A</>
                 ) : (
                   <>Next Question <ArrowRight className="ml-2 h-4 w-4" /></>
                 ))}
               </Button>
             </div>
           )}
        </div>

      </div>
    </div>
  );
}

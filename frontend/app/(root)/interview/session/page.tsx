"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { saveInterviewAnswers, generateNextQuestion } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { Bot, Loader2, Flag, Code2, CheckCircle, SkipForward, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';

interface ConversationItem {
  question: string;
  answer: string;
  expectedAnswer?: string;
}

const TOTAL_QUESTIONS = 10;

export default function InterviewSessionPage() {
  const router = useRouter();
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(1);
  const [isStarted, setIsStarted] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const [conversationHistory, setConversationHistory] = useState<ConversationItem[]>([]);
  const [showCodingChoice, setShowCodingChoice] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [error, setError] = useState("");
  
  // Context for question generation
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  // Load context from localStorage
  useEffect(() => {
    const storedResumeText = localStorage.getItem('resumeText') || '';
    const storedJobDescription = localStorage.getItem('jobDescription') || '';
    
    if (!storedResumeText && !storedJobDescription) {
      router.push('/interview/create');
      return;
    }
    
    setResumeText(storedResumeText);
    setJobDescription(storedJobDescription);
    
    // Load any existing conversation history (for page refresh scenarios)
    const storedHistory = localStorage.getItem('conversationHistory');
    if (storedHistory) {
      const history = JSON.parse(storedHistory);
      setConversationHistory(history);
      setCurrentQuestionNumber(history.length + 1);
    }
  }, [router]);

  // Generate the next question
  const fetchNextQuestion = useCallback(async () => {
    if (isGeneratingQuestion) return;
    
    setIsGeneratingQuestion(true);
    setError("");
    
    try {
      const questionData = await generateNextQuestion(
        resumeText,
        jobDescription,
        conversationHistory.map(c => ({ question: c.question, answer: c.answer })),
        currentQuestionNumber
      );
      
      setCurrentQuestion(questionData.question);
    } catch (err: any) {
      console.error('Error generating question:', err);
      setError(err.message || 'Failed to generate question. Please try again.');
    } finally {
      setIsGeneratingQuestion(false);
    }
  }, [resumeText, jobDescription, conversationHistory, currentQuestionNumber, isGeneratingQuestion]);

  // Start interview - generate first question
  const startInterview = async () => {
    setIsStarted(true);
    await fetchNextQuestion();
  };

  // Submit answer and get next question
  const submitAnswer = async () => {
    if (isSaving || isGeneratingQuestion) return;
    
    // Add current Q&A to history
    const newConversation: ConversationItem = {
      question: currentQuestion,
      answer: userAnswer
    };
    
    const updatedHistory = [...conversationHistory, newConversation];
    setConversationHistory(updatedHistory);
    localStorage.setItem('conversationHistory', JSON.stringify(updatedHistory));
    
    // Also save to interviewAnswers format for compatibility
    const answerData = updatedHistory.map((c, i) => ({ questionIndex: i, answer: c.answer }));
    localStorage.setItem('interviewAnswers', JSON.stringify(answerData));
    
    // Check if we've reached the end
    if (currentQuestionNumber >= TOTAL_QUESTIONS) {
      await finishQA(updatedHistory);
      return;
    }
    
    // Move to next question
    setCurrentQuestionNumber(prev => prev + 1);
    setUserAnswer("");
    
    // Generate next question
    setIsGeneratingQuestion(true);
    setError("");
    
    try {
      const questionData = await generateNextQuestion(
        resumeText,
        jobDescription,
        updatedHistory.map(c => ({ question: c.question, answer: c.answer })),
        currentQuestionNumber + 1
      );
      
      setCurrentQuestion(questionData.question);
    } catch (err: any) {
      console.error('Error generating next question:', err);
      setError(err.message || 'Failed to generate next question.');
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  const finishQA = async (finalHistory: ConversationItem[]) => {
    setIsSaving(true);
    
    const interviewId = localStorage.getItem('interviewId');
    const answers = finalHistory.map((c, i) => ({ questionIndex: i, answer: c.answer }));
    
    if (isAuthenticated() && interviewId) {
      try {
        await saveInterviewAnswers(parseInt(interviewId), answers);
      } catch (err) {
        console.error('Failed to save answers:', err);
      }
    }
    
    // Store questions for feedback generation
    const questionsForFeedback = finalHistory.map(c => ({
      question: c.question,
      answer: c.expectedAnswer || ''
    }));
    localStorage.setItem('interviewQuestions', JSON.stringify(questionsForFeedback));
    
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

  // Initial loading state
  if (!resumeText && !jobDescription) {
    return (
      <div className="p-10 text-center flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p>Loading Interview...</p>
      </div>
    );
  }

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
             Question {currentQuestionNumber} / {TOTAL_QUESTIONS}
           </h2>
           {!isStarted && (
             <Button 
               onClick={startInterview} 
               size="lg" 
               className="shadow-[0_0_20px_rgba(59,130,246,0.6)] border border-primary-200 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite] hover:animate-none hover:scale-105 transition-all cursor-pointer font-bold tracking-wide"
               disabled={isGeneratingQuestion}
             >
               {isGeneratingQuestion ? (
                 <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing...</>
               ) : (
                 'Start Interview'
               )}
             </Button>
           )}
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-3xl h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(currentQuestionNumber / TOTAL_QUESTIONS) * 100}%` }}
          />
        </div>

        {/* Central Agent Interface */}
        <div className="my-6 w-full max-w-3xl">
          <div className="bg-card border rounded-lg p-6 shadow-sm mb-6">
             <div className="flex items-start gap-4">
                <div className="min-w-[50px] h-[50px] rounded-full bg-primary/10 flex items-center justify-center">
                   <Bot className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                   <h3 className="font-semibold mb-1 flex items-center gap-2">
                     AI Interviewer
                     {isGeneratingQuestion && (
                       <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
                         <Sparkles className="h-3 w-3 animate-pulse" /> Thinking...
                       </span>
                     )}
                   </h3>
                   {isGeneratingQuestion ? (
                     <div className="flex items-center gap-3 py-4">
                       <Loader2 className="h-5 w-5 animate-spin text-primary" />
                       <span className="text-muted-foreground">Generating your next question based on your previous answers...</span>
                     </div>
                   ) : currentQuestion ? (
                     <p className="text-lg leading-relaxed">{currentQuestion}</p>
                   ) : !isStarted ? (
                     <p className="text-muted-foreground">Click "Start Interview" to begin your personalized interview session.</p>
                   ) : null}
                   
                   {error && (
                     <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                       {error}
                       <Button 
                         variant="link" 
                         className="text-red-400 underline ml-2 p-0 h-auto" 
                         onClick={fetchNextQuestion}
                       >
                         Retry
                       </Button>
                     </div>
                   )}
                </div>
             </div>
          </div>

          {isStarted && currentQuestion && !isGeneratingQuestion && (
            <div className="bg-muted/30 border rounded-lg p-6">
               <label className="block text-sm font-medium mb-2">Your Answer</label>
               <textarea 
                 className="w-full min-h-[120px] p-3 rounded-md border bg-background cursor-text"
                 placeholder="Type your answer here..."
                 value={userAnswer}
                 onChange={(e) => setUserAnswer(e.target.value)}
               />
            </div>
          )}
        </div>

        {/* User Controls */}
        <div className="w-full max-w-2xl flex flex-col items-center gap-4">
           {isStarted && currentQuestion && !isGeneratingQuestion && (
             <div className="flex gap-4">
               <Button 
                 onClick={submitAnswer} 
                 className="btn-primary min-w-[200px] py-6 text-lg cursor-pointer"
                 disabled={!userAnswer.trim() || isSaving || isGeneratingQuestion} 
               >
                 {isSaving ? (
                   <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                 ) : isGeneratingQuestion ? (
                   <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                 ) : (currentQuestionNumber === TOTAL_QUESTIONS ? (
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

"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createInterview } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Loader2, Rocket, FileText, Type } from 'lucide-react';
import ResumeUploader from '@/components/ResumeUploader';

const ROLE_DESCRIPTIONS: Record<string, string> = {
  'Frontend Developer': 'We are looking for a skilled Frontend Developer with experience in React, TypeScript, and modern CSS frameworks. You should be comfortable building responsive, accessible web applications.',
  'Backend Developer': 'Seeking a Backend Developer proficient in Node.js/Express or Python/Django. Experience with databases (SQL/NoSQL) and API design is required.',
  'Full Stack Developer': 'Looking for a Full Stack Developer capable of handling both frontend (React) and backend (Node.js) development. You should be familiar with the entire web development lifecycle.'
};

const useTypingEffect = (texts: string[], typingSpeed = 100, deletingSpeed = 50, pauseTime = 2000) => {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const handleTyping = () => {
      const currentFullText = texts[currentIndex];
      
      if (isDeleting) {
        setDisplayText(currentFullText.substring(0, displayText.length - 1));
        if (displayText.length === 0) {
          setIsDeleting(false);
          setCurrentIndex((prev) => (prev + 1) % texts.length);
        }
      } else {
        setDisplayText(currentFullText.substring(0, displayText.length + 1));
        if (displayText.length === currentFullText.length) {
          setTimeout(() => setIsDeleting(true), pauseTime);
          return;
        }
      }
    };

    const timer = setTimeout(handleTyping, isDeleting ? deletingSpeed : typingSpeed);
    return () => clearTimeout(timer);
  }, [displayText, isDeleting, currentIndex, texts, typingSpeed, deletingSpeed, pauseTime]);

  return displayText;
};

function CreateInterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleParam = searchParams.get('role');
  
  const placeholderText = useTypingEffect([
    "e.g. Senior React Developer",
    "Frontend Developer",
    "Backend Engineer (Node.js)",
    "Full Stack Developer",
    "DevOps Engineer",
    "iOS Developer",
    "Machine Learning Engineer",
    "Product Manager",
    "Data Scientist"
  ]);

  const [mode, setMode] = useState<'upload' | 'manual'>('upload');

  // Unified State
  const [resumeURL, setResumeURL] = useState('');
  
  // Manual Details
  const [manualRole, setManualRole] = useState('');

  const [manualDesc, setManualDesc] = useState('');
  const [manualTech, setManualTech] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (roleParam) {
        setManualRole(roleParam);
        if (ROLE_DESCRIPTIONS[roleParam]) {
             setManualDesc(ROLE_DESCRIPTIONS[roleParam]);
             setMode('manual'); // Default to manual if role provided via quick start
        }
    }
  }, [roleParam]);



  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;

    // Validation
    if (mode === 'upload' && !resumeURL) {
        setError("Please upload a resume PDF to continue.");
        return;
    }
    if (mode === 'manual' && (!manualRole || !manualDesc)) {
        setError("Job Role and Description are required.");
        return;
    }

    setLoading(true);
    setError('');

    try {
      // Clear previous session data
      localStorage.removeItem('generatedFeedback');
      localStorage.removeItem('codingChallenge');
      localStorage.removeItem('codingResult');
      localStorage.removeItem('codingCode');
      localStorage.removeItem('interviewAnswers');
      localStorage.removeItem('interviewQuestions');
      localStorage.removeItem('conversationHistory');
      
      // Determine Context
      let finalResumeURL = "";
      let practiceResumeText = "";
      const jobDescription = manualDesc || "";

      if (mode === 'upload') {
          finalResumeURL = resumeURL;
          // Resume text will be extracted in session page if needed
          // Store a flag that we need PDF extraction
          localStorage.setItem('needsPDFExtraction', 'true');
      } else {
          // Construct text context from manual inputs
          practiceResumeText = `Candidate Role: ${manualRole}. 
Job Description: ${manualDesc}
Tech Stack: ${manualTech || "Not specified"}.`;
          
          finalResumeURL = ""; 
          localStorage.setItem('needsPDFExtraction', 'false');
      }

      // Store context for dynamic question generation
      localStorage.setItem('resumeURL', finalResumeURL);
      localStorage.setItem('resumeText', practiceResumeText);
      localStorage.setItem('jobDescription', jobDescription);
      
      if (!isAuthenticated()) {
        // For unauthenticated users, just go to session page
        // Questions will be generated dynamically there
        localStorage.setItem('interviewId', '');
        router.push('/interview/session');
        return;
      }
      
      // Authenticated Flow - create interview record (without pre-generated questions)
      // We'll add questions to DB as they're generated
      const data = await createInterview(finalResumeURL, jobDescription, practiceResumeText);
      
      localStorage.setItem('interviewId', String(data.interview.id));
      
      // Also store the extracted resume text from backend if available
      if (data.interview.resumeText) {
        localStorage.setItem('resumeText', data.interview.resumeText);
      }
      
      router.push('/interview/session');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button asChild variant="ghost" size="sm" className="cursor-pointer">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Link>
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold">
            Start New Interview
          </h1>
        </div>
        
        {!isAuthenticated() && (
          <div className="mb-6 p-3 sm:p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-400">
              Your interview won't be saved if you're not signed in.{' '}
              <Link href="/sign-in" className="underline font-medium cursor-pointer">Sign in</Link> to save your progress.
            </p>
          </div>
        )}
        
        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg mb-8">
            <button 
                onClick={() => setMode('upload')}
                className={`flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-all ${
                    mode === 'upload' ? 'bg-background shadow-sm text-foreground cursor-pointer' : 'text-muted-foreground hover:bg-background/50 cursor-pointer'
                }`}
            >
                <FileText className="h-4 w-4" /> Upload Resume
            </button>
            <button 
                onClick={() => setMode('manual')}
                className={`flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-all ${
                    mode === 'manual' ? 'bg-background shadow-sm text-foreground cursor-pointer' : 'text-muted-foreground hover:bg-background/50 cursor-pointer'
                }`}
            >
                <Type className="h-4 w-4" /> Manually Enter Details
            </button>
        </div>
        
        <div className="bg-card border rounded-xl p-6 shadow-sm">
            {mode === 'upload' ? (
                <div className="space-y-6">
                    <div className="text-center">
                        <h2 className="text-xl font-semibold mb-2">Upload your Resume</h2>
                        <p className="text-muted-foreground text-sm">
                            We'll extract your skills and experience to generate personalized questions.
                        </p>
                    </div>

                    <ResumeUploader 
                        onUploadSuccess={(url) => setResumeURL(url)} 
                        className="py-4"
                    />
                    
                    {resumeURL && (
                       <div className="p-3 bg-green-500/10 text-green-600 border border-green-500/20 rounded text-center text-sm font-medium">
                          Resume ready for analysis!
                       </div>
                    )}

                    <div className="pt-4">
                        <label className="block text-sm font-medium mb-2">Job Description (Optional)</label>
                        <textarea
                          disabled={loading}
                          className="w-full p-3 border rounded-lg bg-background min-h-[100px] text-sm"
                          placeholder="Paste the job description if applying for a specific role..."
                          value={manualDesc}
                          onChange={(e) => setManualDesc(e.target.value)}
                        />
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                     <div className="text-center mb-6">
                        <h2 className="text-xl font-semibold mb-2">Enter Job Details</h2>
                        <p className="text-muted-foreground text-sm">
                            Tell us about the role you want to practice for.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Target Job Role <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          required
                          className="w-full p-3 border rounded-lg bg-background"
                          placeholder={placeholderText}
                          value={manualRole}
                          onChange={(e) => setManualRole(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Tech Stack (comma separated)</label>
                        <input
                          type="text"
                          className="w-full p-3 border rounded-lg bg-background"
                          placeholder="e.g. React, Node.js, AWS, PostgreSQL"
                          value={manualTech}
                          onChange={(e) => setManualTech(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Job Description or Key Requirements <span className="text-red-500">*</span></label>
                        <textarea
                          required
                          className="w-full p-3 border rounded-lg bg-background min-h-[120px]"
                          placeholder="Paste the full job description or list key requirements..."
                          value={manualDesc}
                          onChange={(e) => setManualDesc(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {error && (
              <div className="mt-6 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 rounded-md text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}

            <Button 
              onClick={() => handleSubmit()} 
              disabled={loading || (mode === 'upload' && !resumeURL)}
              className="w-full btn-primary cursor-pointer py-6 text-base sm:text-lg mt-6"
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Interview...</>
              ) : (
                <><Rocket className="mr-2 h-4 w-4" /> Start Interview</>
              )}
            </Button>
        </div>

      </div>
      

    </div>
  );
}

export default function CreateInterviewPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <CreateInterviewContent />
    </Suspense>
  );
}

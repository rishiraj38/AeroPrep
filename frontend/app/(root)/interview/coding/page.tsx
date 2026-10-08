"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { getCodingChallenge, runCode, submitCode, skipCoding, ApiError, CodingChallenge } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { getCurrentInterviewId } from '@/lib/currentInterview';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Play, CheckCircle, XCircle, Keyboard, Loader2, Info } from 'lucide-react';

const SUPPORTED_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
];

const BOILERPLATES: Record<string, string> = {
  javascript: `// JavaScript Solution
function solve(input) {
  // Your code here
  return input;
}`,
  python: `# Python Solution
def solve(input_data):
    # Your code here
    return input_data`,
  java: `// Java Solution
public class Solution {
    public static Object solve(Object input) {
        // Your code here
        return input;
    }
}`,
  cpp: `// C++ Solution
#include <iostream>
#include <string>

using namespace std;

string solve(string input) {
    // Your code here
    return input;
}`,
  typescript: `// TypeScript Solution
function solve(input: any): any {
  // Your code here
  return input;
}`,
  go: `// Go Solution
package main

func solve(input string) string {
    // Your code here
    return input
}`,
  rust: `// Rust Solution
fn solve(input: &str) -> String {
    // Your code here
    String::from(input)
}`
};

// Helper to fix double escaped newlines from AI
const formatContent = (content: string | null | undefined) => {
  if (!content) return "";
  return content.replace(/\\n/g, '\n');
};

// The editor's contents are kept in the browser per interview, so a refresh keeps unsaved work
const draftKey = (interviewId: number) => `codingDraft:${interviewId}`;

function readDraft(interviewId: number): { code: string; language: string } | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(interviewId)) || 'null');
  } catch {
    return null;
  }
}

export default function CodingRoundPage() {
  const router = useRouter();
  const interviewIdRef = useRef<number | null>(null);

  // Challenge & Editor State
  const [challenge, setChallenge] = useState<CodingChallenge | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [runError, setRunError] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');
  const [isNavigating, setIsNavigating] = useState(false);
  // Which irreversible action is being confirmed, if any
  const [confirming, setConfirming] = useState<'finish' | 'skip' | null>(null);

  // Resizable Output State (wide screens; on a phone the page simply scrolls)
  const [outputHeight, setOutputHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Resize Handlers. Pointer events, so the handle works with a finger or a pen as well as a mouse.
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;

      // Clamp height: Min 40px, Max 85% of container height
      const maxHeight = containerRect.height * 0.85;
      setOutputHeight(Math.max(40, Math.min(newHeight, maxHeight)));
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    document.body.style.cursor = 'row-resize';

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      document.body.style.cursor = 'default';
    };
  }, [isDragging]);

  // The challenge is generated once and stored with the interview, so loading it again
  // (a refresh, a retry) always shows the same problem.
  const loadChallenge = useCallback(async () => {
    const id = interviewIdRef.current;
    if (!id) return;
    setLoading(true);
    setLoadError('');

    try {
      const data = await getCodingChallenge(id);
      setChallenge(data);

      const draft = readDraft(id);
      const language = draft?.language || data.language || 'javascript';
      setSelectedLanguage(language);
      // Unsaved edits first, then the last submitted code, then the starter
      setCode(draft?.code ?? data.userCode ?? (formatContent(data.starterCode) || BOILERPLATES[language] || ''));
    } catch (error: any) {
      if (error instanceof ApiError && error.code === 'INTERVIEW_COMPLETED') {
        router.replace('/interview/feedback');
        return;
      }
      // The interview itself is not finished yet: that is where to go
      if (error instanceof ApiError && error.code === 'INTERVIEW_IN_PROGRESS') {
        router.replace('/interview/session');
        return;
      }
      console.error('Failed to load challenge:', error);
      setLoadError(error.message || 'Failed to load the coding challenge.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!isAuthenticated()) { router.push('/sign-in'); return; }
    const id = getCurrentInterviewId();
    if (!id) { router.push('/interview/create'); return; }
    interviewIdRef.current = id;
    loadChallenge();
  }, [router, loadChallenge]);

  const saveDraft = (nextCode: string, language: string) => {
    const id = interviewIdRef.current;
    if (id) localStorage.setItem(draftKey(id), JSON.stringify({ code: nextCode, language }));
  };

  const handleCodeChange = (value: string) => {
    setCode(value);
    saveDraft(value, selectedLanguage);
  };

  // True while the editor still holds a starter the candidate has not touched
  const untouched = !code.trim()
    || Object.values(BOILERPLATES).includes(code)
    || code === formatContent(challenge?.starterCode);

  // Swap in the new language's boilerplate, unless the candidate has started writing
  const handleLanguageChange = (language: string) => {
    const nextCode = untouched ? (BOILERPLATES[language] || "// Write your solution here") : code;
    setSelectedLanguage(language);
    setCode(nextCode);
    saveDraft(nextCode, language);
  };

  // Returns the checked challenge, or null if the check could not be made
  const check = async (): Promise<CodingChallenge | null> => {
      const id = interviewIdRef.current;
      if (!id || !challenge || evaluating) return null;
      setEvaluating(true);
      setRunError('');
       // Ensure output window is visible when running
      if (outputHeight < 100) setOutputHeight(300);
      try {
          const checked = await runCode(id, code, selectedLanguage);
          setChallenge(checked);
          return checked;
      } catch (error: any) {
          console.error("Evaluation failed", error);
          setRunError(error.message || 'The check failed. Please try again.');
          return null;
      } finally {
          setEvaluating(false);
      }
  };

  const goToFeedback = () => {
    const id = interviewIdRef.current;
    if (id) localStorage.removeItem(draftKey(id));
    router.push('/interview/feedback');
  };

  const finish = async (checkFirst: boolean) => {
     const id = interviewIdRef.current;
     if (!id || isNavigating) return;
     setConfirming(null);
     setIsNavigating(true);
     try {
         // Asked for a check first: if it could not be made, stay here so it can be tried again
         // (finishing without one is still a button away)
         if (checkFirst && !(await check())) {
           setIsNavigating(false);
           return;
         }
         await submitCode(id, code);
         goToFeedback();
     } catch (error: any) {
         setRunError(error.message || 'Could not save your code. Please try again.');
         setIsNavigating(false);
     }
  };

  const skip = async () => {
     const id = interviewIdRef.current;
     if (!id || isNavigating) return;
     setConfirming(null);
     setIsNavigating(true);
     try {
         await skipCoding(id, true);
         goToFeedback();
     } catch (error: any) {
         const message = error.message || 'Could not skip the coding round. Please try again.';
         if (challenge) setRunError(message); else setLoadError(message);
         setIsNavigating(false);
     }
  };

  // --- RENDER: LOADING / ERROR STATE ---
  if (loading) {
      return (
        <div role="status" className="min-h-screen flex flex-col items-center justify-center p-10 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-200 mb-4" />
          <p className="text-lg font-medium text-white">Preparing your coding challenge...</p>
          <p className="text-sm text-muted-foreground mt-2">This takes a few seconds.</p>
        </div>
      );
  }

  if (!challenge) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-10 text-center">
           <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
           <h2 className="text-xl font-bold mb-2">We could not load a coding challenge</h2>
           <p role="alert" className="text-muted-foreground mb-6">{loadError || "Something went wrong while preparing your problem."}</p>
           <div className="flex flex-wrap justify-center gap-4">
             <Button onClick={skip} variant="outline" disabled={isNavigating} className="cursor-pointer">Skip &amp; View Feedback</Button>
             <Button onClick={loadChallenge} disabled={isNavigating} className="cursor-pointer">Try Again</Button>
           </div>
        </div>
      );
  }

  const output = challenge.result;
  const runsLeft = challenge.runsLeft;
  // The review on screen belongs to the code as it was when it was checked
  const stale = !!output && code !== challenge.userCode;
  const passedAsIs = !!output?.passed && !stale;
  // Finishing with code the AI has not looked at is allowed, but asked about first
  const unchecked = !untouched && (!output || stale);
  const languages = SUPPORTED_LANGUAGES.some((lang) => lang.value === selectedLanguage)
    ? SUPPORTED_LANGUAGES
    : [...SUPPORTED_LANGUAGES, { value: selectedLanguage, label: selectedLanguage }];

  // --- RENDER: CODING INTERFACE ---
  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Left Panel: Problem Statement */}
      <div className="w-full md:w-1/3 p-6 border-b md:border-b-0 md:border-r border-border overflow-y-auto max-h-[45vh] md:max-h-none md:h-screen">
          <div className="flex justify-between items-center mb-6">
            <div className="text-sm font-medium text-muted-foreground">
                Coding Challenge
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming('skip')}
              disabled={isNavigating}
              className="text-muted-foreground hover:text-red-400 cursor-pointer"
            >
              Skip
            </Button>
          </div>

          <h1 className="text-2xl font-bold mb-4">{challenge.title}</h1>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6">
            <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">
                  <strong>How checking works:</strong> an AI reads your code and judges whether it solves the problem. Your code is not run, so treat the result as a review, not a test report.
                </p>
            </div>
          </div>

          <div className="max-w-none text-sm">
              <p className="mb-4 text-base">{formatContent(challenge.description)}</p>

              <div className="bg-muted p-4 rounded-md mb-4 border border-border">
                  <h3 className="font-semibold mb-2">Problem Statement</h3>
                  <div className="whitespace-pre-wrap font-mono text-sm text-foreground">{formatContent(challenge.problemStatement)}</div>
              </div>

              <h3 className="font-semibold mt-4 mb-2">Constraints</h3>
              <ul className="list-disc pl-5 mb-4 text-muted-foreground">
                {(formatContent(challenge.constraints) || "No specific constraints provided.").split('\n').map((c: string, i: number) => <li key={i}>{c}</li>)}
              </ul>

              <h3 className="font-semibold mt-4 mb-2">Example Cases</h3>
              <div className="space-y-2">
                  {challenge.testCases.length > 0 ? challenge.testCases.map((tc, i) => (
                      <div key={i} className="bg-muted/50 p-2 rounded border border-border font-mono text-sm">
                          <span className="text-muted-foreground">In:</span> {formatContent(tc.input)} <br/>
                          <span className="text-muted-foreground">Out:</span> {formatContent(tc.expectedOutput)}
                      </div>
                  )) : (
                      <p className="text-muted-foreground italic text-sm">No example cases provided.</p>
                  )}
              </div>
          </div>
      </div>

      {/* Right Panel: Editor & Output. On a phone it is as tall as it needs and the page scrolls. */}
      <div ref={containerRef} className="w-full md:w-2/3 flex flex-col md:h-screen md:overflow-hidden">
          {/* Toolbar */}
          <div className="bg-muted/30 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-3">
                <label htmlFor="language" className="text-sm font-medium text-muted-foreground">Language:</label>
                <select
                  id="language"
                  value={selectedLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="bg-background text-foreground px-3 py-1.5 rounded-md text-sm border border-border cursor-pointer"
                >
                  {languages.map((lang) => (
                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                  ))}
                </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {runsLeft === 0 ? 'No checks left' : `${runsLeft} ${runsLeft === 1 ? 'check' : 'checks'} left`}
                </span>
                <Button
                  onClick={check}
                  disabled={evaluating || isNavigating || runsLeft === 0}
                  size="sm"
                  className="cursor-pointer"
                >
                    {evaluating ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking...</>
                    ) : (
                        <><Play className="mr-2 h-4 w-4" /> Check my code</>
                    )}
                </Button>

                <Button
                  onClick={() => (unchecked && runsLeft > 0 ? setConfirming('finish') : finish(false))}
                  variant={passedAsIs ? "default" : "secondary"} // Highlight if passed
                  size="sm"
                  disabled={isNavigating || evaluating}
                  className={`cursor-pointer ${passedAsIs ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                >
                    {isNavigating ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                    ) : (
                        <><CheckCircle className="mr-2 h-4 w-4" /> Finish Round</>
                    )}
                </Button>
            </div>
          </div>

          {/* Editor */}
          <div className={`h-[50vh] md:h-auto md:flex-1 relative min-h-0 overflow-hidden ${isDragging ? 'pointer-events-none select-none' : ''}`}>
              <Editor
                height="100%"
                language={selectedLanguage}
                value={code}
                theme="vs-dark"
                onChange={(value) => handleCodeChange(value || "")}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                }}
              />
          </div>
          <p className="sr-only">To leave the editor with the keyboard, press Control M (Control Shift M on a Mac) and then Tab.</p>

          {/* Drag Handle (wide screens) */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the review panel"
            className="hidden md:flex h-3 bg-border hover:bg-primary/50 cursor-row-resize items-center justify-center transition-colors group touch-none"
            onPointerDown={(e) => { e.preventDefault(); setIsDragging(true); }}
          >
            <div className="w-12 h-1 rounded-full bg-muted-foreground/30 group-hover:bg-primary/70" />
          </div>

          {/* Review panel */}
          <div
            style={{ ['--review-height' as any]: `${outputHeight}px` }}
            className="transition-none border-t border-border bg-slate-950 p-4 overflow-y-auto min-h-40 max-h-72 md:max-h-none md:h-[var(--review-height)]"
          >
              {runError && (
                  <div role="alert" className="mb-3 text-sm text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" /> {runError}
                  </div>
              )}

              {!output && !runError && (
                  <div className="text-center text-sm text-muted-foreground pt-1 flex items-center justify-center gap-2 h-full">
                      <Keyboard className="h-4 w-4" /> <span>Write your code, then press &quot;Check my code&quot; for an AI review</span>
                  </div>
              )}

              {output && (
                  <div role="status" className={`text-sm font-mono ${stale ? 'opacity-60' : ''} ${output.passed ? "text-green-400" : "text-red-400"}`}>
                      {stale && (
                          <p className="mb-3 font-sans text-amber-300">This review is for an earlier version of your code. Check again to review what you have now.</p>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">
                            {output.passed ? <CheckCircle className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
                          </span>
                          <span className="font-bold">{output.passed ? "The AI review found no problems" : "The AI review found problems"}</span>
                      </div>

                      <p className="whitespace-pre-wrap mb-4 text-foreground/80">{output.feedback}</p>

                      {output.testResults?.length > 0 && (
                          <div className="space-y-1 bg-black/20 p-2 rounded">
                              {output.testResults.map((res, i) => (
                                  <div key={i} className={`flex gap-2 ${res.passed ? "text-green-500" : "text-red-400"}`}>
                                      <span className="shrink-0 whitespace-nowrap">Example {i+1}:</span>
                                      <span>{res.passed ? "looks right" : `looks wrong (expected ${res.expected}, the AI predicts ${res.actual})`}</span>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              )}
          </div>
      </div>

      {/* Finishing and skipping cannot be undone, so both are confirmed */}
      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setConfirming(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text"
            onClick={(e) => e.stopPropagation()}
            className="max-w-sm w-full bg-card border border-border rounded-xl p-6 shadow-2xl">
            <h2 id="confirm-title" className="text-xl font-bold mb-2">
              {confirming === 'skip' ? 'Skip the coding round?' : 'Finish without a check?'}
            </h2>
            <p id="confirm-text" className="text-sm text-muted-foreground mb-6">
              {confirming === 'skip'
                ? 'You will go straight to your report and cannot come back to this challenge.'
                : 'Your code has changed since it was last checked, so your report would treat it as unchecked. You can have it checked first.'}
            </p>
            <div className="flex flex-col gap-3">
              {confirming === 'finish' && (
                <Button autoFocus onClick={() => finish(true)} className="cursor-pointer">Check it, then finish</Button>
              )}
              <Button onClick={() => (confirming === 'skip' ? skip() : finish(false))}
                variant="secondary" className="cursor-pointer">
                {confirming === 'skip' ? 'Skip the coding round' : 'Finish without checking'}
              </Button>
              <Button autoFocus={confirming === 'skip'} onClick={() => setConfirming(null)} variant="ghost" className="cursor-pointer">
                Keep coding
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

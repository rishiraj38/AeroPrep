"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { getCodingChallenge, runCode, submitCode, skipCoding, ApiError, CodingChallenge } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { getCurrentInterviewId } from '@/lib/currentInterview';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Play, CheckCircle, XCircle, Keyboard, Loader2 } from 'lucide-react';

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

  // Resizable Output State
  const [outputHeight, setOutputHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Resize Handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;

      // Clamp height: Min 40px, Max 85% of container height
      const maxHeight = containerRect.height * 0.85;

      // Use clamping instead of conditional updated to avoid "stuck" feeling
      const clampedHeight = Math.max(40, Math.min(newHeight, maxHeight));
      setOutputHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };
  }, [isDragging]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

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
      const language = draft?.language || (BOILERPLATES[data.language] ? data.language : 'javascript');
      setSelectedLanguage(language);
      // Unsaved edits first, then the last submitted code, then the starter
      setCode(draft?.code ?? data.userCode ?? (formatContent(data.starterCode) || BOILERPLATES[language]));
    } catch (error: any) {
      if (error instanceof ApiError && error.code === 'INTERVIEW_COMPLETED') {
        router.replace('/interview/feedback');
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

  // Swap in the new language's boilerplate, unless the candidate has started writing
  const handleLanguageChange = (language: string) => {
    const untouched = !code.trim()
      || Object.values(BOILERPLATES).includes(code)
      || code === formatContent(challenge?.starterCode);
    const nextCode = untouched ? (BOILERPLATES[language] || "// Write your solution here") : code;
    setSelectedLanguage(language);
    setCode(nextCode);
    saveDraft(nextCode, language);
  };

  const handleRun = async () => {
      const id = interviewIdRef.current;
      if (!id || !challenge || evaluating) return;
      setEvaluating(true);
      setRunError('');
       // Ensure output window is visible when running
      if (outputHeight < 100) setOutputHeight(300);
      try {
          setChallenge(await runCode(id, code, selectedLanguage));
      } catch (error: any) {
          console.error("Evaluation failed", error);
          setRunError(error.message || 'Evaluation failed. Please try again.');
      } finally {
          setEvaluating(false);
      }
  };

  const goToFeedback = () => {
    const id = interviewIdRef.current;
    if (id) localStorage.removeItem(draftKey(id));
    router.push('/interview/feedback');
  };

  const handleFinish = async () => {
     const id = interviewIdRef.current;
     if (!id || isNavigating) return;
     setIsNavigating(true);
     try {
         await submitCode(id, code);
         goToFeedback();
     } catch (error: any) {
         setRunError(error.message || 'Could not save your code. Please try again.');
         setIsNavigating(false);
     }
  };

  const handleSkip = async () => {
     const id = interviewIdRef.current;
     if (!id || isNavigating) return;
     setIsNavigating(true);
     try {
         await skipCoding(id);
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
        <div className="min-h-screen flex flex-col items-center justify-center p-10 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium">Preparing your coding challenge...</p>
          <p className="text-sm text-muted-foreground mt-2">(AI is analysing your resume to create a relevant problem)</p>
        </div>
      );
  }

  if (!challenge) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-10 text-center">
           <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
           <h2 className="text-xl font-bold mb-2">Failed to Load Challenge</h2>
           <p className="text-muted-foreground mb-6">{loadError || "We couldn't generate a coding problem for you at this time."}</p>
           <div className="flex gap-4">
             <Button onClick={handleSkip} variant="outline" disabled={isNavigating} className="cursor-pointer">Skip &amp; View Feedback</Button>
             <Button onClick={loadChallenge} disabled={isNavigating} className="btn-primary cursor-pointer">Try Again</Button>
           </div>
        </div>
      );
  }

  const output = challenge.result;
  const runsLeft = challenge.runsLeft;

  // --- RENDER: CODING INTERFACE ---
  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Left Panel: Problem Statement */}
      <div className="w-full md:w-1/3 p-6 border-r border-border overflow-y-auto h-[40vh] md:h-screen">
          <div className="flex justify-between items-center mb-6">
            <div className="text-sm font-medium text-muted-foreground">
                Coding Challenge
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              disabled={isNavigating}
              className="text-muted-foreground hover:text-red-500 cursor-pointer"
            >
              Skip
            </Button>
          </div>

          <h1 className="text-2xl font-bold mb-4">{challenge.title}</h1>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6">
            <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  <strong>AI Evaluation:</strong> Your code is analyzed for logic and correctness, not just execution.
                </p>
            </div>
          </div>

          <div className="prose dark:prose-invert max-w-none text-sm">
              <p className="mb-4 text-base">{formatContent(challenge.description)}</p>

              <div className="bg-muted p-4 rounded-md mb-4 border border-border">
                  <h3 className="font-semibold mb-2">Problem Statement</h3>
                  <div className="whitespace-pre-wrap font-mono text-xs">{formatContent(challenge.problemStatement)}</div>
              </div>

              <h3 className="font-semibold mt-4 mb-2">Constraints</h3>
              <ul className="list-disc pl-5 mb-4 text-muted-foreground">
                {(formatContent(challenge.constraints) || "No specific constraints provided.").split('\n').map((c: string, i: number) => <li key={i}>{c}</li>)}
              </ul>

              <h3 className="font-semibold mt-4 mb-2">Example Cases</h3>
              <div className="space-y-2">
                  {challenge.testCases.length > 0 ? challenge.testCases.map((tc, i) => (
                      <div key={i} className="bg-muted/50 p-2 rounded border border-border font-mono text-xs">
                          <span className="text-muted-foreground">In:</span> {formatContent(tc.input)} <br/>
                          <span className="text-muted-foreground">Out:</span> {formatContent(tc.expectedOutput)}
                      </div>
                  )) : (
                      <p className="text-muted-foreground italic text-sm">No example cases provided.</p>
                  )}
              </div>
          </div>
      </div>

      {/* Right Panel: Editor & Output */}
      <div ref={containerRef} className="w-full md:w-2/3 flex flex-col h-[60vh] md:h-screen overflow-hidden">
          {/* Toolbar */}
          <div className="bg-muted/30 border-b border-border px-4 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-muted-foreground">Language:</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="bg-background text-foreground px-3 py-1.5 rounded-md text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                  ))}
                </select>
            </div>

            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {runsLeft} {runsLeft === 1 ? 'run' : 'runs'} left
                </span>
                <Button
                  onClick={handleRun}
                  disabled={evaluating || isNavigating || runsLeft === 0}
                  size="sm"
                  className="cursor-pointer"
                >
                    {evaluating ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...</>
                    ) : (
                        <><Play className="mr-2 h-4 w-4" /> Run & Check</>
                    )}
                </Button>

                <Button
                  onClick={handleFinish}
                  variant={output?.passed ? "default" : "secondary"} // Highlight if passed
                  size="sm"
                  disabled={isNavigating || evaluating}
                  className={`cursor-pointer ${output?.passed ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
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
          <div className={`flex-1 relative min-h-0 overflow-hidden ${isDragging ? 'pointer-events-none select-none' : ''}`}>
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

          {/* Drag Handle */}
          <div
            className="h-2 bg-border hover:bg-primary/50 cursor-row-resize flex items-center justify-center transition-colors group"
            onMouseDown={startResizing}
          >
            <div className="w-12 h-1 rounded-full bg-muted-foreground/30 group-hover:bg-primary/70" />
          </div>

          {/* Output Console */}
          <div
            style={{ height: outputHeight }}
            className={`transition-none border-t border-border bg-slate-950 p-4 overflow-y-auto`}
          >
              {runError && (
                  <div className="mb-3 text-sm text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" /> {runError}
                  </div>
              )}

              {!output && !runError && (
                  <div className="text-center text-xs text-muted-foreground pt-1 flex items-center justify-center gap-2 h-full">
                      <Keyboard className="h-4 w-4" /> <span>Write your code and click Run to test</span>
                  </div>
              )}

              {output && (
                  <div className={`text-sm font-mono ${output.passed ? "text-green-400" : "text-red-400"}`}>
                      <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">
                            {output.passed ? <CheckCircle className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
                          </span>
                          <span className="font-bold">{output.passed ? "All Test Cases Passed!" : "Execution Failed / Tests Failed"}</span>
                      </div>

                      <p className="whitespace-pre-wrap mb-4 text-foreground/80">{output.feedback}</p>

                      {output.testResults?.length > 0 && (
                          <div className="space-y-1 bg-black/20 p-2 rounded">
                              {output.testResults.map((res, i) => (
                                  <div key={i} className={`flex gap-2 ${res.passed ? "text-green-500" : "text-red-500"}`}>
                                      <span className="w-16 shrink-0">Test {i+1}:</span>
                                      <span>{res.passed ? "PASS" : `FAIL (Expected: ${res.expected}, Got: ${res.actual})`}</span>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              )}
          </div>
      </div>
    </div>
  );
}

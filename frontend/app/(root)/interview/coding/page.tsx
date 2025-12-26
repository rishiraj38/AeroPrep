"use client";

import React, { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { generateCodingChallenge, evaluateCode } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Terminal, AlertTriangle, Play, CheckCircle, XCircle, Keyboard, Loader2 } from 'lucide-react';

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

export default function CodingRoundPage() {
  const router = useRouter();
  
  // State for flow control
  const [step, setStep] = useState<'selection' | 'coding' | 'finished'>('selection');
  const [totalQuestions, setTotalQuestions] = useState(1);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  
  // Challenge & Editor State
  const [challenge, setChallenge] = useState<any>(null);
  const [code, setCode] = useState("// Loading starter code...");
  const [output, setOutput] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');
  const [isNavigating, setIsNavigating] = useState(false);
  
  // Results tracking
  const [results, setResults] = useState<any[]>([]);

  const hasStartedFetch = useRef(false);

  // Initial Check (Resume)
  useEffect(() => {
    const resumeURL = localStorage.getItem('resumeURL');
    const resumeText = localStorage.getItem('practiceResumeText');
    
    if (!resumeURL && !resumeText) {
      alert("Resume context missing. Please start a new interview.");
      router.push('/interview/create');
    }
  }, [router]);

  // Fetch Challenge when entering 'coding' step or incrementing index
  useEffect(() => {
    if (step === 'coding' && !challenge && !loading) {
      fetchChallenge();
    }
  }, [step, currentQuestionIndex]);

  // Update Boilerplate on Language Change
  useEffect(() => {
    const isBoilerplate = Object.values(BOILERPLATES).some(bp => code === bp) || code === "// Loading starter code..." || code.startsWith("// Write your solution");
    
    if (isBoilerplate) {
      setCode(BOILERPLATES[selectedLanguage] || "// Write your solution here");
    }
  }, [selectedLanguage]);

  const fetchChallenge = async () => {
     setLoading(true);
     setChallenge(null);
     setOutput(null);
     setCode("// Generating personalized challenge...");
     
     try {
         const resumeURL = localStorage.getItem('resumeURL') || "";
         const resumeText = localStorage.getItem('practiceResumeText') || "";
         
         if (!resumeURL && !resumeText) return;
         
         const data = await generateCodingChallenge(resumeURL, resumeText);
         setChallenge(data);
         
         // Prefer generated starter code if available, else boilerplate
         const starter = data.starterCode || BOILERPLATES[data.language || 'javascript'] || BOILERPLATES['javascript'];
         setCode(starter);
         
         if (data.language && BOILERPLATES[data.language]) {
             setSelectedLanguage(data.language);
         }
         
         localStorage.setItem('currentCodingChallenge', JSON.stringify(data));
     } catch (error) {
         console.error("Failed to load challenge", error);
     } finally {
         setLoading(false);
     }
  };

  const handleStartCoding = () => {
    setStep('coding');
    setCurrentQuestionIndex(0);
    setResults([]);
  };

  const handleRun = async () => {
      if (!challenge || evaluating) return;
      setEvaluating(true);
      setOutput(null);
      try {
          const result = await evaluateCode(code, selectedLanguage, challenge);
          setOutput(result);
      } catch (error) {
          console.error("Evaluation failed", error);
      } finally {
          setEvaluating(false);
      }
  };

  const handleNextOrFinish = () => {
     // Save result
     const newResults = [...results, {
         challenge,
         code,
         output: output || { passed: false, feedback: "Skipped/Submitted without run" },
         passed: output?.passed || false
     }];
     setResults(newResults);

     if (currentQuestionIndex < totalQuestions - 1) {
         // Next question
         setCurrentQuestionIndex(prev => prev + 1);
         setChallenge(null); // Triggers fetch effect
         setOutput(null);
     } else {
         // Finish
         finishRound(newResults);
     }
  };

  const finishRound = (finalResults: any[]) => {
     if (isNavigating) return;
     setIsNavigating(true);
     
     // Save aggregate results
     localStorage.setItem('codingResults', JSON.stringify(finalResults));
     // Legacy support for feedback page (uses singular 'codingResult' etc based on last one or aggregated)
     localStorage.setItem('codingResult', JSON.stringify({ 
         passed: finalResults.every(r => r.passed), 
         feedback: `Completed ${finalResults.length} challenges. Passed: ${finalResults.filter(r => r.passed).length}/${finalResults.length}`,
         detailed: finalResults 
     }));
     
     router.push('/interview/feedback');
  };

  // --- RENDER: SELECTION SCREEN ---
  if (step === 'selection') {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950/50">
            <div className="max-w-md w-full bg-card border rounded-xl p-8 text-center shadow-lg">
              <div className="flex justify-center mb-6">
                <Terminal className="h-16 w-16 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Coding Round Setup</h1>
              <p className="text-muted-foreground mb-8">
                Select how many coding challenges you'd like to attempt. 
                Challenges are personalized based on your resume.
              </p>
              
              <div className="flex flex-col gap-6">
                <div>
                    <label className="block text-sm font-medium mb-3">Number of Questions</label>
                    <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map(num => (
                            <button
                                key={num}
                                onClick={() => setTotalQuestions(num)}
                                className={`w-12 h-12 rounded-lg text-lg font-bold border transition-all ${
                                    totalQuestions === num 
                                    ? 'bg-primary text-primary-foreground border-primary ring-2 ring-primary/50' 
                                    : 'bg-muted hover:bg-muted/80'
                                }`}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                <Button 
                  onClick={handleStartCoding} 
                  size="lg" 
                  className="w-full py-6 text-lg cursor-pointer btn-primary"
                >
                  Start Coding Round ({totalQuestions} Qs)
                </Button>
              </div>
            </div>
          </div>
      );
  }

  // --- RENDER: LOADING STATE ---
  if (step === 'coding' && (loading || !challenge)) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-10 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium">Generating Challenge {currentQuestionIndex + 1} of {totalQuestions}...</p>
          <p className="text-sm text-muted-foreground mt-2">(AI is analysing your resume to create a relevant problem)</p>
        </div>
      );
  }

  // --- RENDER: CODING INTERFACE ---
  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Left Panel: Problem Statement */}
      <div className="w-full md:w-1/3 p-6 border-r border-border overflow-y-auto h-[40vh] md:h-screen">
          <div className="flex justify-between items-center mb-6">
            <div className="text-sm font-medium text-muted-foreground">
                Question {currentQuestionIndex + 1} / {totalQuestions}
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleNextOrFinish}
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
              <p className="mb-4 text-base">{challenge.description}</p>
              
              <div className="bg-muted p-4 rounded-md mb-4 border border-border">
                  <h3 className="font-semibold mb-2">Problem Statement</h3>
                  <div className="whitespace-pre-wrap font-mono text-xs">{challenge.problemStatement}</div>
              </div>

              <h3 className="font-semibold mt-4 mb-2">Constraints</h3>
              <ul className="list-disc pl-5 mb-4 text-muted-foreground">
                {(challenge.constraints || "No specific constraints provided.").split('\n').map((c: string, i: number) => <li key={i}>{c}</li>)}
              </ul>

              <h3 className="font-semibold mt-4 mb-2">Example Cases</h3>
              <div className="space-y-2">
                  {challenge.testCases && Array.isArray(challenge.testCases) ? challenge.testCases.map((tc:any, i:number) => (
                      <div key={i} className="bg-muted/50 p-2 rounded border border-border font-mono text-xs">
                          <span className="text-muted-foreground">In:</span> {tc.input} <br/>
                          <span className="text-muted-foreground">Out:</span> {tc.expectedOutput}
                      </div>
                  )) : (
                      <p className="text-muted-foreground italic text-sm">No example cases provided.</p>
                  )}
              </div>
          </div>
      </div>

      {/* Right Panel: Editor & Output */}
      <div className="w-full md:w-2/3 flex flex-col h-[60vh] md:h-screen">
          {/* Toolbar */}
          <div className="bg-muted/30 border-b border-border px-4 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-muted-foreground">Language:</label>
                <select 
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="bg-background text-foreground px-3 py-1.5 rounded-md text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                  ))}
                </select>
            </div>
            
            <div className="flex gap-2">
                <Button 
                  onClick={handleRun} 
                  disabled={evaluating || isNavigating} 
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
                  onClick={handleNextOrFinish} 
                  variant={output?.passed ? "default" : "secondary"} // Highlight if passed
                  size="sm"
                  disabled={isNavigating}
                  className={`cursor-pointer ${output?.passed ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                >
                    {isNavigating ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                    ) : (currentQuestionIndex < totalQuestions - 1 ? (
                        <>Next Question <Play className="ml-2 h-4 w-4 rotate-180" /></> // Just arrow
                    ) : (
                        <><CheckCircle className="mr-2 h-4 w-4" /> Finish Round</>
                    ))}
                </Button>
            </div>
          </div>
          
          {/* Editor */}
          <div className="flex-1 relative">
              <Editor
                height="100%"
                language={selectedLanguage}
                value={code}
                theme="vs-dark"
                onChange={(value) => setCode(value || "")}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                }}
              />
          </div>
          
          {/* Output Console */}
          <div className={`transition-all duration-300 border-t border-border bg-slate-950 p-4 overflow-y-auto ${output ? 'h-1/3' : 'h-12'}`}>
              {!output && (
                  <div className="text-center text-xs text-muted-foreground pt-1 flex items-center justify-center gap-2">
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
                      
                      {output.testResults && (
                          <div className="space-y-1 bg-black/20 p-2 rounded">
                              {output.testResults.map((res:any, i:number) => (
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

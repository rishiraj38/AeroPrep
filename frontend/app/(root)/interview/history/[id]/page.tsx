"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getInterviewDetail } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import { setCurrentInterviewId } from '@/lib/currentInterview';
import Link from 'next/link';

interface Question {
  id: number;
  questionText: string;
  expectedAnswer: string;
  userAnswer: string | null;
  feedback: string | null;
  order: number;
}

interface CodingChallenge {
  title: string;
  description: string;
  language: string;
  userCode: string | null;
  passed: boolean | null;
  aiFeedback: string | null;
  skipped: boolean;
}

interface Feedback {
  totalScore: number;
  interviewScore: number;
  codingScore: number;
  strengths: string[];
  weaknesses: string[];
  detailedFeedback: string;
  recommendation: string;
}

interface Interview {
  id: number;
  resumeURL: string;
  jobDescription: string | null;
  status: string;
  endedAt: string | null;
  createdAt: string;
  questions: Question[];
  codingChallenge: CodingChallenge | null;
  feedback: Feedback | null;
}

export default function InterviewDetailPage() {
  const router = useRouter();
  const params = useParams();
  const interviewId = parseInt(params.id as string);
  
  const [interview, setInterview] = useState<Interview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'questions' | 'coding' | 'feedback'>('questions');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/sign-in');
      return;
    }

    async function fetchInterview() {
      try {
        const data = await getInterviewDetail(interviewId);
        setInterview(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchInterview();
  }, [interviewId]);

  // Interviews without a report can be picked back up. The interview room works out where
  // they were: mid-conversation, or at the choice between the coding round and the report.
  const continueInterview = () => {
    if (!interview) return;
    setCurrentInterviewId(interview.id);
    router.push('/interview/session');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div role="status" aria-label="Loading" className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-200"></div>
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{error || 'Interview not found'}</p>
        <Button asChild>
          <Link href="/interview/history">Back to History</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/interview/history" className="text-primary-200 hover:underline mb-4 inline-block">
            ← Back to History
          </Link>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold mb-2">Interview Review</h1>
              <p className="text-muted-foreground">
                {new Date(interview.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            {!interview.feedback && (
              <Button onClick={continueInterview} className="cursor-pointer">
                {interview.endedAt ? 'Continue to report' : 'Resume Interview'}
              </Button>
            )}
            {interview.feedback && (
              <div className="text-right">
                <div className={`text-4xl font-bold ${
                  interview.feedback.totalScore >= 70 ? 'text-green-500' :
                  interview.feedback.totalScore >= 50 ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {interview.feedback.totalScore}/100
                </div>
                <div className="text-sm text-muted-foreground">
                  {interview.feedback.recommendation}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex gap-2 mb-6 border-b">
          <button 
            onClick={() => setActiveTab('questions')}
            aria-selected={activeTab === 'questions'}
            role="tab"
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === 'questions' 
                ? 'border-primary-200 text-primary-200' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Q&A ({interview.questions.length})
          </button>
          <button 
            onClick={() => setActiveTab('coding')}
            aria-selected={activeTab === 'coding'}
            role="tab"
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === 'coding' 
                ? 'border-primary-200 text-primary-200' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Coding
          </button>
          <button 
            onClick={() => setActiveTab('feedback')}
            aria-selected={activeTab === 'feedback'}
            role="tab"
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === 'feedback' 
                ? 'border-primary-200 text-primary-200' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Feedback
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            {interview.questions.map((q) => (
              <div key={q.id} className="bg-card border rounded-lg p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="min-w-[32px] h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
                    {q.order}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">{q.questionText}</h3>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-4 ml-12">
                  <div className="bg-muted/30 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Your Answer</h4>
                    <p className="text-sm">{q.userAnswer || <span className="italic text-muted-foreground">No answer provided</span>}</p>
                  </div>
                  {/* The report's note on this answer; older interviews stored an expected answer instead */}
                  {(q.feedback || !q.expectedAnswer.startsWith('Evaluated dynamically')) && (
                    <div className="bg-green-500/10 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                        {q.feedback ? 'Feedback on this answer' : 'Expected Answer'}
                      </h4>
                      <p className="text-sm">{q.feedback || q.expectedAnswer}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'coding' && (
          <div className="bg-card border rounded-lg p-6">
            {interview.codingChallenge ? (
              interview.codingChallenge.skipped ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p className="text-xl mb-2">Coding Round Skipped</p>
                  <p className="text-sm">You chose to skip the coding challenge for this interview.</p>
                </div>
              ) : (
                <div>
                  <h3 className="text-xl font-bold mb-2">{interview.codingChallenge.title}</h3>
                  <p className="text-muted-foreground mb-4">{interview.codingChallenge.description}</p>
                  
                  <div className="flex items-center gap-4 mb-4">
                    <span className="px-2 py-1 bg-muted rounded text-xs">{interview.codingChallenge.language}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      interview.codingChallenge.passed === null ? 'bg-muted text-muted-foreground'
                        : interview.codingChallenge.passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {interview.codingChallenge.passed === null ? 'Not checked'
                        : interview.codingChallenge.passed ? 'AI review: no problems found' : 'AI review: problems found'}
                    </span>
                  </div>
                  
                  <div className="bg-slate-900 rounded-lg p-4 mb-4">
                    <h4 className="text-sm font-medium text-slate-400 mb-2">Your Code</h4>
                    <pre className="text-sm font-mono text-slate-200 whitespace-pre-wrap overflow-x-auto">
                      {interview.codingChallenge.userCode || 'No code submitted'}
                    </pre>
                  </div>
                  
                  {interview.codingChallenge.aiFeedback && (
                    <div className="bg-muted/30 rounded-lg p-4">
                      <h4 className="text-sm font-medium mb-2">AI Feedback</h4>
                      <p className="text-sm">{interview.codingChallenge.aiFeedback}</p>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                No coding challenge data available
              </div>
            )}
          </div>
        )}

        {activeTab === 'feedback' && (
          <div className="space-y-6">
            {interview.feedback ? (
              <>
                {/* Scores */}
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-card border rounded-lg p-6 text-center">
                    <div className="text-3xl font-bold text-primary">{interview.feedback.totalScore}</div>
                    <div className="text-sm text-muted-foreground">Overall score</div>
                  </div>
                  <div className="bg-card border rounded-lg p-6 text-center">
                    <div className="text-3xl font-bold text-blue-500">{interview.feedback.interviewScore}</div>
                    <div className="text-sm text-muted-foreground">Interview score</div>
                  </div>
                  <div className="bg-card border rounded-lg p-6 text-center">
                    <div className="text-3xl font-bold text-purple-500">{interview.feedback.codingScore}</div>
                    <div className="text-sm text-muted-foreground">Coding score</div>
                  </div>
                </div>

                {/* Strengths & Weaknesses */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
                    <h3 className="font-semibold text-green-600 dark:text-green-400 mb-3">Strengths</h3>
                    <ul className="space-y-2">
                      {interview.feedback.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-green-500">✓</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
                    <h3 className="font-semibold text-red-600 dark:text-red-400 mb-3">Areas for Improvement</h3>
                    <ul className="space-y-2">
                      {interview.feedback.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-red-500">•</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Detailed Feedback */}
                <div className="bg-card border rounded-lg p-6">
                  <h3 className="font-semibold mb-3">Detailed Feedback</h3>
                  <p className="text-sm leading-relaxed">{interview.feedback.detailedFeedback}</p>
                </div>

                {/* Recommendation */}
                <div className={`rounded-lg p-6 text-center ${
                  interview.feedback.recommendation.includes('Strong') ? 'bg-green-500/20' :
                  interview.feedback.recommendation.includes('Hire') ? 'bg-yellow-500/20' : 'bg-red-500/20'
                }`}>
                  <div className="text-lg font-bold">{interview.feedback.recommendation}</div>
                </div>
              </>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                {interview.endedAt ? 'This interview has not been analysed yet.' : 'This interview is not finished yet.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

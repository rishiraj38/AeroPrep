import { getToken, removeToken } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// A failed API call, with the server's machine-readable code (e.g. INTERVIEW_LIMIT_REACHED)
export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface Quota {
  used: number;
  limit: number;
  remaining: number;
}

export interface CodeResult {
  passed: boolean;
  feedback: string;
  testResults: { input: string; expected: string; actual: string; passed: boolean }[];
  language: string;
}

export interface CodingChallenge {
  title: string;
  description: string;
  problemStatement: string;
  constraints: string | null;
  language: string;
  starterCode: string | null;
  testCases: { input: string; expectedOutput: string }[];
  userCode: string | null;
  result: CodeResult | null;
  runsLeft: number;
}

export interface InterviewFeedback {
  totalScore: number;
  interviewScore: number;
  codingScore: number;
  strengths: string[];
  weaknesses: string[];
  detailedFeedback: string;
  recommendation: string;
}

// The server no longer accepts this login (it expired, or the server's signing secret changed):
// forget it and send the user to sign in again
export function expireSession() {
  if (typeof window === 'undefined') return;
  removeToken();
  if (!window.location.pathname.startsWith('/sign-')) window.location.assign('/sign-in');
}

async function request(path: string, options: { method?: string; body?: unknown } = {}) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const data = await response.json().catch(() => null);
  if (response.status === 401) expireSession();
  if (!response.ok) {
    throw new ApiError(data?.error || 'Something went wrong. Please try again.', data?.code || 'ERROR', response.status);
  }
  return data;
}

// ============================================
// INTERVIEWS (Protected)
// ============================================

// Interviews left on the account, plus any unfinished interview that can be resumed
export async function getQuota(): Promise<{ quota: Quota; active: { id: number } | null }> {
  return request('/interviews/quota');
}

export async function createInterview(resumeURL: string, jobDescription: string = '', resumeText: string = ''): Promise<{ interview: { id: number }; quota: Quota }> {
  // Pass resumeText to backend so it can skip PDF extraction if valid text is provided
  return request('/interviews', { method: 'POST', body: { resumeURL, jobDescription, resumeText } });
}

export async function getInterviewHistory() {
  const data = await request('/interviews');
  return data.interviews;
}

export async function getInterviewDetail(interviewId: number) {
  const data = await request(`/interviews/${interviewId}`);
  return data.interview;
}

// ============================================
// CODING ROUND (Protected)
// ============================================

// The interview's challenge; generated on first call, then always the same one
export async function getCodingChallenge(interviewId: number): Promise<CodingChallenge> {
  const data = await request(`/interviews/${interviewId}/coding/challenge`, { method: 'POST' });
  return data.challenge;
}

export async function runCode(interviewId: number, code: string, language: string): Promise<CodingChallenge> {
  const data = await request(`/interviews/${interviewId}/coding/run`, { method: 'POST', body: { code, language } });
  return data.challenge;
}

export async function submitCode(interviewId: number, code: string): Promise<CodingChallenge> {
  const data = await request(`/interviews/${interviewId}/coding/submit`, { method: 'POST', body: { code } });
  return data.challenge;
}

export async function skipCoding(interviewId: number) {
  return request(`/interviews/${interviewId}/coding/skip`, { method: 'POST' });
}

// ============================================
// FEEDBACK (Protected)
// ============================================

// The interview's report; generated on first call, then read back from the database
export async function getFeedback(interviewId: number): Promise<InterviewFeedback> {
  const data = await request(`/interviews/${interviewId}/feedback`, { method: 'POST' });
  return data.feedback;
}

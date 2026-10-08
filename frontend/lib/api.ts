import { toast } from 'sonner';
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

// One question from the interview, the candidate's answer, and the report's note on it
export interface AnsweredQuestion {
  order: number;
  questionText: string;
  userAnswer: string | null;
  feedback: string | null;
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
  if (!window.location.pathname.startsWith('/sign-')) window.location.assign('/sign-in?expired=1');
}

// The backend runs on a free host that sleeps when idle; its first response can take up to a
// minute. Calling this when a page opens means it is usually awake by the time it is needed.
export function wakeBackend(): void {
  fetch(`${API_BASE_URL}/health`).catch(() => {});
}

// Tells the user why nothing is happening when a normally quick request drags on
export function warnIfSlow(): () => void {
  const timer = setTimeout(() => {
    toast.info('Waking up the server. After a quiet spell this can take up to a minute.', { id: 'server-waking', duration: 15000 });
  }, 5000);
  return () => {
    clearTimeout(timer);
    toast.dismiss('server-waking');
  };
}

// `slow: true` marks requests that are expected to take a while (model calls), which have their own progress screens
async function request(path: string, options: { method?: string; body?: unknown; slow?: boolean } = {}) {
  const token = getToken();
  const done = options.slow ? () => {} : warnIfSlow();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 'NETWORK_ERROR', 0);
  } finally {
    done();
  }

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

// Sends a resume PDF to the server and gets back the text in it. The file is not stored.
export async function readResume(file: File): Promise<string> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/resumes/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: file,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 'NETWORK_ERROR', 0);
  }

  const data = await response.json().catch(() => null);
  if (response.status === 401) expireSession();
  if (!response.ok) {
    throw new ApiError(data?.error || 'We could not read that file. Please try again.', data?.code || 'ERROR', response.status);
  }
  return data.text;
}

// resumeText is what was read from the uploaded PDF, or the details typed in by hand
export async function createInterview(resumeText: string, jobDescription: string = '', level: string = ''): Promise<{ interview: { id: number }; quota: Quota }> {
  return request('/interviews', { method: 'POST', body: { resumeText, jobDescription, level } });
}

export async function getInterviewHistory() {
  const data = await request('/interviews');
  return data.interviews;
}

export async function getInterviewDetail(interviewId: number) {
  const data = await request(`/interviews/${interviewId}`);
  return data.interview;
}

// Tells the server the conversation is over. Safe to call more than once.
export async function endInterview(interviewId: number) {
  return request(`/interviews/${interviewId}/end`, { method: 'POST' });
}

// ============================================
// CODING ROUND (Protected)
// ============================================

// The interview's challenge; generated on first call, then always the same one
export async function getCodingChallenge(interviewId: number): Promise<CodingChallenge> {
  const data = await request(`/interviews/${interviewId}/coding/challenge`, { method: 'POST', slow: true });
  return data.challenge;
}

export async function runCode(interviewId: number, code: string, language: string): Promise<CodingChallenge> {
  const data = await request(`/interviews/${interviewId}/coding/run`, { method: 'POST', body: { code, language }, slow: true });
  return data.challenge;
}

export async function submitCode(interviewId: number, code: string): Promise<CodingChallenge> {
  const data = await request(`/interviews/${interviewId}/coding/submit`, { method: 'POST', body: { code } });
  return data.challenge;
}

export async function skipCoding(interviewId: number) {
  return request(`/interviews/${interviewId}/coding/skip`, { method: 'POST' });
}

// What the user thought of AeroPrep itself; saved and emailed to the team
export async function sendProductFeedback(rating: number, message: string, interviewId: number | null) {
  return request('/feedback', { method: 'POST', body: { rating, message, interviewId } });
}

// ============================================
// FEEDBACK (Protected)
// ============================================

// The interview's report; generated on first call, then read back from the database
export async function getFeedback(interviewId: number): Promise<{ feedback: InterviewFeedback; questions: AnsweredQuestion[] }> {
  return request(`/interviews/${interviewId}/feedback`, { method: 'POST', slow: true });
}

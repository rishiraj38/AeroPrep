import { getToken } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

// Helper to add auth header
function getAuthHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

// ============================================
// PUBLIC AI ROUTES
// ============================================

export async function generateQuestions(resumeURL: string, jobDescription: string = '', resumeText: string = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/generate-questions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ resumeURL, jobDescription, resumeText }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate questions');
    }

    const data = await response.json();
    return data.questions;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

export async function generateNextQuestion(
  resumeText: string,
  jobDescription: string,
  conversationHistory: { question: string; answer: string }[],
  questionNumber: number
): Promise<{ question: string; expectedAnswer: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/generate-next-question`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ resumeText, jobDescription, conversationHistory, questionNumber }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate next question');
    }

    const data = await response.json();
    return data.question;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

export async function generateCodingChallenge(resumeURL: string, resumeText: string = '') {
  try {
    const response = await fetch(`${API_BASE_URL}/generate-coding-question`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ resumeURL, resumeText }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate coding challenge');
    }
    
    const data = await response.json();
    return data.challenge;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

export async function evaluateCode(code: string, language: string, problem: any) {
  try {
    const response = await fetch(`${API_BASE_URL}/evaluate-code`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ code, language, problem }),
    });
    const data = await response.json();
    return data.result;
  } catch (error) {
     console.error('API Error:', error);
     throw error;
  }
}

export async function generateFeedback(interviewData: any, codingData: any) {
  try {
    const response = await fetch(`${API_BASE_URL}/generate-feedback`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ interviewData, codingData }),
    });
    const data = await response.json();
    return data.feedback;
  } catch (error) {
     console.error('API Error:', error);
     throw error;
  }
}

// ============================================
// INTERVIEW STORAGE ROUTES (Protected)
// ============================================

export async function createInterview(resumeURL: string, jobDescription: string = '', resumeText: string = '') {
  // Pass resumeText to backend so it can skip PDF extraction if valid text is provided
  const response = await fetch(`${API_BASE_URL}/interviews`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ resumeURL, jobDescription, resumeText }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create interview');
  }
  
  return response.json();
}

export async function saveInterviewAnswers(interviewId: number, answers: any[]) {
  const response = await fetch(`${API_BASE_URL}/interviews/${interviewId}/answers`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ answers }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save answers');
  }
  
  return response.json();
}

export async function saveInterviewCoding(interviewId: number, challenge: any, code: string, result: any, skipped = false) {
  const response = await fetch(`${API_BASE_URL}/interviews/${interviewId}/coding`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ challenge, code, result, skipped }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save coding result');
  }
  
  return response.json();
}

export async function saveInterviewFeedback(interviewId: number, feedback: any) {
  const response = await fetch(`${API_BASE_URL}/interviews/${interviewId}/feedback`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ feedback }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save feedback');
  }
  
  return response.json();
}

export async function getInterviewHistory() {
  const response = await fetch(`${API_BASE_URL}/interviews`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch interviews');
  }
  
  const data = await response.json();
  return data.interviews;
}

export async function getInterviewDetail(interviewId: number) {
  const response = await fetch(`${API_BASE_URL}/interviews/${interviewId}`, {
    headers: getAuthHeaders(),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch interview');
  }
  
  const data = await response.json();
  return data.interview;
}

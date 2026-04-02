require('dotenv').config();

// Config Toggle
const USE_OLLAMA = process.env.USE_OLLAMA === 'true' || true; // Default to true if not specified, given current context

// Ollama Config
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'https://uncrystallisable-lashon-gerundival.ngrok-free.dev';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma2:9b';

// OpenRouter Config
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';

/**
 * Main AI API Router
 */
async function callAIProvider(messages, operationName = 'AI Call', maxTokens = 4000) {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const startTime = Date.now();
    console.log(`[${operationName}] Starting AI request (Attempt ${attempts + 1})... [Provider: ${USE_OLLAMA ? 'Ollama' : 'OpenRouter'}]`);

    try {
      const controller = new AbortController();
      const timeoutSecs = USE_OLLAMA ? 60000 : 20000; // Local inference might take longer initially
      const timeoutId = setTimeout(() => controller.abort(), timeoutSecs); 

      let url, method, headers, body;

      if (USE_OLLAMA) {
        url = OLLAMA_API_URL;
        headers = { 
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'ngrok-skip-browser-warning': 'true'
        };
        body = JSON.stringify({ 
          model: OLLAMA_MODEL, 
          messages, 
          stream: false,
          options: { num_predict: maxTokens } // approximate equivalent
        });
      } else {
        url = OPENROUTER_API_URL;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY2}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'AI Interview Coach',
        };
        body = JSON.stringify({ model: OPENROUTER_MODEL, messages, max_tokens: maxTokens });
      }

      const response = await fetch(url, { method: 'POST', signal: controller.signal, headers, body });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${USE_OLLAMA ? 'Ollama' : 'OpenRouter'} API Error: Status ${response.status}`);
        console.error(`Response Body:`, errorText);
        // Also log headers for debugging (excluding sensitive ones)
        const debugHeaders = {};
        response.headers.forEach((v, k) => { if (k.toLowerCase() !== 'set-cookie') debugHeaders[k] = v; });
        console.error(`Response Headers:`, JSON.stringify(debugHeaders, null, 2));
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      const duration = (((Date.now() - startTime)) / 1000).toFixed(2);
      console.log(`[${operationName}] ✓ Completed in ${duration}s`);
      
      const content = USE_OLLAMA ? data?.message?.content : data?.choices?.[0]?.message?.content;
      return content || "Sorry, I am having trouble processing your response. Could you please repeat that?";

    } catch (err) {
      attempts++;
      console.error(`[${operationName}] Error on attempt ${attempts}: ${err.message}`);
      // Wait for Ollama to spin up (sometimes throws connection error if cold starting)
      if (attempts >= maxAttempts) throw err;
      await new Promise(r => setTimeout(r, 2000 * attempts)); 
    }
  }
}

/**
 * Helper — single prompt (wrapper)
 */
async function callAIProviderPrompt(prompt, operationName = 'AI Call') {
  return callAIProvider([{ role: 'user', content: prompt }], operationName);
}

/**
 * Clean JSON from markdown code blocks.
 */
function cleanJsonResponse(text) {
  let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const startArr = cleaned.indexOf('[');
  const endArr = cleaned.lastIndexOf(']');
  if (start !== -1 && end !== -1 && (start < startArr || startArr === -1)) {
    return cleaned.substring(start, end + 1);
  }
  if (startArr !== -1 && endArr !== -1) {
    return cleaned.substring(startArr, endArr + 1);
  }
  return cleaned;
}

/**
 * Legacy: generate 10 static questions (kept for /generate-questions public endpoint).
 */
async function generateQuestions(resumeText, jobDescription = '') {
  try {
    const prompt = `You are an expert technical interviewer at a top-tier tech company (e.g., Google, Netflix, Amazon). 
    Your goal is to assess the candidate deeply, looking for signals of seniority, problem-solving ability, and system design thinking.
    
    Based on the candidate's resume and the job description provided below, generate exactly 10 relevant interview questions.
    
    CRITICAL GUIDELINES:
    1. AVOID generic trivia (e.g., "What is a hook?"). Ask "How" and "Why" questions.
    2. Focus on trade-offs, architectural decisions, and deep conceptual understanding.
    3. Include behavioral questions that probe leadership and conflict resolution in a technical context.
    
    The questions should be a mix of:
    1. Experience-based (Deep dive into their specific resume projects: "Why did you choose X over Y?").
    2. System Design & Architecture (Scalability, performance, reliability).
    3. Behavioral (Culture fit, mentorship, handling failure).

    Return ONLY a valid JSON array where each object has "question" and "answer" (key points expected in a good answer) fields.
    NO introductory text. NO markdown formatting. Just the raw JSON.
    
    RESUME TEXT:
    ${resumeText}
    
    JOB DESCRIPTION:
    ${jobDescription || 'Not provided (Focus on general software engineering skills based on resume)'}`;

    const response = await callAIProviderPrompt(prompt, 'Generate Questions');
    return JSON.parse(cleanJsonResponse(response));
  } catch (error) {
    console.error('Error generating questions:', error);
    throw new Error('Failed to generate interview questions');
  }
}

/**
 * NEW: Real-time dynamic interview chat.
 * Responds to user's latest answer and naturally asks follow-ups or the next question.
 *
 * @param {string} resumeText
 * @param {string} jobDescription
 * @param {Array<{speaker: 'ai'|'user', text: string}>} conversationHistory
 * @param {number} questionsAsked  — number of main questions asked so far
 * @param {boolean} timeExpiring   — true when < 30s remains; AI should wrap up
 */
async function generateDynamicInterviewChat(
  resumeText,
  jobDescription,
  conversationHistory,
  questionsAsked = 0,
  timeExpiring = false
) {
  const isFirstMessage = conversationHistory.length === 0;
  // Second message = AI has greeted, user replied to small talk, now pivot to interview
  const isSecondTurn = conversationHistory.length === 2;

  const systemPrompt = `You are Alex, a friendly but rigorous senior software engineering interviewer.

${ resumeText ? `=== CANDIDATE RESUME ===
${resumeText.substring(0, 2000)}
=== END RESUME ===` : 'No resume provided.' }
${ jobDescription ? `\n=== JOB DESCRIPTION ===
${jobDescription.substring(0, 600)}
=== END JOB DESCRIPTION ===` : '' }

ABUSE POLICY (HIGHEST PRIORITY):
- If the candidate uses ANY abusive, offensive, profane, or threatening language, you MUST respond ONLY with exactly this:
  "I cannot move forward with this behaviour. I will be reporting this session and ending the call now. [INTERVIEW_TERMINATED]"
  Do not say anything else. Do not continue the interview.

${ isFirstMessage
  ? `OPENING — This is your very first message. Do this EXACTLY in order:
1. Greet warmly: Say something like "Hello! My name is Alex, welcome to your interview today."
2. Ask a friendly icebreaker: "Hope your day is going well — how are you feeling before we start?"
Do NOT ask a technical question yet. Keep it warm and human. Max 2 sentences.`
  : isSecondTurn
  ? `TRANSITION — The candidate has replied to your greeting. Now do this EXACTLY:
1. Respond briefly to their small talk (1 short sentence).
2. Pivot to the first interview question. Reference a SPECIFIC project, technology, or skill from the resume above. Do NOT ask "tell me about yourself".
Max 2-3 sentences total.`
  : `INTERVIEW IN PROGRESS — You have asked ${questionsAsked} main question(s) so far.
- If the candidate's last answer was shallow or vague → ask ONE short follow-up probing deeper.
- If the answer was solid → briefly acknowledge (1 sentence) and ask the NEXT resume-specific question.
- After 3-4 total main questions where answers were satisfactory → say something like: "Fantastic, I think we have covered everything I needed. It was a real pleasure speaking with you today! Please go ahead and click the red end-call button whenever you are ready." IMPORTANT: include the phrase "red end-call button" so the system can detect this.
${ timeExpiring ? '\nTIME CRITICAL: Time is almost up. Conclude NOW with a warm farewell. Thank the candidate and tell them to click the red end-call button.' : '' }`
}

STRICT FORMAT RULES:
- Max 2-3 sentences per response. Never more.
- Plain English only. No bullet points. No markdown. No numbered lists.
- Never say "As an AI" or break character.
- Never ask two questions in one message.
- Always be specific to the resume. Never ask generic questions.`;

  const messages = [{ role: 'system', content: systemPrompt }];
  for (const entry of conversationHistory) {
    messages.push({
      role: entry.speaker === 'ai' ? 'assistant' : 'user',
      content: entry.text,
    });
  }

  try {
    const response = await callAIProvider(messages, 'Dynamic Chat', 400);
    return response.trim();
  } catch (error) {
    console.error('Error generating dynamic chat response:', error);
    throw new Error('Failed to generate AI response');
  }
}

/**
 * Generates a coding challenge based on the candidate's tech stack.
 */
async function generateCodingChallenge(resumeText) {
  let attempts = 0;
  const maxAttempts = 3;
  while (attempts < maxAttempts) {
    try {
      const prompt = `You are a strict technical interviewer. Based on the candidate's resume below, identify their primary programming language.
Then, generate a medium-difficulty coding challenge suitable for a live interview.

RESUME TEXT:
${resumeText.substring(0, 1500)}

Return ONLY a valid JSON object. Do not include any explanation.
Structure:
{
  "language": "javascript",
  "title": "Problem Title",
  "description": "Short description of the problem.",
  "problemStatement": "Detailed explanation of the problem, input/output format, and examples.",
  "constraints": "List of constraints (e.g. time limit, input size, memory usage). Must be a string.",
  "starterCode": "function solve(input) {\\n  // Your code here\\n}",
  "testCases": [
    { "input": "...", "expectedOutput": "..." },
    { "input": "...", "expectedOutput": "..." }
  ]
}`;
      const response = await callAIProviderPrompt(prompt, `Generate Coding Challenge (Attempt ${attempts + 1})`);
      const challenge = JSON.parse(cleanJsonResponse(response));
      return {
        language: challenge.language || 'javascript',
        title: challenge.title || 'Coding Challenge',
        description: challenge.description || 'No description provided.',
        problemStatement: challenge.problemStatement || 'No problem statement provided.',
        constraints: challenge.constraints || 'No specific constraints provided.',
        starterCode: challenge.starterCode || '// Write your solution here',
        testCases: Array.isArray(challenge.testCases) ? challenge.testCases : [],
      };
    } catch (error) {
      attempts++;
      console.error(`Error generating coding challenge (Attempt ${attempts}):`, error);
      if (attempts >= maxAttempts) throw new Error('Failed to generate coding challenge after multiple attempts');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/**
 * Evaluates user code.
 */
async function evaluateCode(code, language, problem) {
  try {
    const prompt = `You are a code evaluator.

PROBLEM:
${problem.description}
${problem.problemStatement}

CONSTRAINTS:
${problem.constraints}

TEST CASES:
${JSON.stringify(problem.testCases)}

USER CODE (${language}):
${code}

Analyze the user's code. Determine if it correctly solves the problem and passes all test cases.

Return ONLY a valid JSON object:
{
  "passed": true or false,
  "feedback": "Detailed feedback on correctness, efficiency, and cleanliness.",
  "testResults": [
    { "input": "...", "expected": "...", "actual": "...", "passed": true or false }
  ]
}`;
    const response = await callAIProviderPrompt(prompt, 'Evaluate Code');
    return JSON.parse(cleanJsonResponse(response));
  } catch (error) {
    console.error('Error evaluating code:', error);
    throw new Error('Failed to evaluate code');
  }
}

/**
 * Generates final feedback from the live interview transcript.
 * Supports raw transcript [{speaker, text}] or legacy Q&A array.
 */
async function generateFeedback(interviewData, codingData) {
  try {
    let formattedInterview = '';

    if (Array.isArray(interviewData) && interviewData.length > 0 && interviewData[0].speaker) {
      // Build clean Q&A pairs from the transcript
      const pairs = [];
      for (let i = 0; i < interviewData.length - 1; i++) {
        if (interviewData[i].speaker === 'ai' && interviewData[i + 1]?.speaker === 'user') {
          pairs.push(`Q: ${interviewData[i].text}\nA: ${interviewData[i + 1].text}`);
        }
      }
      formattedInterview = pairs.length > 0
        ? pairs.map((p, i) => `--- Exchange ${i + 1} ---\n${p}`).join('\n\n')
        : interviewData.map(e => `${e.speaker === 'ai' ? 'Interviewer' : 'Candidate'}: ${e.text}`).join('\n');
    } else if (Array.isArray(interviewData)) {
      formattedInterview = interviewData.map((q, i) =>
        `Q${i + 1}: ${q.question || q.questionText || 'Unknown'}\nExpected: ${q.answer || q.expectedAnswer || ''}\nCandidate said: ${q.userAnswer || 'No answer'}`
      ).join('\n\n');
    } else {
      formattedInterview = JSON.stringify(interviewData);
    }

    const hasCoding = codingData?.code && codingData.code !== 'N/A' && codingData.code !== '// Skipped';

    const prompt = `You are a senior engineering manager scoring a technical interview. Analyze the interview and return a JSON report.

INTERVIEW EXCHANGES:
${formattedInterview}

${hasCoding ? `CODING ROUND:\nProblem: ${codingData?.challenge?.title || 'N/A'}\nCandidate Code: ${codingData?.code?.substring(0, 800) || 'N/A'}\nResult: ${JSON.stringify(codingData?.result || {})}` : 'CODING ROUND: Skipped by candidate.'}

SCORING GUIDE:
- interviewScore: Score 0-100 based ONLY on the interview exchanges above. Consider: depth of answers, technical accuracy, communication clarity, problem-solving shown.
- codingScore: Score 0-100 based on the coding round. If skipped, score 30.
- totalScore: Weighted average (70% interview + 30% coding).
- hiringRecommendation: "Strong Hire" (75+), "Hire" (55-74), "No Hire" (below 55).

IMPORTANT: You MUST give a non-zero interviewScore if ANY interview exchanges are shown above.

Return ONLY this JSON object, nothing else before or after it:
{
  "totalScore": <number 0-100>,
  "interviewScore": <number 0-100>,
  "codingScore": <number 0-100>,
  "strengths": ["<specific strength from transcript>", "<another specific strength>"],
  "weaknesses": ["<specific area to improve>", "<another specific weakness>"],
  "detailedFeedback": "<2-3 paragraph analysis referencing specific things the candidate said>",
  "hiringRecommendation": "<Strong Hire / Hire / No Hire>"
}`;

    const response = await callAIProviderPrompt(prompt, 'Generate Feedback');
    
    let parsed;
    try {
      parsed = JSON.parse(cleanJsonResponse(response));
    } catch (jsonErr) {
      console.error('Feedback JSON parse failed, using safe defaults:', jsonErr.message);
      parsed = {
        totalScore: 50,
        interviewScore: 50,
        codingScore: hasCoding ? 40 : 30,
        strengths: ['Participated in the interview session'],
        weaknesses: ['Feedback generation encountered an issue — please retake for a full report'],
        detailedFeedback: response?.substring(0, 500) || 'Unable to parse detailed feedback.',
        hiringRecommendation: 'Hire'
      };
    }

    return parsed;
  } catch (error) {
    console.error('Error generating feedback:', error);
    throw new Error('Failed to generate feedback');
  }
}

module.exports = {
  generateQuestions,
  generateDynamicInterviewChat,
  generateCodingChallenge,
  evaluateCode,
  generateFeedback,
};

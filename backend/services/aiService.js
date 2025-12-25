require('dotenv').config();

// OpenRouter API configuration
// Uses Xiaomi MiMo v2 Flash - a free model
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'xiaomi/mimo-v2-flash:free'; // Free model

/**
 * Helper function to call OpenRouter API
 */
async function callOpenRouter(prompt, operationName = 'AI Call') {
  const startTime = Date.now();
  console.log(`[${operationName}] Starting AI request...`);
  
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'AI Interview Coach'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('OpenRouter API Error:', error);
    throw new Error(`OpenRouter API Error: ${response.status}`);
  }

  const data = await response.json();
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log(`[${operationName}] ✓ Completed in ${duration}s`);
  
  return data.choices[0].message.content;
}

/**
 * Clean JSON from markdown code blocks
 */
function cleanJsonResponse(text) {
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

/**
 * Generates interview questions based on resume text and optional job description.
 */
async function generateQuestions(resumeText, jobDescription = "") {
  try {
    const prompt = `You are an expert technical interviewer. Based on the candidate's resume and the job description provided below, generate exactly 10 relevant interview questions.
    
The questions should be a mix of:
1. Experience-based questions (validating their resume).
2. Technical questions (testing skills required for the job).
3. Behavioral questions (culture fit).

Return ONLY a valid JSON array where each object has "question" and "answer" (expected answer or key points) fields.
Example format: [{"question": "...", "answer": "..."}]

RESUME TEXT:
${resumeText}

JOB DESCRIPTION:
${jobDescription || "Not provided (Focus on general software engineering skills based on resume)"}`;

    const response = await callOpenRouter(prompt, 'Generate Questions');
    const cleanedText = cleanJsonResponse(response);
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('Error generating questions:', error);
    throw new Error('Failed to generate interview questions');
  }
}

/**
 * Generates a coding challenge based on the candidate's profile/tech stack.
 */
async function generateCodingChallenge(resumeText) {
  try {
    const prompt = `Based on the candidate's resume below, identify their primary programming language (e.g., JavaScript, Python, Java).
Then, generate a medium-difficulty coding challenge suitable for a live interview.

RESUME TEXT:
${resumeText.substring(0, 1500)}

Return ONLY a valid JSON object with this structure:
{
  "language": "javascript",
  "title": "Problem Title",
  "description": "Short description of the problem.",
  "problemStatement": "Detailed explanation of the problem, input/output format, and examples.",
  "constraints": "List of constraints (e.g. time limit, input size).",
  "starterCode": "function solve(input) {\\n  // Your code here\\n}",
  "testCases": [
    { "input": "...", "expectedOutput": "..." },
    { "input": "...", "expectedOutput": "..." }
  ]
}`;

    const response = await callOpenRouter(prompt, 'Generate Coding Challenge');
    const cleanedText = cleanJsonResponse(response);
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('Error generating coding challenge:', error);
    throw new Error('Failed to generate coding challenge');
  }
}

/**
 * Evaluates the user's code against the problem statement and test cases.
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

TASK:
Analyze the user's code. Determine if it correctly solves the problem and passes all test cases.
Check for time complexity and edge cases.

Return ONLY a valid JSON object:
{
  "passed": true or false,
  "feedback": "Detailed feedback on correctness, efficiency, and cleanliness.",
  "testResults": [
    { "input": "...", "expected": "...", "actual": "...", "passed": true or false }
  ]
}`;

    const response = await callOpenRouter(prompt, 'Evaluate Code');
    const cleanedText = cleanJsonResponse(response);
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('Error evaluating code:', error);
    throw new Error('Failed to evaluate code');
  }
}

/**
 * Generates comprehensive feedback based on interview and coding performance.
 */
async function generateFeedback(interviewData, codingData) {
  try {
    const prompt = `You are a senior engineering manager. Generate a final interview report based on the candidate's performance.

INTERVIEW Q&A:
${JSON.stringify(interviewData)}

CODING ROUND:
Challenge: ${codingData?.challenge?.title || 'N/A'}
Code Submitted: 
${codingData?.code || 'N/A'}
Evaluation: ${JSON.stringify(codingData?.result || {})}

TASK:
Generate a JSON report with:
{
  "totalScore": 0-100,
  "interviewScore": 0-100,
  "codingScore": 0-100,
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "detailedFeedback": "Paragraph...",
  "hiringRecommendation": "Strong Hire / Hire / No Hire"
}

Return ONLY the valid JSON object, no other text.`;

    const response = await callOpenRouter(prompt, 'Generate Feedback');
    const cleanedText = cleanJsonResponse(response);
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('Error generating feedback:', error);
    throw new Error('Failed to generate feedback');
  }
}

module.exports = {
  generateQuestions,
  generateCodingChallenge,
  evaluateCode,
  generateFeedback
};

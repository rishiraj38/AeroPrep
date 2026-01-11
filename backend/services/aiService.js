require('dotenv').config();

// OpenRouter API configuration
// Switched to Nvidia Nemotron-3 Nano - fastest and high quality free model
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openai/gpt-oss-safeguard-20b';

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
 * Clean JSON from markdown code blocks and extract the JSON object.
 */
function cleanJsonResponse(text) {
  let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  
  // Attempt to find the first '{' or '[' and last '}' or ']'
  const firstOpen = cleaned.search(/[{\[]/);
  const lastClose = cleaned.search(/[}\]]$/); // Search from end? No, regex searches from start.
  
  // Better approach: find first '{' and the last '}'
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
 * Generates interview questions based on resume text and optional job description.
 */
async function generateQuestions(resumeText, jobDescription = "") {
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
 * Generates the next interview question based on conversation history.
 * This creates a dynamic, adaptive interview experience.
 */
async function generateNextQuestion(resumeText, jobDescription = "", conversationHistory = [], questionNumber = 1, totalQuestions = 10) {
  try {
    // Build conversation context
    let conversationContext = "";
    if (conversationHistory.length > 0) {
      conversationContext = conversationHistory.map((qa, i) => 
        `Q${i + 1}: ${qa.question}\nCandidate's Answer: ${qa.answer}`
      ).join("\n\n");
    }

    const prompt = `You are an expert technical interviewer at a top-tier tech company conducting a live interview.
    
You are asking question ${questionNumber} of ${totalQuestions}.

CANDIDATE'S RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription || "Not provided (Focus on general software engineering skills based on resume)"}

${conversationHistory.length > 0 ? `INTERVIEW SO FAR:\n${conversationContext}\n` : ""}

INSTRUCTIONS:
${questionNumber === 1 ? 
  `This is the FIRST question. Start with a warm, engaging question about their most impressive or recent project from the resume. Make them comfortable.` : 
  `Based on the candidate's previous answer, generate a thoughtful follow-up question that:
  1. Probes DEEPER into something they mentioned (if their answer was interesting)
  2. Or pivots to a new topic from their resume if the previous answer was weak
  3. Consider the flow: earlier questions should be easier, later questions (7-10) should be more challenging (system design, trade-offs, edge cases)`
}

QUESTION TYPES TO CONSIDER:
- Questions 1-3: Experience-based, projects from resume, "tell me about..."
- Questions 4-6: Technical deep-dives, "how would you scale...", "what trade-offs..."
- Questions 7-9: System design, architecture decisions, handling failures
- Question 10: Behavioral or a challenging scenario question

Return ONLY a valid JSON object with these fields:
{
  "question": "Your question text here",
  "expectedAnswer": "Key points a strong candidate should mention"
}

NO introductory text. NO markdown. Just the JSON.`;

    const response = await callOpenRouter(prompt, `Generate Question ${questionNumber}`);
    const cleanedText = cleanJsonResponse(response);
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('Error generating next question:', error);
    throw new Error('Failed to generate next interview question');
  }
}

/**
 * Generates a coding challenge based on the candidate's profile/tech stack.
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

      const response = await callOpenRouter(prompt, `Generate Coding Challenge (Attempt ${attempts + 1})`);
      const cleanedText = cleanJsonResponse(response);
      const challenge = JSON.parse(cleanedText);

      // Ensure defaults to prevent crashes
      return {
          language: challenge.language || 'javascript',
          title: challenge.title || 'Coding Challenge',
          description: challenge.description || 'No description provided.',
          problemStatement: challenge.problemStatement || 'No problem statement provided.',
          constraints: challenge.constraints || 'No specific constraints provided.',
          starterCode: challenge.starterCode || '// Write your solution here',
          testCases: Array.isArray(challenge.testCases) ? challenge.testCases : []
      };
    } catch (error) {
      attempts++;
      console.error(`Error generating coding challenge (Attempt ${attempts}):`, error);
      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate coding challenge after multiple attempts');
      }
      // Optional: Add a small delay before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
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

Return ONLY a valid JSON object. NO conversational text.
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
  generateNextQuestion,
  generateCodingChallenge,
  evaluateCode,
  generateFeedback
};

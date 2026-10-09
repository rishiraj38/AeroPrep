require('dotenv').config();

const { chat } = require('./llm');
const { stripControl } = require('./text');
const { RESUME_PROMPT_CHARS, JOB_DESCRIPTION_CHARS } = require('./limits');

// Ceilings on what one call may generate (including the model's own reasoning). Typical use is a
// small fraction of these; they exist so that text typed by a candidate cannot talk the model
// into an enormous, expensive answer.
const MAX_TOKENS = { reply: 2000, challenge: 6000, evaluation: 4000, feedback: 6000 };

// How long to wait for the model. A live reply normally takes two or three seconds, so a
// candidate should never sit through a minute of silence waiting on a stuck call.
const REPLY_TIMEOUT_MS = Number(process.env.AI_REPLY_TIMEOUT_MS) > 0 ? Number(process.env.AI_REPLY_TIMEOUT_MS) : 30000;
const JSON_TIMEOUT_MS = 75000;

// Names models use for languages, mapped to the ids the code editor knows
const LANGUAGE_ALIASES = {
  'c++': 'cpp', cplusplus: 'cpp', 'c#': 'csharp', golang: 'go', js: 'javascript', node: 'javascript',
  'node.js': 'javascript', nodejs: 'javascript', ts: 'typescript', py: 'python', python3: 'python',
};

// The interviewer ends its last message with one of these; they are stripped before the text is shown.
const END_MARKER = '[END_INTERVIEW]';
const TERMINATED_MARKER = '[INTERVIEW_TERMINATED]';

// What the interviewer says when a reply was paid for but held nothing that can be said aloud
// (only a marker, or the model declined). The turn still counts; it is never simply retried.
const CLOSING_LINE = "That's all we have time for today. Thank you for talking with me, and good luck with your preparation. Goodbye!";
const RECOVERY_LINE = 'Sorry, I lost my thread for a moment. Could you tell me a little more about that?';
const NO_USAGE = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };

/**
 * Sends one request to the configured AI provider (see services/llm) and logs what it cost.
 */
async function callAI(request, operationName) {
  const startTime = Date.now();
  try {
    const result = await chat(request);
    const { inputTokens, outputTokens, cachedTokens } = result.usage;
    const secs = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${operationName}] ✓ ${secs}s — ${inputTokens} in (${cachedTokens} cached) / ${outputTokens} out tokens`);
    return result;
  } catch (err) {
    console.error(`[${operationName}] Error: ${err.message}`);
    throw err;
  }
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
 * Asks for a JSON answer and parses it, retrying once if the model returns something unparseable.
 * Whatever was spent is reported even when the call fails, as `usage` on the thrown error.
 */
async function callAIForJson(prompt, operationName, maxTokens) {
  const usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  const add = (spent) => {
    for (const key of Object.keys(usage)) usage[key] += spent?.[key] || 0;
  };
  // `billed: false` survives only when no attempt of this call cost anything
  const fail = (message, cause) => Object.assign(new Error(message), {
    usage,
    ...(cause?.billed === false && usage.inputTokens + usage.outputTokens === 0 ? { billed: false } : {})
  });

  for (let attempt = 1; ; attempt++) {
    let result;
    try {
      result = await callAI({ messages: [{ role: 'user', content: prompt }], maxTokens, timeoutMs: JSON_TIMEOUT_MS }, operationName);
    } catch (error) {
      add(error.usage);
      throw fail(error.message, error);
    }
    add(result.usage);
    try {
      return { value: JSON.parse(cleanJsonResponse(result.text)), usage };
    } catch (error) {
      console.error(`[${operationName}] Invalid JSON on attempt ${attempt}: ${error.message}`);
      if (attempt >= 2) throw fail(`${operationName}: the model did not return valid JSON`);
    }
  }
}

// Models sometimes return numbers, arrays or objects where the UI expects text.
function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return stripControl(value);
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return stripControl(value.join('\n'));
  return stripControl(JSON.stringify(value));
}

function toScore(value) {
  const score = Math.round(Number(value));
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
}

function toStringList(value) {
  return Array.isArray(value) ? value.map(toText).filter(Boolean) : [];
}

// Experience levels a candidate can choose; each tells the interviewer how hard to pitch its questions
const LEVELS = {
  intern: 'Student or intern. Ask about coursework, personal and college projects, and fundamentals. Do not expect production experience, on-call work or large-scale design.',
  junior: 'Entry level, up to two years of experience. Expect solid fundamentals and hands-on detail about their own projects. Keep design questions small.',
  mid: 'Mid level, two to five years of experience. Expect ownership of features, reasoned trade-offs and experience debugging real problems.',
  senior: 'Senior, five or more years of experience. Expect system design, technical leadership, cross-team trade-offs and mentoring.',
};

const CHALLENGE_DIFFICULTY = { intern: 'an easy', junior: 'an easy-to-medium', mid: 'a medium', senior: 'a medium-to-hard' };

/**
 * Splits text that arrives in pieces into whole sentences, so each can be spoken as soon as it
 * is complete. The control markers never reach the callback, even when one arrives split in two.
 */
function createSentenceStream(onSentence) {
  let pending = '';
  const sentences = [];

  const emit = (raw) => {
    const sentence = stripControl(raw.replace(END_MARKER, '').replace(TERMINATED_MARKER, '').replace(/\s+/g, ' ')).trim();
    if (!sentence) return;
    sentences.push(sentence);
    if (onSentence) onSentence(sentence);
  };

  return {
    push(delta) {
      pending += delta;
      // Text after an unclosed "[" may be the start of a marker: hold it back for now
      const bracket = pending.lastIndexOf('[');
      const safeEnd = bracket !== -1 && !pending.includes(']', bracket) ? bracket : pending.length;

      const boundary = /[.!?]["')]*\s+/g;
      let consumed = 0;
      let match;
      while ((match = boundary.exec(pending)) && match.index + match[0].length <= safeEnd) {
        const end = match.index + match[0].length;
        emit(pending.slice(consumed, end));
        consumed = end;
      }
      pending = pending.slice(consumed);
    },
    // The sentences handed over so far, without the unfinished one still being written
    delivered: () => sentences.join(' '),
    // Call when the reply is complete; returns the whole reply as it was delivered
    finish() {
      emit(pending);
      pending = '';
      return sentences.join(' ');
    },
  };
}

/**
 * The interviewer's opening line. Fixed text, so starting (or reloading) an interview costs no tokens.
 */
function interviewGreeting(candidateName) {
  const firstName = (candidateName || '').trim().split(/\s+/)[0];
  return `Hello${firstName ? ` ${firstName}` : ''}! My name is Alex, and I'll be your interviewer today. We'll spend about fifteen minutes on your background and the role, and I'll leave time at the end for anything you'd like to ask me. Before we dive in, how's your day going?`;
}

/**
 * System prompt for the live interview. It depends only on the interview's stored resume and job
 * description, so it is identical on every turn and the provider can cache it; anything that changes
 * per turn goes in interviewTurnNote instead.
 */
function buildInterviewSystemPrompt(resumeText, jobDescription, level) {
  return `You are Alex, an experienced interviewer running a spoken mock interview for the role described below. You are friendly but rigorous. Interview for that role, whatever it is: engineering, data, product, design or anything else.

${ resumeText ? `=== CANDIDATE RESUME ===
${resumeText.substring(0, RESUME_PROMPT_CHARS)}
=== END RESUME ===` : 'No resume provided.' }
${ jobDescription ? `\n=== JOB DESCRIPTION ===
${jobDescription.substring(0, JOB_DESCRIPTION_CHARS)}
=== END JOB DESCRIPTION ===` : '' }
${ LEVELS[level] ? `\nCANDIDATE LEVEL: ${LEVELS[level]} Pitch every question at this level.` : '' }

HOW THE INTERVIEW RUNS:
- You have already greeted the candidate, explained the format, and asked how their day is going.
- When they reply to the greeting: respond to the small talk in one short sentence, then open with your first question. Ask them to walk you through the one project or role on the resume that is most relevant here, naming it. Do NOT ask "tell me about yourself".
- Then run a real interview arc, one question at a time, in roughly this order:
  1. A deep dive into what they just described: why they made a specific choice, what the trade-off was, what broke.
  2. A fundamentals question about a skill or tool they list, framed around their own work.
  3. A scenario that fits the role. For engineers, a production incident or a small design problem; for other roles, the equivalent real situation from that job. Let them think out loud.
  4. One behavioural question (a disagreement, a failure, a time they took ownership).
  5. Finally ask: "Before we wrap up, do you have any questions for me?" Answer what they ask briefly and plausibly as their interviewer, then conclude.
- Skip a step if time is short. Each step is one main question plus at most one follow-up.

BEHAVE LIKE A HUMAN INTERVIEWER:
- Listen. Refer back to a specific detail the candidate said ("you mentioned the outbox table...") instead of generic praise.
- As the candidate finishes each answer they have already heard you say a brief "Okay" or "Right" (the software plays it at once). So do not open your reply with an acknowledgement of your own such as "Got it", "Okay", "Right" or "I see": begin with the substance.
- Do not praise every answer. Save "that's a good point" for answers that earn it.
- If an answer is shallow or vague, ask ONE short follow-up that probes deeper. If it is wrong, do not correct it; ask a question that lets them notice ("What happens if two requests arrive at the same time?").
- If they ask you to repeat or clarify, do that plainly and wait for their answer.
- If they say they do not know, give one small hint or a simpler version once. If they are still stuck, say that's fine and move on.
- If they go off topic or ramble, gently steer back to the question.
- If they are nervous, be warm for a sentence, then carry on.
- Text in square brackets that starts with "Interview system:" comes from the interview software, not from the candidate. Follow it, and never mention it.
- To conclude: thank the candidate, mention one specific thing from the conversation, say goodbye, and end your message with ${END_MARKER}. Do not ask anything in that message.

CONDUCT:
- If the candidate is abusive or threatening towards you, reply ONLY with: "I can't continue with this interview, so I'm ending the session now. ${TERMINATED_MARKER}"
- Mild swearing about their own work or a hard problem is not abuse; carry on.

STRICT FORMAT RULES (your reply is read aloud by text-to-speech):
- Max 2-3 sentences per response. Never more.
- Plain spoken English only. No bullet points. No markdown. No numbered lists.
- Never say "As an AI" or break character.
- Never ask two questions in one message.
- Always be specific to the resume. Never ask generic questions.`;
}

/**
 * Per-turn pacing instruction for the interviewer.
 */
function interviewTurnNote({ answerNumber, maxAnswers, minutesLeft, final }) {
  if (final) {
    return `[Interview system: the interview is over. This is your final message — do not ask another question. Thank the candidate, say goodbye, and end with ${END_MARKER}.]`;
  }
  const answersLeft = maxAnswers - answerNumber;
  if (answersLeft <= 2 || minutesLeft <= 2) {
    return '[Interview system: the interview is almost over. If you have not yet asked whether the candidate has questions for you, do that now; otherwise wrap up.]';
  }
  return `[Interview system: answer ${answerNumber} of at most ${maxAnswers}; about ${minutesLeft} minutes left.]`;
}

/**
 * Generates the interviewer's reply to the candidate's latest answer.
 *
 * @param {object} params
 * @param {string} params.resumeText
 * @param {string} params.jobDescription
 * @param {string} [params.level]  A key of LEVELS, or empty to let the interviewer judge from the resume.
 * @param {Array<{speaker: 'ai'|'user', text: string}>} params.history  Full transcript, ending with the candidate's answer.
 * @param {string} params.turnNote  From interviewTurnNote.
 * @param {boolean} [params.final]  This is the interview's last message.
 * @param {(sentence: string) => void} [params.onSentence]  Called with each sentence as soon as it is complete.
 * @returns {Promise<{text: string, ended: boolean, usage: object}>}
 *
 * Throws only when nothing was said: the answer can then be sent again. A reply that broke off
 * half way keeps the sentences already delivered, and one that was paid for but empty is
 * replaced by a fixed line, so that neither can be asked for again and again at no cost to the asker.
 */
async function generateInterviewReply({ resumeText, jobDescription, level, history, turnNote, final = false, onSentence }) {
  // The transcript opens with the interviewer, but providers expect the user to speak first.
  const messages = [{ role: 'user', content: '[The candidate has joined the call.]' }];
  for (const entry of history) {
    messages.push({
      role: entry.speaker === 'ai' ? 'assistant' : 'user',
      content: entry.text,
    });
  }

  const sentences = createSentenceStream(onSentence);
  const sayInstead = (ended) => {
    const line = ended ? CLOSING_LINE : RECOVERY_LINE;
    if (onSentence) onSentence(line);
    return line;
  };

  let result;
  try {
    result = await callAI({
      system: buildInterviewSystemPrompt(resumeText || '', jobDescription || '', level),
      messages,
      turnNote,
      cache: true,
      fast: true,
      onText: sentences.push,
      maxTokens: MAX_TOKENS.reply,
      timeoutMs: REPLY_TIMEOUT_MS,
    }, 'Interview Reply');
  } catch (error) {
    // The reply broke off after part of it had been spoken: keep that part, do not take it back
    const spoken = sentences.delivered();
    if (spoken) return { text: spoken, ended: final, usage: error.usage || NO_USAGE };
    // The call ran to the end but there is nothing to say (the model declined, or sent nothing)
    if (error.completed) return { text: sayInstead(final), ended: final, usage: error.usage || NO_USAGE };
    throw error;
  }

  const ended = final || result.text.includes(END_MARKER) || result.text.includes(TERMINATED_MARKER);
  // The stored reply is exactly the sentences that were delivered, so a client that spoke
  // them as they arrived and one that reads the transcript later see the same text
  const text = sentences.finish() || sayInstead(ended);
  return { text, ended, usage: result.usage };
}

/**
 * Generates a coding challenge based on the candidate's tech stack.
 */
async function generateCodingChallenge(resumeText, level) {
  const prompt = `You are a strict technical interviewer. Based on the candidate's resume below, identify their primary programming language.
Then, generate ${CHALLENGE_DIFFICULTY[level] || 'a medium'}-difficulty coding challenge suitable for a live interview.

RESUME TEXT:
${(resumeText || 'Not provided. Use JavaScript.').substring(0, 1500)}

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
  const { value, usage } = await callAIForJson(prompt, 'Generate Coding Challenge', MAX_TOKENS.challenge);
  if (!value || !value.title || !value.problemStatement) {
    throw Object.assign(new Error('Generate Coding Challenge: the model returned an incomplete challenge'), { usage });
  }

  const language = toText(value.language).toLowerCase().trim();
  const challenge = {
    language: LANGUAGE_ALIASES[language] || language || 'javascript',
    title: toText(value.title),
    description: toText(value.description) || 'No description provided.',
    problemStatement: toText(value.problemStatement),
    constraints: toText(value.constraints) || 'No specific constraints provided.',
    starterCode: toText(value.starterCode) || '// Write your solution here',
    testCases: Array.isArray(value.testCases)
      ? value.testCases.map((tc) => ({ input: toText(tc?.input), expectedOutput: toText(tc?.expectedOutput) }))
      : [],
  };
  return { challenge, usage };
}

/**
 * Evaluates user code.
 */
async function evaluateCode(code, language, problem) {
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
  const { value, usage } = await callAIForJson(prompt, 'Evaluate Code', MAX_TOKENS.evaluation);
  const result = {
    passed: value?.passed === true,
    feedback: toText(value?.feedback),
    testResults: Array.isArray(value?.testResults)
      ? value.testResults.map((tr) => ({
          input: toText(tr?.input),
          expected: toText(tr?.expected),
          actual: toText(tr?.actual),
          passed: tr?.passed === true,
        }))
      : [],
  };
  return { result, usage };
}

/**
 * Generates final feedback from the live interview transcript.
 *
 * @param {Array<{speaker: 'ai'|'user', text: string}>} transcript
 * @param {{title: string, code: string, result: object}|null} coding  null when the coding round was skipped.
 */
async function generateFeedback(transcript, coding) {
  // Build clean Q&A pairs from the transcript
  const pairs = [];
  for (let i = 0; i < transcript.length - 1; i++) {
    if (transcript[i].speaker === 'ai' && transcript[i + 1]?.speaker === 'user') {
      pairs.push(`Q: ${transcript[i].text}\nA: ${transcript[i + 1].text}`);
    }
  }
  const formattedInterview = pairs.map((p, i) => `--- Exchange ${i + 1} ---\n${p}`).join('\n\n');

  const prompt = `You are an experienced hiring manager scoring a mock interview. Analyze the interview and return a JSON report.

INTERVIEW EXCHANGES:
${formattedInterview}

${coding ? `CODING ROUND:\nProblem: ${coding.title}\nCandidate Code: ${coding.code.substring(0, 3000)}\nResult: ${JSON.stringify(coding.result || {})}` : 'CODING ROUND: Skipped by candidate.'}

SCORING GUIDE:
- interviewScore: Score 0-100 based ONLY on the interview exchanges above. Consider: depth of answers, technical accuracy, communication clarity, problem-solving shown.
- codingScore: Score 0-100 based on the coding round. If skipped, score 30.
- totalScore: Weighted average (70% interview + 30% coding).
- hiringRecommendation: "Strong Hire" (75+), "Hire" (55-74), "No Hire" (below 55).

Return ONLY this JSON object, nothing else before or after it:
{
  "totalScore": <number 0-100>,
  "interviewScore": <number 0-100>,
  "codingScore": <number 0-100>,
  "strengths": ["<specific strength from transcript>", "<another specific strength>"],
  "weaknesses": ["<specific area to improve>", "<another specific weakness>"],
  "detailedFeedback": "<2-3 paragraph analysis referencing specific things the candidate said>",
  "hiringRecommendation": "<Strong Hire / Hire / No Hire>",
  "answers": [
    { "exchange": <number of the exchange above>, "note": "<one or two sentences: what was strong or missing in this answer, and what a stronger answer would have added>" }
  ]
}

In "answers", include one entry for every exchange where the interviewer asked an interview question. Leave out greetings, small talk and the closing.`;

  const { value, usage } = await callAIForJson(prompt, 'Generate Feedback', MAX_TOKENS.feedback);
  const feedback = {
    totalScore: toScore(value?.totalScore),
    interviewScore: toScore(value?.interviewScore),
    codingScore: toScore(value?.codingScore),
    strengths: toStringList(value?.strengths),
    weaknesses: toStringList(value?.weaknesses),
    detailedFeedback: toText(value?.detailedFeedback),
    hiringRecommendation: toText(value?.hiringRecommendation) || 'No Hire',
    // Per-answer notes, keyed by the exchange number used in the prompt
    answerNotes: (Array.isArray(value?.answers) ? value.answers : [])
      .map((answer) => ({ exchange: Math.round(Number(answer?.exchange)), note: toText(answer?.note).trim() }))
      .filter((answer) => Number.isInteger(answer.exchange) && answer.exchange >= 1 && answer.exchange <= pairs.length && answer.note),
  };
  return { feedback, usage };
}

module.exports = {
  LEVELS,
  interviewGreeting,
  interviewTurnNote,
  generateInterviewReply,
  generateCodingChallenge,
  evaluateCode,
  generateFeedback,
};

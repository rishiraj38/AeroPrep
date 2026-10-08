// The live interview, coding round and feedback for one interview. All state lives in the
// database, so a page refresh or reconnect picks up exactly where the candidate left off,
// and every model call is made here, against the stored transcript, within the caps in limits.js.

const { AppError } = require('./appError');
const { extractTextFromPdf } = require('./pdfService');
const {
  interviewGreeting,
  interviewTurnNote,
  generateInterviewReply,
  generateCodingChallenge,
  evaluateCode,
  generateFeedback
} = require('./aiService');
const {
  assertCanStartInterview,
  loadSession,
  appendMessage,
  deleteMessage,
  markStarted,
  saveResumeText,
  addUsage,
  endInterview,
  saveChallenge,
  saveRun,
  saveUnevaluatedCode,
  markCodingSkipped,
  saveFeedback
} = require('./interviewService');
const {
  INTERVIEW_MINUTES,
  MAX_ANSWERS,
  MAX_ANSWER_CHARS,
  MAX_CODE_RUNS,
  MAX_CODE_CHARS,
  RESUME_STORE_CHARS
} = require('./limits');

const DURATION_MS = INTERVIEW_MINUTES * 60 * 1000;
// A candidate who comes back this long after time ran out finds the interview closed
const REJOIN_GRACE_MS = 2 * 60 * 1000;
// Fewer answers than this (the first one is small talk) is not enough to assess
const MIN_ANSWERS_FOR_FEEDBACK = 2;

const locks = new Map();     // interviewId -> tail of that interview's promise chain
const answering = new Set(); // interviewIds with a reply being generated

// Runs one operation per interview at a time, so a refresh, a double click or a second tab
// can never trigger a duplicate model call or read a half-written turn.
function withInterviewLock(interviewId, task) {
  const key = Number(interviewId);
  const run = (locks.get(key) || Promise.resolve()).then(task);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
}

function countAnswers(interview) {
  return interview.messages.filter((m) => m.speaker === 'user').length;
}

// What the client needs to draw the interview room
function buildState(interview) {
  const active = !interview.endedAt;
  return {
    interviewId: interview.id,
    status: active ? 'active' : 'ended',
    transcript: interview.messages.map(({ speaker, text }) => ({ speaker, text })),
    durationSecs: DURATION_MS / 1000,
    // null until the candidate's first answer starts the clock; negative once time has run out
    secondsLeft: active && interview.startedAt
      ? Math.round((interview.startedAt.getTime() + DURATION_MS - Date.now()) / 1000)
      : null,
    answersUsed: countAnswers(interview),
    maxAnswers: MAX_ANSWERS,
    maxAnswerChars: MAX_ANSWER_CHARS,
    hasFeedback: !!interview.feedback
  };
}

// Interviews created before resume text was stored only have the PDF URL
async function ensureResumeText(interview) {
  if (interview.resumeText || !interview.resumeURL || !interview.resumeURL.startsWith('http')) {
    return interview.resumeText || '';
  }
  try {
    const text = (await extractTextFromPdf(interview.resumeURL)).slice(0, RESUME_STORE_CHARS);
    await saveResumeText(interview.id, text);
    return text;
  } catch (error) {
    console.warn(`[Interview ${interview.id}] Could not read the resume PDF: ${error.message}`);
    return '';
  }
}

/**
 * Enter (or re-enter) the interview room. Costs no tokens: the greeting is fixed text and an
 * interview that is already under way is returned as it stands.
 */
async function joinInterview(interviewId, userId) {
  return withInterviewLock(interviewId, async () => {
    let interview = await loadSession(interviewId, userId);
    if (interview.endedAt) return buildState(interview);

    const last = interview.messages[interview.messages.length - 1];
    const expired = interview.startedAt
      && Date.now() > interview.startedAt.getTime() + DURATION_MS + REJOIN_GRACE_MS;

    if (!last) {
      await appendMessage(interview.id, 'ai', interviewGreeting(interview.user.name));
    } else if (last.speaker === 'user') {
      // The server stopped before this answer got a reply; drop it so the candidate can answer again
      await deleteMessage(last.id);
    }
    if (expired) await endInterview(interview.id);

    interview = await loadSession(interviewId, userId);
    return buildState(interview);
  });
}

/**
 * Record the candidate's answer and generate the interviewer's reply: exactly one model call.
 */
async function submitAnswer(interviewId, userId, rawText) {
  const key = Number(interviewId);
  const text = String(rawText || '').trim().slice(0, MAX_ANSWER_CHARS);
  if (!text) throw new AppError(400, 'EMPTY_ANSWER', 'Your answer is empty.');
  if (answering.has(key)) {
    throw new AppError(409, 'BUSY', 'Alex is still replying to your last answer.');
  }

  answering.add(key);
  try {
    return await withInterviewLock(interviewId, async () => {
      const interview = await loadSession(interviewId, userId);
      if (interview.endedAt) {
        throw new AppError(409, 'INTERVIEW_ENDED', 'This interview has already ended.');
      }
      const last = interview.messages[interview.messages.length - 1];
      if (!last || last.speaker !== 'ai') {
        throw new AppError(409, 'NOT_YOUR_TURN', 'Wait for the interviewer before answering.');
      }

      // The first answer starts the clock and uses up one of the user's interviews
      const firstAnswer = !interview.startedAt;
      if (firstAnswer) await assertCanStartInterview(userId);
      const startedAt = interview.startedAt || new Date();

      const answerNumber = countAnswers(interview) + 1;
      const msLeft = startedAt.getTime() + DURATION_MS - Date.now();
      const final = answerNumber >= MAX_ANSWERS || msLeft <= 0;

      const resumeText = await ensureResumeText(interview);
      const answer = await appendMessage(interview.id, 'user', text);

      let reply;
      try {
        reply = await generateInterviewReply({
          resumeText,
          jobDescription: interview.jobDescription,
          history: [...interview.messages, answer],
          turnNote: interviewTurnNote({
            answerNumber,
            maxAnswers: MAX_ANSWERS,
            minutesLeft: Math.max(0, Math.round(msLeft / 60000)),
            final
          })
        });
      } catch {
        // Leave the transcript as it was so the same answer can simply be sent again
        await deleteMessage(answer.id);
        throw new AppError(502, 'AI_UNAVAILABLE', 'The interviewer could not reply. Please send your answer again.');
      }

      await appendMessage(interview.id, 'ai', reply.text);
      await addUsage(interview.id, reply.usage);
      if (firstAnswer) await markStarted(interview.id, startedAt);
      if (final || reply.ended) await endInterview(interview.id);

      return buildState(await loadSession(interviewId, userId));
    });
  } finally {
    answering.delete(key);
  }
}

/**
 * End the conversation (the candidate hung up, or ran out of time without answering).
 */
async function finishInterview(interviewId, userId) {
  return withInterviewLock(interviewId, async () => {
    let interview = await loadSession(interviewId, userId);
    if (!interview.endedAt) {
      await endInterview(interview.id);
      interview = await loadSession(interviewId, userId);
    }
    return buildState(interview);
  });
}

// ─── Coding round ─────────────────────────────────────────────────────────────

function hasProblem(challenge) {
  return !!challenge && !!challenge.problemStatement;
}

function toChallengeView(challenge) {
  return {
    title: challenge.title,
    description: challenge.description,
    problemStatement: challenge.problemStatement,
    constraints: challenge.constraints,
    language: challenge.language,
    starterCode: challenge.starterCode,
    testCases: challenge.testCases || [],
    userCode: challenge.userCode,
    result: challenge.result,
    runsLeft: Math.max(0, MAX_CODE_RUNS - challenge.runs)
  };
}

function assertCodingOpen(interview) {
  if (interview.feedback) {
    throw new AppError(409, 'INTERVIEW_COMPLETED', 'This interview already has its feedback.');
  }
}

/**
 * The interview's coding challenge. Generated once and stored, so reloading the page
 * shows the same problem instead of paying for a new one.
 */
async function getOrCreateChallenge(interviewId, userId) {
  return withInterviewLock(interviewId, async () => {
    const interview = await loadSession(interviewId, userId);
    assertCodingOpen(interview);
    if (hasProblem(interview.codingChallenge)) return toChallengeView(interview.codingChallenge);

    let generated;
    try {
      generated = await generateCodingChallenge((await ensureResumeText(interview)) || interview.jobDescription);
    } catch {
      throw new AppError(502, 'AI_UNAVAILABLE', 'Could not generate a coding challenge. Please try again.');
    }
    await addUsage(interview.id, generated.usage);
    return toChallengeView(await saveChallenge(interview.id, generated.challenge));
  });
}

/**
 * Evaluate the candidate's code. Each evaluation is a model call, so they are capped per
 * challenge, and re-running unchanged code returns the stored result for free.
 */
async function runCode(interviewId, userId, { code, language }) {
  const source = String(code || '');
  const lang = String(language || '').slice(0, 30);
  if (!source.trim()) throw new AppError(400, 'EMPTY_CODE', 'Write some code before running it.');
  if (source.length > MAX_CODE_CHARS) {
    throw new AppError(413, 'CODE_TOO_LONG', `Your code is longer than ${MAX_CODE_CHARS} characters.`);
  }

  return withInterviewLock(interviewId, async () => {
    const interview = await loadSession(interviewId, userId);
    assertCodingOpen(interview);
    const challenge = interview.codingChallenge;
    if (!hasProblem(challenge)) throw new AppError(404, 'NO_CHALLENGE', 'No coding challenge found.');

    if (challenge.result && challenge.userCode === source && challenge.result.language === lang) {
      return toChallengeView(challenge);
    }
    if (challenge.runs >= MAX_CODE_RUNS) {
      throw new AppError(429, 'RUN_LIMIT_REACHED', `You have used all ${MAX_CODE_RUNS} runs for this challenge.`);
    }

    let evaluated;
    try {
      evaluated = await evaluateCode(source, lang || challenge.language, challenge);
    } catch {
      throw new AppError(502, 'AI_UNAVAILABLE', 'Could not evaluate your code. Please try again.');
    }
    await addUsage(interview.id, evaluated.usage);
    return toChallengeView(await saveRun(interview.id, source, { ...evaluated.result, language: lang }));
  });
}

/**
 * Finish the coding round with whatever is in the editor.
 */
async function submitCode(interviewId, userId, { code }) {
  const source = String(code || '').slice(0, MAX_CODE_CHARS);

  return withInterviewLock(interviewId, async () => {
    const interview = await loadSession(interviewId, userId);
    assertCodingOpen(interview);
    const challenge = interview.codingChallenge;
    if (!hasProblem(challenge)) throw new AppError(404, 'NO_CHALLENGE', 'No coding challenge found.');

    // Code that was already evaluated keeps its result; anything else is stored as unevaluated
    if (challenge.result && challenge.userCode === source) return toChallengeView(challenge);
    return toChallengeView(await saveUnevaluatedCode(interview.id, source));
  });
}

async function skipCoding(interviewId, userId) {
  return withInterviewLock(interviewId, async () => {
    const interview = await loadSession(interviewId, userId);
    assertCodingOpen(interview);
    await markCodingSkipped(interview.id);
    return { skipped: true };
  });
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

const TOO_SHORT_FEEDBACK = {
  totalScore: 0,
  interviewScore: 0,
  codingScore: 0,
  strengths: [],
  weaknesses: ['The interview ended before any interview question was answered.'],
  detailedFeedback: 'There is nothing to assess yet: the interview ended before you answered an interview question. Start a new interview and answer at least one question to get a full report.',
  hiringRecommendation: 'Not assessed'
};

/**
 * The interview's feedback report. Generated once from the stored transcript and coding
 * round, then served from the database, so the scores cannot be set by the client and
 * reloading the page never pays for a second analysis.
 */
async function getOrCreateFeedback(interviewId, userId) {
  return withInterviewLock(interviewId, async () => {
    const interview = await loadSession(interviewId, userId);
    if (interview.feedback) return interview.feedback;
    if (!interview.endedAt) {
      throw new AppError(409, 'INTERVIEW_IN_PROGRESS', 'Finish the interview before asking for feedback.');
    }

    if (countAnswers(interview) < MIN_ANSWERS_FOR_FEEDBACK) {
      return saveFeedback(interview.id, TOO_SHORT_FEEDBACK);
    }

    const challenge = interview.codingChallenge;
    const coding = hasProblem(challenge) && !challenge.skipped && challenge.userCode
      ? {
          title: challenge.title,
          code: challenge.userCode,
          result: { passed: challenge.passed, feedback: challenge.aiFeedback }
        }
      : null;

    let generated;
    try {
      generated = await generateFeedback(interview.messages, coding);
    } catch {
      throw new AppError(502, 'AI_UNAVAILABLE', 'Could not analyse the interview. Please try again.');
    }
    await addUsage(interview.id, generated.usage);
    return saveFeedback(interview.id, generated.feedback);
  });
}

module.exports = {
  joinInterview,
  submitAnswer,
  finishInterview,
  getOrCreateChallenge,
  runCode,
  submitCode,
  skipCoding,
  getOrCreateFeedback
};

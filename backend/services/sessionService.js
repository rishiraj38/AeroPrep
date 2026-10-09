// The live interview, coding round and feedback for one interview. All state lives in the
// database, so a page refresh or reconnect picks up exactly where the candidate left off,
// and every model call is made here, against the stored transcript, within the caps in limits.js.

const { AppError } = require('./appError');
const { stripControl, cleanCandidateText } = require('./text');
const { extractTextFromPdf } = require('./pdfService');
const { speakingStats } = require('./speakingStats');
const { voiceEnabled } = require('./voiceService');
const {
  interviewGreeting,
  interviewTurnNote,
  generateInterviewReply,
  generateCodingChallenge,
  evaluateCode,
  generateFeedback
} = require('./aiService');
const {
  toInterviewId,
  loadSession,
  appendMessage,
  deleteMessage,
  startInterview,
  unstartInterview,
  saveResumeText,
  addUsage,
  countFailedCall,
  endInterview,
  saveChallenge,
  saveRun,
  saveUnevaluatedCode,
  markCodingSkipped,
  saveFeedback,
  listQuestions,
  listMessages
} = require('./interviewService');
const {
  INTERVIEW_MINUTES,
  MAX_ANSWERS,
  MAX_ANSWER_CHARS,
  MAX_CODE_RUNS,
  MAX_CODE_CHARS,
  MAX_FAILED_CALLS,
  RESUME_STORE_CHARS,
  SUPPORT_EMAIL
} = require('./limits');

const DURATION_MS = INTERVIEW_MINUTES * 60 * 1000;
// A candidate who comes back this long after time ran out finds the interview closed
const REJOIN_GRACE_MS = 2 * 60 * 1000;
// Fewer answers than this (the first one is small talk) is not enough to assess
const MIN_ANSWERS_FOR_FEEDBACK = 2;

const locks = new Map();     // interviewId -> tail of that interview's promise chain
const answering = new Set(); // "userId:interviewId" for each reply being generated

// Runs one operation per interview at a time, so a refresh, a double click or a second tab
// can never trigger a duplicate model call or read a half-written turn.
function withInterviewLock(interviewId, task) {
  const key = toInterviewId(interviewId);
  const run = (locks.get(key) || Promise.resolve()).then(task);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
}

// An interview whose model calls keep failing stops making them. Without this, a call that
// fails after being paid for could be asked for again and again and never count against anything.
function assertCallsAllowed(interview) {
  if (interview.failedCalls >= MAX_FAILED_CALLS) {
    throw new AppError(429, 'TOO_MANY_FAILURES', `This interview has run into too many errors to go on. Please start a new one, or write to ${SUPPORT_EMAIL} if it keeps happening.`);
  }
}

// Records a model call that failed. `billed: false` marks the ones the provider did not charge
// for (it was down, or turned the request away); every other failure may have been paid for and
// counts towards the interview's cap.
async function recordFailedCall(interview, error) {
  if (error?.billed === false) return;
  await countFailedCall(interview.id, error?.usage);
}

// Runs a model operation for an interview and stores its result (`work` does both). Used for
// the coding challenge, code checks and the report: everything except the live replies.
async function paidOperation(interview, failureMessage, work) {
  assertCallsAllowed(interview);
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error(`[Interview ${interview.id}] ${failureMessage} (${error.message})`);
    await recordFailedCall(interview, error);
    throw new AppError(502, 'AI_UNAVAILABLE', failureMessage);
  }
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
    // Whether the server can supply the interviewer's voice (otherwise the browser's is used)
    naturalVoice: voiceEnabled,
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
// Timings measured by the browser. They only feed the candidate's own speaking figures, so
// they are tidied rather than trusted: whole milliseconds, never more than the interview lasts.
function cleanTimings(raw) {
  const ms = (value) => (Number.isFinite(value) && value >= 0 ? Math.min(Math.round(value), DURATION_MS) : null);
  return {
    thinkMs: ms(raw?.thinkMs),
    spokenMs: ms(raw?.spokenMs),
    typed: typeof raw?.typed === 'boolean' ? raw.typed : null
  };
}

async function submitAnswer(interviewId, userId, rawText, onReplyChunk, rawTimings) {
  // Keyed by user as well, so that someone guessing another person's interview number
  // cannot make that person's own answer bounce as "busy"
  const key = `${userId}:${toInterviewId(interviewId)}`;
  const text = cleanCandidateText(rawText).trim().slice(0, MAX_ANSWER_CHARS);
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
      if (interview.failedCalls >= MAX_FAILED_CALLS) {
        // Close it, so it is not offered as an interview to come back to
        await endInterview(interview.id);
        assertCallsAllowed(interview);
      }

      // The first answer starts the clock and uses up one of the user's interviews
      const firstAnswer = !interview.startedAt;
      const startedAt = interview.startedAt || await startInterview(interview.id, userId);
      const giveBack = async () => {
        if (firstAnswer) await unstartInterview(interview.id);
      };

      const answerNumber = countAnswers(interview) + 1;
      const msLeft = startedAt.getTime() + DURATION_MS - Date.now();
      const final = answerNumber >= MAX_ANSWERS || msLeft <= 0;

      let resumeText;
      let answer;
      try {
        resumeText = await ensureResumeText(interview);
        answer = await appendMessage(interview.id, 'user', text, cleanTimings(rawTimings));
      } catch (error) {
        // Nothing was stored and nothing was spent, so the interview is not used up either
        await giveBack().catch(() => {});
        throw error;
      }

      let reply;
      try {
        reply = await generateInterviewReply({
          resumeText,
          jobDescription: interview.jobDescription,
          level: interview.level,
          history: [...interview.messages, answer],
          // Each finished sentence goes to the candidate straight away, so the interviewer
          // starts talking before the whole reply has been generated
          onSentence: onReplyChunk,
          final,
          turnNote: interviewTurnNote({
            answerNumber,
            maxAnswers: MAX_ANSWERS,
            minutesLeft: Math.max(0, Math.round(msLeft / 60000)),
            final
          })
        });
      } catch (error) {
        // Nothing was said, so the answer is taken back and can simply be sent again
        await deleteMessage(answer.id);
        if (error.billed === false) {
          // Nothing was spent either: the interview is handed back as if this had not happened
          await giveBack();
        } else {
          // The call may have been paid for (it timed out, say), so it counts and the interview
          // stays started. Otherwise failing answers would be a way to spend without limit.
          await recordFailedCall(interview, error);
        }
        throw new AppError(502, 'AI_UNAVAILABLE', 'The interviewer could not reply. Please send your answer again.');
      }

      await appendMessage(interview.id, 'ai', reply.text);
      await addUsage(interview.id, reply.usage);
      if (reply.ended) await endInterview(interview.id);

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

// The coding round belongs to an interview that was actually held: started (so it counts
// against the user's allowance) and finished. Otherwise creating interviews and going straight
// to the coding round would be a way to spend model calls without ever using one up.
function assertCodingOpen(interview) {
  if (interview.feedback) {
    throw new AppError(409, 'INTERVIEW_COMPLETED', 'This interview already has its feedback.');
  }
  if (!interview.startedAt) {
    throw new AppError(409, 'INTERVIEW_NOT_HELD', 'Answer at least one interview question before the coding round.');
  }
  if (!interview.endedAt) {
    throw new AppError(409, 'INTERVIEW_IN_PROGRESS', 'Finish the interview before the coding round.');
  }
  // The first answer is only the reply to the greeting. With fewer than two the report has
  // nothing to assess, so a coding round would be paid for and then left out of it.
  if (countAnswers(interview) < MIN_ANSWERS_FOR_FEEDBACK) {
    throw new AppError(409, 'INTERVIEW_NOT_HELD', 'Answer at least one interview question before the coding round.');
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

    return paidOperation(interview, 'Could not generate a coding challenge. Please try again.', async () => {
      const generated = await generateCodingChallenge((await ensureResumeText(interview)) || interview.jobDescription, interview.level);
      await addUsage(interview.id, generated.usage);
      return toChallengeView(await saveChallenge(interview.id, generated.challenge));
    });
  });
}

/**
 * Evaluate the candidate's code. Each evaluation is a model call, so they are capped per
 * challenge, and re-running unchanged code returns the stored result for free.
 */
async function runCode(interviewId, userId, { code, language }) {
  const source = stripControl(code);
  const lang = stripControl(language).slice(0, 30);
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

    return paidOperation(interview, 'Could not evaluate your code. Please try again.', async () => {
      const evaluated = await evaluateCode(source, lang || challenge.language, challenge);
      await addUsage(interview.id, evaluated.usage);
      return toChallengeView(await saveRun(interview.id, source, { ...evaluated.result, language: lang }));
    });
  });
}

/**
 * Finish the coding round with whatever is in the editor.
 */
async function submitCode(interviewId, userId, { code }) {
  const source = stripControl(code).slice(0, MAX_CODE_CHARS);

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

/**
 * Leave the coding round out of the report. Code that was already written is only set aside
 * when `discard` says so (the Skip button beside the editor); the plain form, used when the
 * round is declined before it starts, never throws away work that was handed in earlier.
 */
async function skipCoding(interviewId, userId, { discard = false } = {}) {
  return withInterviewLock(interviewId, async () => {
    const interview = await loadSession(interviewId, userId);
    if (interview.feedback) {
      throw new AppError(409, 'INTERVIEW_COMPLETED', 'This interview already has its feedback.');
    }
    const challenge = interview.codingChallenge;
    if (!discard && hasProblem(challenge) && challenge.userCode && !challenge.skipped) {
      return { skipped: false };
    }
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
// The report plus the interview's questions, each with the note written about its answer,
// and the figures on how the candidate spoke
async function withQuestions(feedback) {
  const [questions, messages] = await Promise.all([listQuestions(feedback.interviewId), listMessages(feedback.interviewId)]);
  return { feedback, questions, speaking: speakingStats(messages) };
}

async function getOrCreateFeedback(interviewId, userId) {
  return withInterviewLock(interviewId, async () => {
    const interview = await loadSession(interviewId, userId);
    if (interview.feedback) return withQuestions(interview.feedback);
    if (!interview.endedAt) {
      throw new AppError(409, 'INTERVIEW_IN_PROGRESS', 'Finish the interview before asking for feedback.');
    }

    if (countAnswers(interview) < MIN_ANSWERS_FOR_FEEDBACK) {
      return withQuestions(await saveFeedback(interview.id, TOO_SHORT_FEEDBACK));
    }

    const challenge = interview.codingChallenge;
    const coding = hasProblem(challenge) && !challenge.skipped && challenge.userCode
      ? {
          title: challenge.title,
          code: challenge.userCode,
          result: { passed: challenge.passed, feedback: challenge.aiFeedback }
        }
      : null;

    return paidOperation(interview, 'Could not analyse the interview. Please try again.', async () => {
      const generated = await generateFeedback(interview.messages, coding);
      await addUsage(interview.id, generated.usage);
      return withQuestions(await saveFeedback(interview.id, generated.feedback));
    });
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

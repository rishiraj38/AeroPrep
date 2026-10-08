const { Prisma } = require('@prisma/client');
const { prisma } = require('./prismaClient');
const { AppError } = require('./appError');
const { FREE_INTERVIEW_LIMIT, DAILY_INTERVIEW_LIMIT, SUPPORT_EMAIL } = require('./limits');

// Accepts 5 or "5". Rejects "5.0", "0x10", " 5 " and anything else that only looks like a number.
function toInterviewId(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : NaN;
  return typeof value === 'string' && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : NaN;
}

function startOfToday() {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

// How many interviews the user has started, and how many they are allowed
async function getQuota(userId) {
  const [user, used] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { interviewLimit: true } }),
    prisma.interview.count({ where: { userId, startedAt: { not: null } } })
  ]);

  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'User not found');

  const limit = user.interviewLimit ?? FREE_INTERVIEW_LIMIT;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

// Throws once the user has used up their interviews. A quick check for creating an interview;
// the binding one is startInterview, made when the first answer arrives.
async function assertCanStartInterview(userId) {
  const quota = await getQuota(userId);
  if (quota.remaining <= 0) {
    throw new AppError(403, 'INTERVIEW_LIMIT_REACHED', `You have used all ${quota.limit} of your free interviews. Email ${SUPPORT_EMAIL} to get more.`);
  }

  // Site-wide ceiling for the day, so no burst of sign-ups can run up an unbounded model bill
  const startedToday = await prisma.interview.count({ where: { startedAt: { gte: startOfToday() } } });
  if (startedToday >= DAILY_INTERVIEW_LIMIT) {
    throw new AppError(503, 'DAILY_CAPACITY_REACHED', 'AeroPrep has reached its interview capacity for today. Please come back tomorrow.');
  }
  return quota;
}

// The user's started-but-unfinished interview, if any, so the UI can offer to resume it
async function getActiveInterview(userId) {
  return prisma.interview.findFirst({
    where: { userId, startedAt: { not: null }, endedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true }
  });
}

// Create a new interview
async function createInterview(userId, { resumeURL, resumeText, jobDescription, level }) {
  return prisma.interview.create({
    data: {
      userId,
      resumeURL,
      resumeText,
      jobDescription,
      level,
      status: 'in_progress'
    },
    select: { id: true, status: true, createdAt: true }
  });
}

// Everything the live session, coding round and feedback need; throws unless the user owns it
async function loadSession(interviewId, userId) {
  const id = toInterviewId(interviewId);
  if (Number.isNaN(id) || !userId) throw new AppError(404, 'NOT_FOUND', 'Interview not found');

  const interview = await prisma.interview.findFirst({
    where: { id, userId },
    include: {
      user: { select: { name: true } },
      messages: { orderBy: { id: 'asc' } },
      codingChallenge: true,
      feedback: true
    }
  });

  if (!interview) throw new AppError(404, 'NOT_FOUND', 'Interview not found');
  return interview;
}

async function appendMessage(interviewId, speaker, text) {
  return prisma.message.create({ data: { interviewId, speaker, text } });
}

async function deleteMessage(messageId) {
  await prisma.message.delete({ where: { id: messageId } });
}

// Marks the interview as started, in one transaction with the limit checks. The user's row is
// locked first, so first answers sent to several interviews at the same moment are judged one
// at a time and cannot all slip under the allowance.
async function startInterview(interviewId, userId) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`SELECT "interviewLimit" FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (locked.length === 0) throw new AppError(401, 'UNAUTHENTICATED', 'User not found');

    const limit = locked[0].interviewLimit ?? FREE_INTERVIEW_LIMIT;
    const used = await tx.interview.count({ where: { userId, startedAt: { not: null } } });
    if (used >= limit) {
      throw new AppError(403, 'INTERVIEW_LIMIT_REACHED', `You have used all ${limit} of your free interviews. Email ${SUPPORT_EMAIL} to get more.`);
    }

    const startedToday = await tx.interview.count({ where: { startedAt: { gte: startOfToday() } } });
    if (startedToday >= DAILY_INTERVIEW_LIMIT) {
      throw new AppError(503, 'DAILY_CAPACITY_REACHED', 'AeroPrep has reached its interview capacity for today. Please come back tomorrow.');
    }

    const startedAt = new Date();
    await tx.interview.update({ where: { id: interviewId }, data: { startedAt } });
    return startedAt;
  });
}

// Undo startInterview when the first answer never got a reply, so it does not use up an interview
async function unstartInterview(interviewId) {
  await prisma.interview.update({ where: { id: interviewId }, data: { startedAt: null } });
}

async function ownsInterview(interviewId, userId) {
  const id = toInterviewId(interviewId);
  if (Number.isNaN(id)) return false;
  return !!(await prisma.interview.findFirst({ where: { id, userId }, select: { id: true } }));
}

async function saveResumeText(interviewId, resumeText) {
  await prisma.interview.update({ where: { id: interviewId }, data: { resumeText } });
}

// Add one model call's token usage to the interview's running total
async function addUsage(interviewId, usage) {
  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      inputTokens: { increment: usage.inputTokens },
      outputTokens: { increment: usage.outputTokens }
    }
  });
}

// Close the conversation and rebuild the Q&A rows shown in history from the transcript
async function endInterview(interviewId) {
  const messages = await prisma.message.findMany({ where: { interviewId }, orderBy: { id: 'asc' } });

  const questions = [];
  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].speaker === 'ai' && messages[i + 1].speaker === 'user') {
      questions.push({
        interviewId,
        questionText: messages[i].text,
        expectedAnswer: 'Evaluated dynamically by AI based on conversation.',
        userAnswer: messages[i + 1].text,
        order: questions.length + 1
      });
    }
  }

  await prisma.$transaction([
    prisma.question.deleteMany({ where: { interviewId } }),
    prisma.question.createMany({ data: questions }),
    prisma.interview.update({ where: { id: interviewId }, data: { endedAt: new Date() } })
  ]);
}

// Store a freshly generated coding challenge
async function saveChallenge(interviewId, challenge) {
  const data = {
    title: challenge.title,
    description: challenge.description,
    problemStatement: challenge.problemStatement,
    constraints: challenge.constraints,
    language: challenge.language,
    starterCode: challenge.starterCode,
    testCases: challenge.testCases,
    skipped: false
  };

  return prisma.codingChallenge.upsert({
    where: { interviewId },
    update: data,
    create: { interviewId, ...data }
  });
}

// Record an evaluated run of the candidate's code
async function saveRun(interviewId, code, result) {
  return prisma.codingChallenge.update({
    where: { interviewId },
    data: {
      userCode: code,
      passed: result.passed,
      aiFeedback: result.feedback,
      result,
      runs: { increment: 1 },
      skipped: false
    }
  });
}

// Store the code the candidate finished with, when it was never evaluated in that form
async function saveUnevaluatedCode(interviewId, code) {
  return prisma.codingChallenge.update({
    where: { interviewId },
    data: {
      userCode: code,
      passed: false,
      aiFeedback: 'Submitted without being evaluated.',
      result: Prisma.DbNull,
      skipped: false
    }
  });
}

async function markCodingSkipped(interviewId) {
  return prisma.codingChallenge.upsert({
    where: { interviewId },
    update: { skipped: true },
    create: {
      interviewId,
      title: 'Skipped',
      description: '',
      problemStatement: '',
      language: 'javascript',
      skipped: true
    }
  });
}

// Save final feedback
async function saveFeedback(interviewId, feedback) {
  // Update interview status to completed
  await prisma.interview.update({
    where: { id: interviewId },
    data: { status: 'completed' }
  });

  const data = {
    totalScore: feedback.totalScore,
    interviewScore: feedback.interviewScore,
    codingScore: feedback.codingScore,
    strengths: feedback.strengths,
    weaknesses: feedback.weaknesses,
    detailedFeedback: feedback.detailedFeedback,
    recommendation: feedback.hiringRecommendation
  };

  // The note on each answer goes on its Q&A row; exchange N in the report is the Nth row
  for (const { exchange, note } of feedback.answerNotes || []) {
    await prisma.question.updateMany({ where: { interviewId, order: exchange }, data: { feedback: note } });
  }

  return prisma.feedback.upsert({
    where: { interviewId },
    update: data,
    create: { interviewId, ...data }
  });
}

// The interview's questions and answers with the report's note on each
async function listQuestions(interviewId) {
  return prisma.question.findMany({
    where: { interviewId },
    orderBy: { order: 'asc' },
    select: { order: true, questionText: true, userAnswer: true, feedback: true }
  });
}

// What a user thought of the product, left after an interview
async function saveAppFeedback(userId, { interviewId, rating, message }) {
  return prisma.appFeedback.create({
    data: { userId, interviewId, rating, message },
    include: { user: { select: { name: true, email: true } } }
  });
}

// Get all interviews for a user
async function getUserInterviews(userId) {
  const interviews = await prisma.interview.findMany({
    where: { userId },
    select: {
      id: true,
      jobDescription: true,
      status: true,
      startedAt: true,
      endedAt: true,
      createdAt: true,
      feedback: true,
      _count: {
        select: { questions: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return interviews;
}

// Get single interview with full details
async function getInterviewById(interviewId, userId) {
  const interview = await prisma.interview.findFirst({
    where: {
      id: interviewId,
      userId // Ensure user owns this interview
    },
    select: {
      id: true,
      resumeURL: true,
      jobDescription: true,
      status: true,
      startedAt: true,
      endedAt: true,
      createdAt: true,
      questions: {
        orderBy: { order: 'asc' }
      },
      codingChallenge: true,
      feedback: true
    }
  });

  if (!interview) {
    throw new AppError(404, 'NOT_FOUND', 'Interview not found');
  }

  return interview;
}

module.exports = {
  toInterviewId,
  listQuestions,
  saveAppFeedback,
  getQuota,
  assertCanStartInterview,
  getActiveInterview,
  createInterview,
  loadSession,
  appendMessage,
  deleteMessage,
  startInterview,
  unstartInterview,
  ownsInterview,
  saveResumeText,
  addUsage,
  endInterview,
  saveChallenge,
  saveRun,
  saveUnevaluatedCode,
  markCodingSkipped,
  saveFeedback,
  getUserInterviews,
  getInterviewById
};

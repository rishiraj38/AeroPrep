const { prisma } = require('./prismaClient');

// Create a new interview with optional questions
async function createInterview(userId, resumeURL, jobDescription, questions = []) {
  const interview = await prisma.interview.create({
    data: {
      userId,
      resumeURL,
      jobDescription,
      status: 'in_progress',
      // Only create questions if array is non-empty
      ...(questions.length > 0 && {
        questions: {
          create: questions.map((q, index) => ({
            questionText: q.question,
            expectedAnswer: q.answer || q.expectedAnswer || '',
            order: index + 1
          }))
        }
      })
    },
    include: {
      questions: true
    }
  });
  
  return interview;
}

// Add a single question to an existing interview (for dynamic flow)
async function addQuestionToInterview(interviewId, questionText, expectedAnswer, order) {
  const question = await prisma.question.create({
    data: {
      interviewId,
      questionText,
      expectedAnswer: expectedAnswer || '',
      order
    }
  });
  
  return question;
}

// Save user answers to questions
async function saveAnswers(interviewId, answers) {
  // answers format: [{ questionIndex: 0, answer: "..." }, ...]
  const updatePromises = answers.map(async (ans) => {
    const question = await prisma.question.findFirst({
      where: {
        interviewId,
        order: ans.questionIndex + 1
      }
    });
    
    if (question) {
      return prisma.question.update({
        where: { id: question.id },
        data: { userAnswer: ans.answer }
      });
    }
  });
  
  await Promise.all(updatePromises);
  
  return { success: true };
}

// Save coding challenge and result
async function saveCodingResult(interviewId, challenge, code, result, skipped = false) {
  const codingChallenge = await prisma.codingChallenge.upsert({
    where: { interviewId },
    update: {
      userCode: code,
      passed: result?.passed || false,
      aiFeedback: result?.feedback || '',
      skipped
    },
    create: {
      interviewId,
      title: challenge?.title || 'Skipped',
      description: challenge?.description || '',
      problemStatement: challenge?.problemStatement || '',
      constraints: challenge?.constraints || '',
      language: challenge?.language || 'javascript',
      starterCode: challenge?.starterCode || '',
      testCases: challenge?.testCases || [],
      userCode: code,
      passed: result?.passed || false,
      aiFeedback: result?.feedback || '',
      skipped
    }
  });
  
  return codingChallenge;
}

// Save final feedback
async function saveFeedback(interviewId, feedback) {
  // Update interview status to completed
  await prisma.interview.update({
    where: { id: interviewId },
    data: { status: 'completed' }
  });
  
  const savedFeedback = await prisma.feedback.upsert({
    where: { interviewId },
    update: {
      totalScore: feedback.totalScore || 0,
      interviewScore: feedback.interviewScore || 0,
      codingScore: feedback.codingScore || 0,
      strengths: feedback.strengths || [],
      weaknesses: feedback.weaknesses || [],
      detailedFeedback: feedback.detailedFeedback || '',
      recommendation: feedback.hiringRecommendation || feedback.recommendation || ''
    },
    create: {
      interviewId,
      totalScore: feedback.totalScore || 0,
      interviewScore: feedback.interviewScore || 0,
      codingScore: feedback.codingScore || 0,
      strengths: feedback.strengths || [],
      weaknesses: feedback.weaknesses || [],
      detailedFeedback: feedback.detailedFeedback || '',
      recommendation: feedback.hiringRecommendation || feedback.recommendation || ''
    }
  });
  
  return savedFeedback;
}

// Get all interviews for a user
async function getUserInterviews(userId) {
  const interviews = await prisma.interview.findMany({
    where: { userId },
    include: {
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
    include: {
      questions: {
        orderBy: { order: 'asc' }
      },
      codingChallenge: true,
      feedback: true
    }
  });
  
  if (!interview) {
    throw new Error('Interview not found');
  }
  
  return interview;
}

module.exports = {
  createInterview,
  addQuestionToInterview,
  saveAnswers,
  saveCodingResult,
  saveFeedback,
  getUserInterviews,
  getInterviewById
};

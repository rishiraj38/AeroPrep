const { prisma } = require('./prismaClient');

// Create a new interview with questions
async function createInterview(userId, resumeURL, jobDescription, questions) {
  const interview = await prisma.interview.create({
    data: {
      userId,
      resumeURL,
      jobDescription,
      status: 'in_progress',
      questions: {
        create: questions.map((q, index) => ({
          questionText: q.question,
          expectedAnswer: q.answer,
          order: index + 1
        }))
      }
    },
    include: {
      questions: true
    }
  });
  
  return interview;
}

// Save user answers to questions
async function saveAnswers(interviewId, answers) {
  // answers format: [{ questionIndex: 0, dynamicQuestion: "...", dynamicAnswer: "..." }, ...]
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
        data: { 
          questionText: ans.dynamicQuestion,
          expectedAnswer: "Evaluated dynamically by AI based on conversation.",
          userAnswer: ans.dynamicAnswer 
        }
      });
    }
  });
  
  await Promise.all(updatePromises);
  
  // Clean up unused static questions from the database
  await prisma.question.deleteMany({
    where: {
      interviewId,
      order: { gt: answers.length }
    }
  });
  
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
  saveAnswers,
  saveCodingResult,
  saveFeedback,
  getUserInterviews,
  getInterviewById
};

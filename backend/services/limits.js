// Caps that bound how much AI usage one account and one interview can consume.

function positiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  // Interviews a user may start for free (User.interviewLimit overrides it per account)
  FREE_INTERVIEW_LIMIT: positiveInt(process.env.FREE_INTERVIEW_LIMIT, 3),
  // Interview length, counted from the candidate's first answer
  INTERVIEW_MINUTES: positiveInt(process.env.INTERVIEW_MINUTES, 15),
  // Candidate answers per interview; each one costs exactly one model call
  MAX_ANSWERS: positiveInt(process.env.INTERVIEW_MAX_ANSWERS, 12),
  MAX_ANSWER_CHARS: 4000,
  // "Run & Check" evaluations per coding challenge
  MAX_CODE_RUNS: positiveInt(process.env.CODING_MAX_RUNS, 5),
  MAX_CODE_CHARS: 12000,
  // Resume text kept in the database, and how much of it goes into each prompt
  RESUME_STORE_CHARS: 8000,
  RESUME_PROMPT_CHARS: 2000,
  JOB_DESCRIPTION_CHARS: 2000,
};

require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Services
const { extractTextFromPdf } = require('./services/pdfService');
const { generateQuestions, generateCodingChallenge, evaluateCode, generateFeedback } = require('./services/aiService');
const { register, login, authMiddleware, getUserById } = require('./services/authService');
const { 
  createInterview, 
  saveAnswers, 
  saveCodingResult, 
  saveFeedback, 
  getUserInterviews, 
  getInterviewById 
} = require('./services/interviewService');

const app = express();

app.use(cors());
app.use(express.json());

// ============================================
// HEALTH CHECK (for cron job keep-alive)
// ============================================
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'AI Interview Coach API is running', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ============================================
// AUTH ROUTES
// ============================================

app.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  
  try {
    const user = await register(name, email, password);
    res.status(201).json({ user, message: 'Account created successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  try {
    const result = await login(email, password);
    res.json(result);
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ error: error.message });
  }
});

app.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    res.json({ user });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// ============================================
// INTERVIEW ROUTES (Protected)
// ============================================

// Create interview and generate questions
app.post('/interviews', authMiddleware, async (req, res) => {
  const { resumeURL, jobDescription } = req.body;
  
  if (!resumeURL) {
    return res.status(400).json({ error: 'resumeURL is required' });
  }
  
  try {
    console.log(`Creating interview for user ${req.userId}`);
    
    // Extract text and generate questions
    const text = await extractTextFromPdf(resumeURL);
    const questions = await generateQuestions(text, jobDescription);
    
    // Save to database
    const interview = await createInterview(req.userId, resumeURL, jobDescription, questions);
    
    res.status(201).json({ interview, questions });
  } catch (error) {
    console.error('Error creating interview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save user answers
app.put('/interviews/:id/answers', authMiddleware, async (req, res) => {
  const interviewId = parseInt(req.params.id);
  const { answers } = req.body;
  
  try {
    await saveAnswers(interviewId, answers);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving answers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save coding challenge result
app.put('/interviews/:id/coding', authMiddleware, async (req, res) => {
  const interviewId = parseInt(req.params.id);
  const { challenge, code, result, skipped } = req.body;
  
  try {
    await saveCodingResult(interviewId, challenge, code, result, skipped);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving coding result:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save feedback
app.put('/interviews/:id/feedback', authMiddleware, async (req, res) => {
  const interviewId = parseInt(req.params.id);
  const { feedback } = req.body;
  
  try {
    await saveFeedback(interviewId, feedback);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's interview history
app.get('/interviews', authMiddleware, async (req, res) => {
  try {
    const interviews = await getUserInterviews(req.userId);
    res.json({ interviews });
  } catch (error) {
    console.error('Error fetching interviews:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single interview details
app.get('/interviews/:id', authMiddleware, async (req, res) => {
  const interviewId = parseInt(req.params.id);
  
  try {
    const interview = await getInterviewById(interviewId, req.userId);
    res.json({ interview });
  } catch (error) {
    console.error('Error fetching interview:', error);
    res.status(404).json({ error: error.message });
  }
});

// ============================================
// PUBLIC AI ROUTES (for backward compatibility)
// ============================================

app.post('/generate-questions', async (req, res) => {
  const { resumeURL, jobDescription } = req.body;

  if (!resumeURL) {
    return res.status(400).json({ error: 'resumeURL is required' });
  }

  try {
    console.log(`Processing resume from: ${resumeURL}`);
    const text = await extractTextFromPdf(resumeURL);
    console.log('PDF text extracted successfully.');
    
    const questions = await generateQuestions(text, jobDescription);
    console.log('Questions generated successfully.');
    
    res.json({ questions });
  } catch (error) {
    console.error('Error generating interview questions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/generate-coding-question', async (req, res) => {
  const { resumeURL } = req.body;
  
  if (!resumeURL) return res.status(400).json({ error: 'resumeURL is required' });

  try {
    const text = await extractTextFromPdf(resumeURL);
    const challenge = await generateCodingChallenge(text);
    res.json({ challenge });
  } catch (error) {
    console.error('Error generating coding challenge:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/evaluate-code', async (req, res) => {
  const { code, language, problem } = req.body;
  
  if (!code || !problem) return res.status(400).json({ error: 'Code and problem are required' });

  try {
    const result = await evaluateCode(code, language, problem);
    res.json({ result });
  } catch (error) {
    console.error('Error evaluating code:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/generate-feedback', async (req, res) => {
  const { interviewData, codingData } = req.body;
  
  try {
    const feedback = await generateFeedback(interviewData, codingData);
    res.json({ feedback });
  } catch (error) {
    console.error('Error generating feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server Running on port ${PORT}`);
});
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const ImageKit = require("imagekit");
const cors = require('cors');

const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});


// Services
const { extractTextFromPdf } = require('./services/pdfService');
const { generateQuestions, generateDynamicInterviewChat, generateCodingChallenge, evaluateCode, generateFeedback } = require('./services/aiService');
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

// ─── In-Process Metrics ──────────────────────────────────────────────────────
const metrics = {
  startedAt:      Date.now(),
  requests:       { total: 0, errors: 0 },
  ai:             { calls: 0, errors: 0, totalMs: 0, latencies: [] },
  websocket:      { connected: 0, peak: 0, totalSessions: 0 },
  interviews:     { created: 0, finished: 0 },
};

// Track incoming HTTP requests
app.use((req, res, next) => {
  metrics.requests.total++;
  const start = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 500) metrics.requests.errors++;
    // Track AI endpoint latency
    if (req.path.includes('generate') || req.path.includes('feedback')) {
      const ms = Date.now() - start;
      metrics.ai.totalMs += ms;
      metrics.ai.latencies.push(ms);
      if (metrics.ai.latencies.length > 100) metrics.ai.latencies.shift(); // keep last 100
    }
  });
  next();
});

function getAIStats() {
  const lats = metrics.ai.latencies;
  if (!lats.length) return { avg: 0, p95: 0, min: 0, max: 0 };
  const s = [...lats].sort((a, b) => a - b);
  return {
    avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
    p95: s[Math.floor(s.length * 0.95)] ?? s[s.length - 1],
    min: s[0],
    max: s[s.length - 1],
  };
}

// ─── /monitor — Live dashboard ──────────────────────────────────────────────
app.get('/monitor', (req, res) => {
  const upSecs = Math.floor((Date.now() - metrics.startedAt) / 1000);
  const upStr  = `${Math.floor(upSecs/3600)}h ${Math.floor((upSecs%3600)/60)}m ${upSecs%60}s`;
  const aiSt   = getAIStats();
  const mem    = process.memoryUsage();
  const errRate = metrics.requests.total > 0
    ? ((metrics.requests.errors / metrics.requests.total) * 100).toFixed(1)
    : '0.0';

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="5">
  <title>AeroPrep Monitor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #0f1117; color: #e0e0e0; padding: 24px; }
    h1 { font-size: 1.4rem; color: #7c83fd; margin-bottom: 4px; }
    .sub { font-size: 0.8rem; color: #666; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #1a1d27; border: 1px solid #2a2d3a; border-radius: 10px; padding: 16px; }
    .label { font-size: 0.72rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .value { font-size: 1.8rem; font-weight: 700; color: #fff; }
    .value.green { color: #4ade80; }
    .value.yellow { color: #facc15; }
    .value.red { color: #f87171; }
    .value.blue { color: #7c83fd; }
    .sub-val { font-size: 0.78rem; color: #666; margin-top: 4px; }
    .section { font-size: 0.85rem; color: #aaa; margin-bottom: 8px; border-bottom: 1px solid #2a2d3a; padding-bottom: 6px; }
    .bar-wrap { background: #111; border-radius: 4px; height: 6px; margin-top: 8px; overflow: hidden; }
    .bar { height: 100%; border-radius: 4px; background: linear-gradient(90deg, #7c83fd, #4ade80); transition: width 0.5s; }
    footer { margin-top: 24px; font-size: 0.72rem; color: #444; text-align: center; }
  </style>
</head>
<body>
  <h1>🚀 AeroPrep — Live Monitor</h1>
  <p class="sub">Auto-refreshes every 5s &nbsp;|&nbsp; Uptime: <strong>${upStr}</strong> &nbsp;|&nbsp; ${new Date().toLocaleTimeString()}</p>

  <p class="section">Server Health</p>
  <div class="grid">
    <div class="card">
      <div class="label">Total HTTP Requests</div>
      <div class="value blue">${metrics.requests.total.toLocaleString()}</div>
      <div class="sub-val">Error rate: ${errRate}%</div>
    </div>
    <div class="card">
      <div class="label">HTTP Errors (5xx)</div>
      <div class="value ${metrics.requests.errors > 0 ? 'red' : 'green'}">${metrics.requests.errors}</div>
      <div class="sub-val">of ${metrics.requests.total} total</div>
    </div>
    <div class="card">
      <div class="label">Memory (Heap Used)</div>
      <div class="value ${mem.heapUsed > 300e6 ? 'yellow' : 'green'}">${Math.round(mem.heapUsed/1024/1024)} MB</div>
      <div class="sub-val">of ${Math.round(mem.heapTotal/1024/1024)} MB allocated</div>
      <div class="bar-wrap"><div class="bar" style="width:${Math.min(100,(mem.heapUsed/mem.heapTotal*100)).toFixed(0)}%"></div></div>
    </div>
    <div class="card">
      <div class="label">RSS Memory</div>
      <div class="value">${Math.round(mem.rss/1024/1024)} MB</div>
    </div>
  </div>

  <p class="section">WebSocket / Interviews</p>
  <div class="grid">
    <div class="card">
      <div class="label">Active WS Sessions</div>
      <div class="value ${metrics.websocket.connected > 0 ? 'green' : ''}">${metrics.websocket.connected}</div>
      <div class="sub-val">Peak: ${metrics.websocket.peak} &nbsp;|&nbsp; Total ever: ${metrics.websocket.totalSessions}</div>
    </div>
    <div class="card">
      <div class="label">Interviews Created</div>
      <div class="value blue">${metrics.interviews.created}</div>
    </div>
    <div class="card">
      <div class="label">Interviews Finished</div>
      <div class="value green">${metrics.interviews.finished}</div>
    </div>
    <div class="card">
      <div class="label">Completion Rate</div>
      <div class="value ${metrics.interviews.created > 0 && metrics.interviews.finished/metrics.interviews.created > 0.7 ? 'green' : 'yellow'}">
        ${metrics.interviews.created > 0 ? Math.round(metrics.interviews.finished/metrics.interviews.created*100) : 0}%
      </div>
      <div class="bar-wrap"><div class="bar" style="width:${metrics.interviews.created > 0 ? Math.round(metrics.interviews.finished/metrics.interviews.created*100) : 0}%"></div></div>
    </div>
  </div>

  <p class="section">AI / Ollama Performance</p>
  <div class="grid">
    <div class="card">
      <div class="label">AI Calls Made</div>
      <div class="value blue">${metrics.ai.calls}</div>
      <div class="sub-val">Errors: ${metrics.ai.errors}</div>
    </div>
    <div class="card">
      <div class="label">Avg AI Latency</div>
      <div class="value ${aiSt.avg < 3000 ? 'green' : aiSt.avg < 7000 ? 'yellow' : 'red'}">${aiSt.avg > 0 ? (aiSt.avg/1000).toFixed(1)+'s' : '—'}</div>
      <div class="sub-val">P95: ${aiSt.p95 > 0 ? (aiSt.p95/1000).toFixed(1)+'s' : '—'}</div>
    </div>
    <div class="card">
      <div class="label">AI Min / Max</div>
      <div class="value">${aiSt.min > 0 ? (aiSt.min/1000).toFixed(1) : '—'}s / ${aiSt.max > 0 ? (aiSt.max/1000).toFixed(1) : '—'}s</div>
      <div class="sub-val">Last 100 calls</div>
    </div>
    <div class="card">
      <div class="label">Est. Capacity</div>
      <div class="value yellow">${aiSt.avg > 0 ? Math.max(1, Math.floor(60000/aiSt.avg)) : '—'}</div>
      <div class="sub-val">turns/min</div>
    </div>
  </div>

  <footer>AeroPrep Internal Monitor &nbsp;•&nbsp; Prometheus/Grafana recommended when deployed to production with 10+ users</footer>
</body>
</html>`);
});

// ─── /metrics — Prometheus-compatible text format (for future use) ───────────
app.get('/metrics', (req, res) => {
  const aiSt = getAIStats();
  res.setHeader('Content-Type', 'text/plain');
  res.send([
    `# HELP http_requests_total Total HTTP requests`,
    `http_requests_total ${metrics.requests.total}`,
    `http_errors_total ${metrics.requests.errors}`,
    `websocket_active_connections ${metrics.websocket.connected}`,
    `websocket_peak_connections ${metrics.websocket.peak}`,
    `interviews_created_total ${metrics.interviews.created}`,
    `interviews_finished_total ${metrics.interviews.finished}`,
    `ai_calls_total ${metrics.ai.calls}`,
    `ai_errors_total ${metrics.ai.errors}`,
    `ai_latency_avg_ms ${aiSt.avg}`,
    `ai_latency_p95_ms ${aiSt.p95}`,
    `process_heap_bytes ${process.memoryUsage().heapUsed}`,
    `process_uptime_seconds ${Math.floor((Date.now() - metrics.startedAt) / 1000)}`,
  ].join('\n'));
});


// HEALTH CHECK (for cron job keep-alive)
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'AI Interview Coach API is running', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});


// AUTH ROUTES


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

// INTERVIEW ROUTES (Protected)

// Create interview and generate questions
app.post('/interviews', authMiddleware, async (req, res) => {
  const { resumeURL, jobDescription, resumeText } = req.body;
  
  // Require either resumeURL or resumeText/jobDescription
  if (!resumeURL && !resumeText && !jobDescription) {
    return res.status(400).json({ error: 'resumeURL, resumeText, or jobDescription is required' });
  }
  
  try {
    console.log(`Creating interview for user ${req.userId}`);
    
    // Extract text from PDF OR use provided text
    let text = resumeText || "";
    if (resumeURL && !text && !resumeURL.includes('manual-entry.local')) {
        try {
            text = await extractTextFromPdf(resumeURL);
        } catch (err) {
            console.warn("Failed to extract PDF, using job description fallback", err);
            text = jobDescription || "General Interview";
        }
    } else if (!text) {
        text = jobDescription || "General Interview";
    }

    // Use 10 placeholder slots — the dynamic WebSocket chat overwrites them
    // with the actual questions/answers asked during the live session.
    // This avoids slow/unreliable JSON generation from small local models.
    const placeholderQuestions = Array.from({ length: 10 }, (_, i) => ({
      question: `Dynamic question ${i + 1}`,
      answer: 'Will be populated during live interview session.',
    }));
    
    // Save to database
    const interview = await createInterview(req.userId, resumeURL || 'manual-entry.local', jobDescription, placeholderQuestions);
    
    console.log(`Interview ${interview.id} created instantly with placeholder questions.`);
    metrics.interviews.created++;
    res.status(201).json({ interview, questions: placeholderQuestions });
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

// Dynamic conversational AI chat during live interview
app.post('/interviews/:id/chat', authMiddleware, async (req, res) => {
  const { conversationHistory, questionsAsked, timeExpiring, resumeText: bodyResume, jobDescription: bodyJob } = req.body;
  const interviewId = parseInt(req.params.id);

  try {
    let resumeText = bodyResume || '';
    let jobDescription = bodyJob || '';

    // If valid interviewId, fetch from DB (overrides body values)
    if (interviewId && !isNaN(interviewId)) {
      try {
        const { getInterviewById } = require('./services/interviewService');
        const interview = await getInterviewById(interviewId, req.userId);
        resumeText = interview.resumeURL || bodyResume || '';
        jobDescription = interview.jobDescription || bodyJob || '';
      } catch (_) {
        // Interview not found or unauthorised — use body values
      }
    }

    const aiReply = await generateDynamicInterviewChat(
      resumeText,
      jobDescription,
      conversationHistory || [],
      questionsAsked || 0,
      timeExpiring || false
    );

    res.json({ reply: aiReply });
  } catch (error) {
    console.error('Error in /interviews/:id/chat:', error);
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

// PUBLIC AI ROUTES (for backward compatibility)

app.post('/generate-questions', async (req, res) => {
  const { resumeURL, jobDescription, resumeText } = req.body;

  if (!resumeURL && !resumeText) {
    return res.status(400).json({ error: 'resumeURL or resumeText is required' });
  }

  try {
    let text = resumeText || "";
    if (resumeURL && !text) {
        console.log(`Processing resume from: ${resumeURL}`);
        text = await extractTextFromPdf(resumeURL);
        console.log('PDF text extracted successfully.');
    }
    
    // If we still have no text (e.g. empty resumeText), ensure we have something
    if (!text && jobDescription) text = "No resume provided. Focus on Job Description.";

    const questions = await generateQuestions(text, jobDescription);
    console.log('Questions generated successfully.');
    
    res.json({ questions });
  } catch (error) {
    console.error('Error generating interview questions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/generate-coding-question', async (req, res) => {
  const { resumeURL, resumeText } = req.body;
  
  if (!resumeURL && !resumeText) return res.status(400).json({ error: 'resumeURL or resumeText is required' });

  try {
    let text = resumeText || "";
    if (resumeURL && !text) {
        text = await extractTextFromPdf(resumeURL);
    }
    
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

// IMAGEKIT AUTH

app.get('/imagekit-auth', function (req, res) {
    try {
        var result = imagekit.getAuthenticationParameters();
        res.send(result);
    } catch (error) {
        console.error("ImageKit Auth Error:", error);
        res.status(500).send("Auth Failed");
    }
});

// ─── HTTP + Socket.IO server ───────────────────────────────────────────────────
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ─── Interview WebSocket namespace ────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const SOCKET_JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

io.use((socket, next) => {
  // Allow token via handshake auth or query
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  console.log(`[Socket] Middleware: token present = ${!!token}`);
  if (!token) {
    // Allow anonymous connection for graceful fallback
    socket.userId = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, SOCKET_JWT_SECRET);
    socket.userId = decoded.userId || decoded.id;
    console.log(`[Socket] Middleware: userId = ${socket.userId}`);
    next();
  } catch (err) {
    console.error('[Socket] JWT verify failed:', err.message);
    // Don't block — let it connect anonymously
    socket.userId = null;
    next();
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id} (user ${socket.userId})`);
  metrics.websocket.connected++;
  metrics.websocket.totalSessions++;
  if (metrics.websocket.connected > metrics.websocket.peak) metrics.websocket.peak = metrics.websocket.connected;

  // Client sends this to start / continue the conversation.
  // Payload: { interviewId, conversationHistory, questionsAsked, timeExpiring, resumeText, jobDescription }
  socket.on('interview:message', async (payload) => {
    try {
      const {
        interviewId,
        conversationHistory = [],
        questionsAsked = 0,
        timeExpiring = false,
        resumeText: bodyResume = '',
        jobDescription: bodyJob = ''
      } = payload;

      let resumeText = bodyResume;
      let jobDescription = bodyJob;

      // Try to enrich with DB data — also extract PDF text if only a URL was stored
      if (interviewId && !isNaN(Number(interviewId))) {
        try {
          const interview = await getInterviewById(Number(interviewId), socket.userId);
          if (interview.jobDescription) jobDescription = interview.jobDescription;

          // If we don't have resume text but have a PDF URL, extract it now
          if (!resumeText && interview.resumeURL && !interview.resumeURL.includes('manual-entry.local')) {
            try {
              resumeText = await extractTextFromPdf(interview.resumeURL);
              console.log(`[Socket] Extracted resume text from PDF (${resumeText.length} chars)`);
            } catch (pdfErr) {
              console.warn('[Socket] PDF extraction failed, using empty resume text');
            }
          }
        } catch (_) {/* not fatal */}
      }

      console.log(`[Socket] Context — resumeText: ${resumeText ? resumeText.substring(0, 80) + '...' : 'EMPTY'} | job: ${jobDescription ? jobDescription.substring(0, 60) + '...' : 'EMPTY'}`);

      // Signal that AI is thinking
      socket.emit('interview:thinking', true);

      metrics.ai.calls++;
      const aiStart = Date.now();
      const reply = await generateDynamicInterviewChat(
        resumeText,
        jobDescription,
        conversationHistory,
        questionsAsked,
        timeExpiring
      );
      metrics.ai.latencies.push(Date.now() - aiStart);
      if (metrics.ai.latencies.length > 100) metrics.ai.latencies.shift();

      socket.emit('interview:thinking', false);
      socket.emit('interview:reply', { text: reply });
    } catch (err) {
      console.error('[Socket] interview:message error', err);
      socket.emit('interview:error', err.message);
    }
  });

  // Client sends full transcript at the end for saving
  socket.on('interview:save', async (payload) => {
    try {
      const { interviewId, transcript } = payload;
      if (!interviewId || !transcript) return;

      const pairs = [];
      let pairIdx = 0;
      for (let i = 0; i < transcript.length - 1; i++) {
        if (transcript[i].speaker === 'ai' && transcript[i + 1]?.speaker === 'user') {
          pairs.push({
            questionIndex: pairIdx++,
            dynamicQuestion: transcript[i].text,
            dynamicAnswer: transcript[i + 1].text
          });
        }
      }

      await saveAnswers(Number(interviewId), pairs);
      socket.emit('interview:saved', { success: true });
    } catch (err) {
      console.error('[Socket] interview:save error', err);
      socket.emit('interview:error', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    metrics.websocket.connected = Math.max(0, metrics.websocket.connected - 1);
  });
});

const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
    console.log(`Server Running on port ${PORT} (HTTP + WebSocket)`);
});
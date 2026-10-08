require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

// Resume uploads need ImageKit; without its keys the server still runs and interviews
// can be started from manually entered details
const imagekitConfigured = !!(process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT);

// Services
const { extractTextFromPdf } = require('./services/pdfService');
const { describeProvider, stats: aiStats } = require('./services/llm');
const { AppError } = require('./services/appError');
const { register, login, authMiddleware, getUserById, JWT_SECRET } = require('./services/authService');
const {
  saveAppFeedback,
  getQuota,
  assertCanStartInterview,
  getActiveInterview,
  createInterview,
  getUserInterviews,
  getInterviewById
} = require('./services/interviewService');
const {
  joinInterview,
  submitAnswer,
  finishInterview,
  getOrCreateChallenge,
  runCode,
  submitCode,
  skipCoding,
  getOrCreateFeedback
} = require('./services/sessionService');
const { RESUME_STORE_CHARS, JOB_DESCRIPTION_CHARS } = require('./services/limits');
const { mailConfigured, sendFeedbackEmail } = require('./services/mailService');

const app = express();

// Behind Render's proxy, so the client's address is in X-Forwarded-For
app.set('trust proxy', 1);

// Browsers may only call this API from the app's own pages. Add more with CORS_ORIGINS (comma separated).
const allowedOrigins = [
  'http://localhost:3000',
  /^https:\/\/ai-interview-coach[a-z0-9-]*\.vercel\.app$/,
  ...(process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean)
];
const corsOptions = { origin: allowedOrigins };

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '200kb' }));

// ─── Rate limits ─────────────────────────────────────────────────────────────
function limiter(windowMinutes, limit, message, keyGenerator) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    message: { error: message, code: 'RATE_LIMITED' }
  });
}

// Everything, per address
const generalLimiter = limiter(15, 300, 'Too many requests. Please slow down and try again shortly.');
// Sign-in and sign-up, per address: slows down password guessing and mass account creation
const authLimiter = limiter(15, 15, 'Too many attempts. Please wait a few minutes and try again.');
// Routes that can call the model or create interviews, per signed-in user
const aiLimiter = limiter(10, 40, 'You are doing that too often. Please wait a few minutes.', (req) => `user:${req.userId}`);

// Product feedback, per signed-in user
const feedbackLimiter = limiter(60, 5, 'Thanks, we have your feedback. Please try again later.', (req) => `user:${req.userId}`);

app.use(generalLimiter);

// ─── In-Process Metrics ──────────────────────────────────────────────────────
const metrics = {
  startedAt:      Date.now(),
  requests:       { total: 0, errors: 0 },
  websocket:      { connected: 0, peak: 0, totalSessions: 0 },
  interviews:     { created: 0, finished: 0 },
};

// Track incoming HTTP requests
app.use((req, res, next) => {
  metrics.requests.total++;
  res.on('finish', () => {
    if (res.statusCode >= 500) metrics.requests.errors++;
  });
  next();
});

function getAIStats() {
  const lats = aiStats.latencies;
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
// The monitoring pages are open unless MONITOR_TOKEN is set; then they need ?token=<value>
function monitorAccess(req, res, next) {
  const expected = process.env.MONITOR_TOKEN;
  if (expected && req.query.token !== expected) return res.status(404).send('Not found');
  next();
}

app.get('/monitor', monitorAccess, (req, res) => {
  const upSecs = Math.floor((Date.now() - metrics.startedAt) / 1000);
  const upStr  = `${Math.floor(upSecs/3600)}h ${Math.floor((upSecs%3600)/60)}m ${upSecs%60}s`;
  const aiSt   = getAIStats();
  const mem    = process.memoryUsage();
  const errRate = metrics.requests.total > 0
    ? ((metrics.requests.errors / metrics.requests.total) * 100).toFixed(1)
    : '0.0';

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
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

  <p class="section">AI Performance — ${describeProvider()}</p>
  <div class="grid">
    <div class="card">
      <div class="label">AI Calls Made</div>
      <div class="value blue">${aiStats.calls}</div>
      <div class="sub-val">Errors: ${aiStats.errors}</div>
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
      <div class="label">Tokens Used</div>
      <div class="value blue">${(aiStats.inputTokens + aiStats.outputTokens).toLocaleString()}</div>
      <div class="sub-val">In: ${aiStats.inputTokens.toLocaleString()} (${aiStats.cachedTokens.toLocaleString()} cached) &nbsp;|&nbsp; Out: ${aiStats.outputTokens.toLocaleString()}</div>
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
app.get('/metrics', monitorAccess, (req, res) => {
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
    `ai_calls_total ${aiStats.calls}`,
    `ai_errors_total ${aiStats.errors}`,
    `ai_input_tokens_total ${aiStats.inputTokens}`,
    `ai_cached_input_tokens_total ${aiStats.cachedTokens}`,
    `ai_output_tokens_total ${aiStats.outputTokens}`,
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


app.post('/auth/register', authLimiter, async (req, res) => {
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

app.post('/auth/login', authLimiter, async (req, res) => {
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
    res.json({ user, quota: await getQuota(req.userId) });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// INTERVIEW ROUTES (Protected)

// Sends an AppError as-is; anything else is logged and hidden behind a generic message
function sendError(res, error, context) {
  if (error instanceof AppError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error(`${context}:`, error);
  res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' });
}

// Resumes are uploaded to ImageKit, so that is the only place the server will download one from
function isAllowedResumeUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    const allowedHosts = ['ik.imagekit.io'];
    if (process.env.IMAGEKIT_URL_ENDPOINT) allowedHosts.push(new URL(process.env.IMAGEKIT_URL_ENDPOINT).hostname);
    return protocol === 'https:' && allowedHosts.includes(hostname);
  } catch {
    return false;
  }
}

// Collapse the stray spacing PDF extraction leaves behind, so the same resume costs fewer tokens
function tidyText(text) {
  return String(text || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

// How many interviews the user has left, and any interview they can resume
app.get('/interviews/quota', authMiddleware, async (req, res) => {
  try {
    const [quota, active] = await Promise.all([getQuota(req.userId), getActiveInterview(req.userId)]);
    res.json({ quota, active });
  } catch (error) {
    sendError(res, error, 'Error fetching quota');
  }
});

// Create interview
app.post('/interviews', authMiddleware, aiLimiter, async (req, res) => {
  const { resumeURL, jobDescription, resumeText } = req.body;

  // Require either resumeURL or resumeText/jobDescription
  if (!resumeURL && !resumeText && !jobDescription) {
    return res.status(400).json({ error: 'resumeURL, resumeText, or jobDescription is required' });
  }

  try {
    await assertCanStartInterview(req.userId);

    // Extract the resume text once, here, so no later step has to download the PDF again
    let text = tidyText(resumeText);
    if (resumeURL && !text) {
      if (!isAllowedResumeUrl(resumeURL)) {
        throw new AppError(400, 'INVALID_RESUME_URL', 'That resume link is not valid. Please upload the PDF again.');
      }
      try {
        text = tidyText(await extractTextFromPdf(resumeURL));
      } catch {
        text = '';
      }
      if (!text) {
        throw new AppError(422, 'UNREADABLE_RESUME', 'We could not read any text from that PDF. Upload a text-based PDF, or enter your details manually.');
      }
    }

    const interview = await createInterview(req.userId, {
      resumeURL: resumeURL || 'manual-entry.local',
      resumeText: text.slice(0, RESUME_STORE_CHARS),
      jobDescription: tidyText(jobDescription).slice(0, JOB_DESCRIPTION_CHARS)
    });

    console.log(`Interview ${interview.id} created for user ${req.userId}`);
    metrics.interviews.created++;
    res.status(201).json({ interview, quota: await getQuota(req.userId) });
  } catch (error) {
    sendError(res, error, 'Error creating interview');
  }
});

// Get user's interview history
app.get('/interviews', authMiddleware, async (req, res) => {
  try {
    const interviews = await getUserInterviews(req.userId);
    res.json({ interviews });
  } catch (error) {
    sendError(res, error, 'Error fetching interviews');
  }
});

// Get single interview details
app.get('/interviews/:id', authMiddleware, async (req, res) => {
  const interviewId = parseInt(req.params.id);

  try {
    if (isNaN(interviewId)) throw new AppError(404, 'NOT_FOUND', 'Interview not found');
    const interview = await getInterviewById(interviewId, req.userId);
    res.json({ interview });
  } catch (error) {
    sendError(res, error, 'Error fetching interview');
  }
});

// CODING ROUND — one stored challenge per interview, evaluated on the server

app.post('/interviews/:id/coding/challenge', authMiddleware, aiLimiter, async (req, res) => {
  try {
    res.json({ challenge: await getOrCreateChallenge(req.params.id, req.userId) });
  } catch (error) {
    sendError(res, error, 'Error loading coding challenge');
  }
});

app.post('/interviews/:id/coding/run', authMiddleware, aiLimiter, async (req, res) => {
  try {
    res.json({ challenge: await runCode(req.params.id, req.userId, req.body) });
  } catch (error) {
    sendError(res, error, 'Error evaluating code');
  }
});

app.post('/interviews/:id/coding/submit', authMiddleware, aiLimiter, async (req, res) => {
  try {
    res.json({ challenge: await submitCode(req.params.id, req.userId, req.body) });
  } catch (error) {
    sendError(res, error, 'Error submitting code');
  }
});

app.post('/interviews/:id/coding/skip', authMiddleware, aiLimiter, async (req, res) => {
  try {
    res.json(await skipCoding(req.params.id, req.userId));
  } catch (error) {
    sendError(res, error, 'Error skipping coding round');
  }
});

// FEEDBACK — generated once on the server from the stored interview, then read back

app.post('/interviews/:id/feedback', authMiddleware, aiLimiter, async (req, res) => {
  try {
    res.json({ feedback: await getOrCreateFeedback(req.params.id, req.userId) });
  } catch (error) {
    sendError(res, error, 'Error generating feedback');
  }
});

// PRODUCT FEEDBACK — saved, and emailed to the support address when email is configured

app.post('/feedback', authMiddleware, feedbackLimiter, async (req, res) => {
  const rating = Number(req.body.rating);
  const message = String(req.body.message || '').trim().slice(0, 2000);
  const interviewId = Number.isInteger(Number(req.body.interviewId)) ? Number(req.body.interviewId) : null;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Please choose a rating from 1 to 5.' });
  }

  try {
    const saved = await saveAppFeedback(req.userId, { interviewId, rating, message });
    sendFeedbackEmail(saved); // not awaited: the user should not wait on the mail server
    res.status(201).json({ success: true });
  } catch (error) {
    sendError(res, error, 'Error saving feedback');
  }
});

// IMAGEKIT AUTH

// Signs a browser upload the way ImageKit expects: HMAC-SHA1 of token + expiry with the private key
app.get('/imagekit-auth', authMiddleware, aiLimiter, function (req, res) {
    if (!imagekitConfigured) {
        return res.status(503).send("Resume upload is not configured");
    }
    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 30 * 60;
    const signature = crypto.createHmac('sha1', process.env.IMAGEKIT_PRIVATE_KEY).update(token + expire).digest('hex');
    res.json({ token, expire, signature });
});

// ─── HTTP + Socket.IO server ───────────────────────────────────────────────────
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 100 * 1024 // interview events are small; refuse anything large
});

// ─── Interview WebSocket ──────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');

// Every interview event spends tokens or changes an interview, so sockets must be signed in
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId || decoded.id;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

// Runs a session action and answers the client's acknowledgement with the new interview state
async function respond(reply, context, action) {
  const ack = typeof reply === 'function' ? reply : () => {};
  try {
    ack({ ok: true, state: await action() });
  } catch (error) {
    if (!(error instanceof AppError)) console.error(`[Socket] ${context}:`, error);
    ack({
      ok: false,
      code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
      error: error instanceof AppError ? error.message : 'Something went wrong. Please try again.'
    });
  }
}

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id} (user ${socket.userId})`);
  metrics.websocket.connected++;
  metrics.websocket.totalSessions++;
  if (metrics.websocket.connected > metrics.websocket.peak) metrics.websocket.peak = metrics.websocket.connected;

  // At most 30 events a minute per connection; a real interview sends a handful
  let eventCount = 0;
  const eventWindow = setInterval(() => { eventCount = 0; }, 60 * 1000);
  socket.use((packet, next) => {
    if (++eventCount > 30) return next(new Error('rate limited'));
    next();
  });
  socket.on('disconnect', () => clearInterval(eventWindow));

  // Each event is acknowledged with { ok, state } — the full interview state as stored on the
  // server — so the client can always redraw from it, including after a refresh or reconnect.

  // Enter or re-enter the interview room. Payload: { interviewId }
  socket.on('interview:join', (payload, reply) => {
    respond(reply, 'interview:join', () => joinInterview(payload?.interviewId, socket.userId));
  });

  // The candidate's answer; the state that comes back includes the interviewer's reply.
  // Payload: { interviewId, text }
  socket.on('interview:answer', (payload, reply) => {
    respond(reply, 'interview:answer', async () => {
      const state = await submitAnswer(payload?.interviewId, socket.userId, payload?.text);
      if (state.status === 'ended') metrics.interviews.finished++;
      return state;
    });
  });

  // The candidate ended the call. Payload: { interviewId }
  socket.on('interview:end', (payload, reply) => {
    respond(reply, 'interview:end', async () => {
      const state = await finishInterview(payload?.interviewId, socket.userId);
      metrics.interviews.finished++;
      return state;
    });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    metrics.websocket.connected = Math.max(0, metrics.websocket.connected - 1);
  });
});

const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
    console.log(`Server Running on port ${PORT} (HTTP + WebSocket)`);
    console.log(`AI provider: ${describeProvider()}`);
    if (!mailConfigured) console.warn('SMTP_USER / SMTP_PASS are not set: user feedback is saved but not emailed.');
    if (!imagekitConfigured) console.warn('ImageKit keys are not set: resume upload is disabled (manual entry still works).');
});

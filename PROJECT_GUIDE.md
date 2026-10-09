# AeroPrep: how the whole thing works

A single read-through of the project: what it does, how it is built, what happens at every step of an interview, how the AI interviewer is driven, what keeps it cheap and safe, and how it is tested and released.

`README.md` is the quick start. `ARCHITECTURE.md` is a shorter walk through one session. This file is the long version.

---

## 1. What AeroPrep is

A mock-interview site. A candidate uploads a resume (or types in a role), talks to an AI interviewer called Alex by voice or keyboard for up to 15 minutes, optionally solves one coding challenge, and gets a scored report with a note on every answer.

- Live site: https://ai-interview-coach-eight-mu.vercel.app
- API: https://ai-interview-coach-api.onrender.com
- Each account gets 3 free interviews. More are given by raising `User.interviewLimit` for that user; the site tells people to write to the support address.

---

## 2. The pieces

```
Browser (Next.js pages on Vercel)
   |  HTTPS (REST)            sign-up, resume, create interview, coding round, report
   |  WebSocket (Socket.IO)   the live interview: join, answer, end, streamed reply
   v
API server (Express + Socket.IO on Render, one Node process)
   |-- PostgreSQL on Neon (through Prisma)     everything that must survive a refresh
   |-- Model provider (Claude by default)       every AI call is made from here
   |-- A short-lived child process              reads resume PDFs
   `-- Gmail SMTP                               emails product feedback to the team
```

| Part | Technology | Where the code is |
|---|---|---|
| Pages | Next.js 16 (App Router), React 19, Tailwind 4, shadcn components | `frontend/` |
| API | Node, Express 5, Socket.IO | `backend/index.js` |
| Business logic | Plain JavaScript modules | `backend/services/` |
| Database | PostgreSQL, Prisma | `backend/prisma/` |
| AI | Anthropic SDK, or any OpenAI-compatible API | `backend/services/llm/` |
| Voice out | The browser's `speechSynthesis` | `frontend/app/(root)/interview/session/page.tsx` |
| Voice in | The browser's `webkitSpeechRecognition` | same file |
| Camera nudges | MediaPipe Face Landmarker, in the browser | `frontend/lib/useAttentionMonitor.ts` |
| Code editor | Monaco | `frontend/app/(root)/interview/coding/page.tsx` |

**The one rule that shapes everything:** the browser holds only a login token and the number of the current interview. The server owns the transcript, the clock, every limit and every model call. That is why a refresh loses nothing, and why a user cannot edit their score or spend tokens the server did not agree to.

---

## 3. Folder map

```
backend/
  index.js                 routes, rate limits, socket events, monitor page
  services/
    authService.js         sign-up, sign-in, JWT, the auth middleware
    interviewService.js    all database reads and writes for interviews
    sessionService.js      the live interview, coding round and report (the brain)
    aiService.js           prompts, sentence streaming, JSON calls
    llm/index.js           picks the provider, counts tokens
    llm/anthropic.js       Claude, through the official SDK
    llm/openaiCompatible.js  OpenAI, OpenRouter, Gemini, Groq, Ollama, custom
    pdfService.js          queues resume PDFs and starts the reader process
    pdfReader.js           the reader process: watches its own memory
    pdfWorker.js           the actual PDF parsing, in a worker thread
    limits.js              every cap, in one place
    text.js                strips characters the database cannot store
    speakingStats.js       pace, filler words and timing figures for the report
    mailService.js         feedback email
    appError.js            an error that is safe to show the user
  prisma/schema.prisma     the data model
  prisma/migrations/       one folder per schema change
  test/e2e.js              136 end-to-end checks
  test/fake-anthropic.js   a stand-in for the model, for tests

frontend/
  app/(auth)/sign-in, sign-up
  app/(root)/page.tsx                  landing page or dashboard, chosen on the server
  app/(root)/interview/create          resume or role, experience level
  app/(root)/interview/session         the interview room
  app/(root)/interview/coding          the coding round
  app/(root)/interview/feedback        the report
  app/(root)/interview/history         past interviews
  app/(root)/resources, help           prep library, support
  lib/api.ts                           every REST call
  lib/auth.ts                          token storage
  lib/currentInterview.ts              remembers which interview is open
  lib/useAttentionMonitor.ts           camera nudges
```

---

## 4. The data model

| Table | What it holds |
|---|---|
| `User` | name, email, hashed password, `interviewLimit` (optional override of the free 3) |
| `Interview` | owner, `resumeText`, `jobDescription`, `level`, `startedAt`, `endedAt`, token totals, `failedCalls` |
| `Message` | the transcript: one row per thing said, `speaker` is `ai` or `user`; answers also carry how long the candidate took to start, how long they spoke, and whether they typed |
| `Question` | question and answer pairs rebuilt from the transcript when the interview ends, plus the report's note on each |
| `CodingChallenge` | the generated problem, the candidate's code, the last review, how many checks were used |
| `Feedback` | the report: three scores, strengths, weaknesses, write-up, recommendation |
| `AppFeedback` | what users said about the product |

`Message` is the source of truth while an interview is running. `Question` exists so history and the report can show clean pairs.

An interview is **counted** against the user's allowance when `startedAt` is set, which happens on the first answer, not on creation.

---

## 5. One interview, step by step

### 5.1 Sign-up and sign-in
`POST /auth/register` stores a bcrypt hash. `POST /auth/login` returns a JWT valid for 7 days. The browser keeps it in `localStorage` and sends it as `Authorization: Bearer …`. A separate, harmless cookie (`ap_signed_in`) only tells the Next.js server whether to render the landing page or the dashboard for `/`.

### 5.2 Resume
The PDF is sent straight to `POST /resumes/extract`. The server starts a separate process to read it (section 8), keeps only the text, tidies the spacing, and returns up to 8,000 characters. The file itself is never stored.

### 5.3 Creating the interview
`POST /interviews` with the resume text, an optional job description and an optional level (`intern`, `junior`, `mid`, `senior`). The server checks the user has interviews left and the site is under its daily ceiling, then creates the row. Nothing is spent yet.

### 5.4 Joining the room
The page opens a socket and sends `interview:join`. The server replies with the full state: transcript, seconds left, answers used. If the transcript is empty it adds Alex's greeting, which is **fixed text**, so opening or refreshing the room costs no tokens.

### 5.5 Answering
The page sends `interview:answer`. On the server, in `sessionService.submitAnswer`:

1. A per-interview lock makes sure only one thing happens to an interview at a time.
2. If this is the first answer, a database transaction locks the user's row, re-checks the allowance and the daily ceiling, and sets `startedAt`.
3. The answer is stored.
4. One model call is made with the stored transcript.
5. As the reply is written, each finished sentence is sent to the browser as `interview:reply-chunk`.
6. The whole reply is stored, token usage is added to the interview, and the new state is returned as the acknowledgement.

The browser speaks each sentence as it arrives, then opens the microphone again.

### 5.6 Ending
The interview ends when Alex's reply carries the hidden marker `[END_INTERVIEW]`, on the 12th answer, when 15 minutes are up, or when the candidate hangs up. The server sets `endedAt` and rebuilds the `Question` rows.

### 5.7 Coding round (optional)
Offered only if at least one real interview question was answered. `POST /interviews/:id/coding/challenge` generates one problem, matched to the resume and level, and stores it. "Check my code" sends the code to the model for review, at most 5 times. The code is **not executed**; the page says so.

### 5.8 Report
`POST /interviews/:id/feedback` generates the report once from the stored transcript and coding round, saves it, and from then on reads it back from the database.

Alongside it comes **"How you spoke"**: pace in words per minute, filler words, average time to start answering and the longest answer. These are counted by `speakingStats.js` from the transcript and the timings the browser sent with each answer. No model call is involved, so it costs nothing.

---

## 6. How the AI interviewer works

There is no agent framework. Alex is one model call per answer, steered by three things.

**1. The system prompt** (`buildInterviewSystemPrompt` in `aiService.js`). It contains the resume, the job description, the level, and the rules: follow a real interview arc (deep dive, fundamentals, a scenario, one behavioural question, then "any questions for me?"), behave like a human interviewer (refer back to what was said, do not praise every answer, probe shallow answers, give one hint when stuck), and keep to two or three plain spoken sentences because the reply is read aloud. This text is the same on every turn of an interview.

**2. The transcript.** Every earlier message, replayed from the database.

**3. The turn note.** A short bracketed line added after the candidate's latest answer, such as `[Interview system: answer 4 of at most 12; about 9 minutes left.]`, or an instruction to wrap up. It is never stored. This is how the server, not the model, controls pacing and the ending.

**Markers.** Alex ends its last message with `[END_INTERVIEW]` (or `[INTERVIEW_TERMINATED]` after abuse). The server strips these before anything reaches the browser and uses them to close the interview.

**Prompt injection.** A candidate could type text that looks like a turn note. Anything a candidate supplies has `[Interview system` rewritten so it cannot pass for one.

### Streaming
`createSentenceStream` takes the model's output as it arrives, cuts it into sentences, holds back anything after an unclosed `[` (it might be a marker), and hands each finished sentence on. The stored reply is exactly those sentences joined, so what was spoken and what is in the transcript always match.

### The other three calls
Coding challenge, code review and report each ask for JSON. `callAIForJson` parses the answer and retries once if it is not valid JSON.

### Provider-agnostic layer
`llm/index.js` picks the provider from the key's prefix (`sk-ant-` Anthropic, `sk-or-` OpenRouter, `gsk_` Groq, `AIza` Gemini, `sk-` OpenAI) or from `AI_PROVIDER`. Set `AI_API_KEY` and `AI_MODEL` and it works. `AI_MODEL_FAST` optionally names a quicker model for the live turns only.

---

## 7. Keeping it cheap

| Measure | Effect |
|---|---|
| Fixed greeting | Opening or refreshing a room costs nothing |
| Prompt caching | The system prompt and earlier turns are marked as a reusable prefix; from the second turn about 85 to 90 percent of input is read at the cached rate |
| Turn note placed after the cache point | Changing it each turn does not break the cache |
| Resume cut to 2,000 characters in the prompt | Bounded input |
| Output ceilings per call | 2,000 tokens for a reply, 4,000 to 6,000 for the JSON calls |
| Everything generated once | Challenge and report are stored; reloading reads them back |
| Re-checking unchanged code | Returns the stored review for free |

Measured on Claude Opus 5.5 with `AI_EFFORT=low`: a three-answer interview with coding challenge, one check and the report used about 11,500 tokens. A full interview costs roughly ten US cents.

### Every limit (`limits.js`)

| Limit | Default | Setting |
|---|---|---|
| Free interviews per account | 3 | `FREE_INTERVIEW_LIMIT` |
| Interviews started per day, whole site | 100 | `DAILY_INTERVIEW_LIMIT` |
| Interview length | 15 minutes | `INTERVIEW_MINUTES` |
| Answers per interview | 12 | `INTERVIEW_MAX_ANSWERS` |
| Answer length | 4,000 characters | fixed |
| Code checks per challenge | 5 | `CODING_MAX_RUNS` |
| Code length | 12,000 characters | fixed |
| Failed calls that may have been charged, per interview | 6 | `INTERVIEW_MAX_FAILED_CALLS` |
| Time allowed for one reply | 30 seconds | `AI_REPLY_TIMEOUT_MS` |

### When a model call goes wrong
The rule is that a call which was paid for is never simply thrown away and retried for free.

- Reply is only the end marker: the interview closes with a fixed goodbye.
- Model declines or returns nothing: Alex says a fixed line and the turn counts.
- Reply breaks off part-way: the sentences already spoken are kept and the turn counts.
- Provider is down or turns the request away (nothing charged): the answer is handed back and, if it was the first answer, the interview is not counted.
- Timeout or unreadable JSON (may have been charged): the failure is counted on the interview. After 6 the interview stops calling the model.

---

## 8. Keeping it safe

**Access.** Every route except sign-up, sign-in and health needs a valid token. Every interview lookup includes the user's id, so one user cannot read or answer another's interview. Sockets must present the token to connect.

**Rate limits** (`express-rate-limit`):

| What | Limit |
|---|---|
| All requests, per visitor | 2,000 per 15 minutes |
| Sign-in attempts, per visitor and email | 10 per 15 minutes |
| Sign-ups, per visitor | 30 per hour |
| AI-backed routes, per user | 40 per 10 minutes |
| Resume uploads, per user | 20 per hour |
| Product feedback, per user | 5 per hour |
| Socket connections, per user | 5 |
| Socket events, per user | 60 per minute |

Render sits behind Cloudflare, so the visitor is identified by the `CF-Connecting-IP` header rather than the edge's address.

**Resume PDFs.** A PDF of a few hundred kilobytes can unpack into gigabytes. Each file is read in a process of its own (`pdfReader.js`), one at a time, with a 10-second limit and a 120 MB memory budget that the process enforces on itself. When it exits, all its memory goes back to the system. It is started with none of the server's settings or keys. At most four files wait in the queue; the rest are asked to try again.

**Input handling.** Every text input is cut to a maximum length before any pattern is run on it. Control characters are stripped from everything stored. Request bodies are limited to 200 KB (5 MB for a PDF).

**Browser side.** `helmet` on the API, security headers on the pages, and a list of origins allowed to call the API (the live site, the project's own Vercel previews, localhost, plus `CORS_ORIGINS`).

**Errors.** Only messages written for users (`AppError`) are sent back. Anything unexpected is logged and replaced by a generic message.

**Secrets.** They live only in `backend/.env` locally and on the Render and Vercel dashboards. Nothing secret is in the repository.

---

## 9. The interview room in the browser

`frontend/app/(root)/interview/session/page.tsx` is the largest file. Its parts:

- **State from the server.** Every socket acknowledgement carries the full interview state, and the page redraws from it. On every connect and reconnect it sends `interview:join`.
- **No dead air.** The moment an answer is sent, the page says a short "Okay." or "Right." in Alex's voice while the real reply is being written. The system prompt tells the model this has happened, so it does not open with a second acknowledgement.
- **Speaking.** A "turn" is a queue of sentences. Each is one `SpeechSynthesisUtterance`, spoken slightly slower than the browser default, with questions lifted in pitch. Watchdogs handle a browser that never starts or stalls mid-sentence, by falling back to text.
- **Listening.** Speech recognition fills the answer box. After a pause of the chosen length (3, 5 or 8 seconds, or never) the answer sends itself, with a countdown and a "Not yet" button. The microphone is closed while Alex speaks.
- **Typing.** The first keystroke stops the microphone for that answer, so nothing is entered twice. A typed answer is never sent automatically.
- **Camera (optional).** Frames are analysed in the browser only. The page nudges if no face is seen, the candidate looks away for a while, a second face appears, or the tab was left. Nothing is recorded or uploaded.
- **Hanging up** asks first, then leads to the choice between the coding round and the report.

---

## 10. Testing

**Backend, in the repo** (`npm test` in `backend/`): starts the real server against a throwaway PostgreSQL and a stand-in model, and drives it over HTTP and sockets. 136 checks covering access control, the whole interview flow, refresh and reconnect, limits and races, every failure mode of the model, hostile PDFs and rate limits. It runs in GitHub Actions on every push.

```bash
cd backend
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aeroprep_test npm test
```

The stand-in model misbehaves on request: put `STALL_PLEASE`, `CUT_OFF_PLEASE`, `REFUSE_PLEASE`, `ONLY_MARKER_PLEASE`, `BAD_JSON_PLEASE` or `FAIL_PLEASE` in an answer.

**Browser.** During development the pages were driven in headless Chrome with a simulated microphone and a silent stand-in for the voice. Those scripts are not in the repository yet.

**Not yet tested on real hardware:** a real microphone, real face tracking, Safari and phones.

---

## 11. Releasing

Pushing to `main` deploys both halves: Vercel builds `frontend/`, Render builds `backend/`.

1. Run the backend tests, lint, and a production build of the frontend.
2. If there is a new migration, apply it to the production database first: `npm run migrate` in `backend/` with the production `DATABASE_URL`. Migrations so far only add columns, so the old code keeps working.
3. If the pages need new server routes, push the server-side change first and wait until the new API answers before pushing the pages.
4. Check `/health` and `/monitor` on the API.

`/monitor` shows uptime, memory, request and error counts, model calls, latency and tokens. Set `MONITOR_TOKEN` to put it behind a token.

---

## 12. Settings

Backend (`backend/.env`, and the Render dashboard):

| Variable | Needed | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL |
| `JWT_SECRET` | yes | signs logins |
| `AI_API_KEY` | yes | model provider key |
| `AI_MODEL` | except Anthropic | model id; defaults to `claude-opus-5-5` |
| `AI_MODEL_FAST` | no | quicker model for live turns |
| `AI_EFFORT` | no | Anthropic only: `low`, `medium`, `high` |
| `AI_PROVIDER`, `AI_BASE_URL` | no | force a provider or point at a custom endpoint |
| `SMTP_USER`, `SMTP_PASS` | no | Gmail address and app password for feedback email |
| `SUPPORT_EMAIL` | no | shown to users, receives feedback |
| `CORS_ORIGINS` | no | extra sites allowed to call the API |
| `MONITOR_TOKEN` | no | protects `/monitor` |

Frontend (`frontend/.env.local`, and the Vercel dashboard): `NEXT_PUBLIC_API_URL`.

---

## 13. How it got here

The project started with the model called from public routes, state kept in the browser, and Ollama hard-wired. The rebuild, in order:

1. A provider-agnostic model layer, with Claude as the default.
2. Server-owned interview sessions, so a refresh loses nothing, with a fixed greeting, prompt caching and caps on everything.
3. Three free interviews per account, counted on the first answer.
4. Security hardening, rate limits, a new landing page, the prep library, product feedback by email.
5. A realistic interviewer prompt and on-device camera nudges.
6. Streamed replies, experience levels, per-answer notes, a rewritten coding round.
7. Two rounds of independent code review by AI agents (four auditors on correctness, security, flow and usability, then two final reviewers on the backend and frontend changes), whose findings are fixed: the PDF memory problem, uncounted failed calls, replies with no deadline, and a way to lose a finished coding round.

---

## 14. Known gaps and what to build next

1. **A natural voice.** The browser voice is the weakest part. A neural voice (Kokoro in the browser is free) would change how the interview feels.
2. **Server-side speech recognition.** Voice input currently needs Chrome or Edge.
3. **Running code for real** in a sandbox instead of asking the model to judge it.
4. **Email verification and password reset.** Without them, a new email address is three more free interviews.
5. **Cold starts.** The free Render instance sleeps and takes about 20 seconds to wake.
6. **More formats:** behavioural-only, system design, company-style rounds, progress across interviews.
7. **Housekeeping:** a content security policy, self-hosting Monaco and MediaPipe, moving the browser test scripts into the repository.

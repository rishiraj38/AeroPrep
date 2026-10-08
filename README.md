# AeroPrep

Spoken mock interviews with an AI interviewer that has read your resume.

You upload a resume (or describe the role), talk to "Alex" for about fifteen minutes, optionally solve one coding problem, and get a scored report with a note on every answer. The first three interviews on an account are free.

Live site: https://ai-interview-coach-eight-mu.vercel.app

## What it does

- **Interviews from your own resume.** Questions are about the projects and tools you listed, pitched at the experience level you choose.
- **A real conversation.** Alex follows an interview arc (project walk-through, deep dive, fundamentals, a scenario, a behavioural question, your questions), asks follow-ups when an answer is thin, and replies sentence by sentence as the answer is generated.
- **Voice or keyboard.** Speak (Chrome and Edge) or type. A spoken answer is sent after a pause whose length you choose.
- **Your resume stays yours.** The PDF is read on the server and only its text is kept; the file is never stored.
- **Nothing lost on a refresh.** The transcript and the clock live on the server. Close the tab mid-interview and you resume at the same question.
- **A coding round.** One challenge per interview, reviewed by the model. It is not executed; see "Ideas" below.
- **A report that quotes you.** Scores, strengths, weaknesses, a hire or no-hire call, and feedback on each answer.
- **Attention nudges.** With the camera on, the page notices if you leave the frame, look away for several seconds, or switch tabs. This runs entirely in the browser; no video leaves the device.

## How it is built

| Part | Stack | Where |
|---|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind 4 | `frontend/`, deployed on Vercel |
| Backend | Node 22, Express 5, Socket.IO, Prisma | `backend/`, deployed on Render |
| Database | PostgreSQL | Neon |
| Model | Any provider, picked from the API key | `backend/services/llm/` |

The browser holds only a login token and the id of the current interview. The server owns the transcript, the clock and every limit, and makes every model call itself. `ARCHITECTURE.md` walks through a session step by step.

## Run it locally

You need Node 20 or newer and a PostgreSQL database.

**Backend**

```bash
cd backend
npm install
cp .env.example .env      # then fill in DATABASE_URL, JWT_SECRET and AI_API_KEY
npm run migrate           # creates the tables
npm run dev               # http://localhost:5001
```

**Frontend**

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:5001" > .env.local
npm run dev               # http://localhost:3000
```

## Configuration

Backend (`backend/.env`):

| Variable | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Signs logins. Without it a temporary secret is used and everyone is signed out on restart |
| `AI_API_KEY` | yes | Key for the model provider. The provider is picked from the key: Anthropic, OpenAI, OpenRouter, Groq or Gemini |
| `AI_MODEL` | yes, except Anthropic | Model id. Defaults to `claude-opus-5-5` for Anthropic |
| `AI_MODEL_FAST` | no | A quicker, cheaper model used only for the live interview turns |
| `AI_EFFORT` | no | Anthropic only: `low`, `medium` or `high`. `low` is faster and cheaper |
| `AI_PROVIDER`, `AI_BASE_URL` | no | Force a provider, or point at any OpenAI-compatible endpoint (`custom`, `ollama`) |
| `FREE_INTERVIEW_LIMIT` | no | Interviews per account. Default 3; `User.interviewLimit` overrides it per user |
| `DAILY_INTERVIEW_LIMIT` | no | Interviews that may start per day across all users. Default 100. A ceiling on spend |
| `INTERVIEW_MINUTES`, `INTERVIEW_MAX_ANSWERS`, `CODING_MAX_RUNS` | no | Length of an interview (15), answers in it (12), code evaluations (5) |
| `INTERVIEW_MAX_FAILED_CALLS` | no | Model calls per interview that may fail after possibly being paid for (a timeout, an unusable reply) before the interview stops making calls. Default 6 |
| `SMTP_USER`, `SMTP_PASS` | no | Gmail address and app password; in-app feedback is emailed to `SUPPORT_EMAIL` |
| `SUPPORT_EMAIL` | no | Address shown to users and that receives feedback |
| `CORS_ORIGINS` | no | Sites allowed to call the API besides the built-in ones, comma separated. **Set this if you host the frontend anywhere other than the default address** |
| `MONITOR_TOKEN` | no | When set, `/monitor` and `/metrics` need `?token=` |

Frontend (`frontend/.env.local`): `NEXT_PUBLIC_API_URL`, and optionally `NEXT_PUBLIC_SITE_URL` (the site's own address, used in link previews). Anything in a `NEXT_PUBLIC_` variable is sent to the browser, so never put a secret in one.

## Cost

Every model call is made by the server, against caps: one call per answer, at most 12 answers, one coding challenge with 5 evaluations, one report. Calls that fail are bounded too: a reply that was paid for is kept and counted even when it is empty or breaks off, and an interview stops calling the model after a handful of failures that may have been charged. Token use is recorded per interview and shown on `/monitor`. On Claude Opus 5.5 with `AI_EFFORT=low`, a full interview with its report costs roughly ten US cents; setting `AI_MODEL_FAST` to a smaller model cuts that substantially.

## Tests

```bash
cd backend
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aeroprep_test npm test
```

The suite starts the real server against that database and a stand-in for the model, and drives it over HTTP and Socket.IO. It empties the database it is given, so point it at a throwaway one.

## Deploying

- **Backend (Render):** root directory `backend`, build `npm install`, start `npm start`. After pulling a change that adds a migration, run `npm run migrate` against the production database before the new code starts.
- **Frontend (Vercel):** root directory `frontend`. Set `NEXT_PUBLIC_API_URL` to the backend's URL.
- When the API between them changes, let the backend finish deploying before the frontend goes out: the new pages call routes the old server does not have.

## Ideas

Things we would like to build, roughly in order of value:

1. Run code for real in a sandbox instead of asking the model to judge it.
2. A more natural interviewer voice than the browser's built-in one.
3. Email verification and password reset.
4. System design and behavioural-only interviews, and company-style question sets.
5. Progress over time: scores across interviews and recurring weaknesses.

If you want to help, or have a better idea, write to hailhelixnewsform@gmail.com or open an issue.

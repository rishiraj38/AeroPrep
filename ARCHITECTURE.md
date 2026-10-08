# AeroPrep AI Interview Coach Architecture & Flow

This document outlines the high-level architecture, directory structure responsibilities, and the complete user flow of the AeroPrep application.

## High-Level Architecture
The project is decoupled into two main pieces:
- **Frontend** (`/frontend`): A modern React application built with Next.js 14 using the App Router architecture and Tailwind CSS for styling.
- **Backend** (`/backend`): A Node.js and Express.js REST API server. It interacts with an AI provider (via OpenRouter/Nemotron) to generate dynamic content and uses Prisma ORM to interact with a PostgreSQL database.

---

## Directory Structure & Responsibilities

### 1. The `backend/` Directory (The Server/Brain)
The backend is responsible for all database interactions, user authentication, PDF text extraction, and AI prompting.

* **`index.js`**: The main entry point for the Express API server. It defines all the HTTP REST routes (e.g., `POST /auth/register`, `POST /interviews`) and wires up the middleware and services.
* **`services/`**: The directory containing modularized business logic.
  * **`aiService.js`**: Manages all communication with the AI models. It uses helper functions to call the LLM to `generateQuestions`, `generateCodingChallenge()`, `evaluateCode()`, and `generateFeedback()`. It builds the rigorous prompts passing in user data and parses the AI's JSON responses.
  * **`authService.js`**: Handles user registration, login verification, password hashing, and JWT (JSON Web Token) generation for secure, stateless sessions.
  * **`interviewService.js`**: Handles database interactions (CRUD operations) for interviews. It saves AI-generated questions, records the user's answers, saves coding results, and stores final evaluation feedback.
  * **`pdfService.js`**: Downloads the user's uploaded PDF resume URL and extracts the raw text using the `pdf-parse` library so it can be fed to the AI context.
* **`prisma/`**: Contains the Prisma ORM configuration. `schema.prisma` defines the database tables (e.g., User, Interview, Answer).
* **`prismaClient.js`**: Initializes and exports the shared Prisma Database connection object.

### 2. The `frontend/` Directory (The User Interface)
The frontend generates the visual experience and communicates with the backend APIs. It uses the Next.js App Router, meaning folder structure maps directly to web URLs.

* **`app/`**: Represents the routing structure.
  * **`(auth)/`**: Route group containing authentication pages.
    * **`sign-in/` & `sign-up/`**: Forms for users to log in or register.
  * **`(root)/`**: Main route group wrapped in a standard shared layout.
    * **`page.tsx`**: The main landing page `/` (home page).
    * **`interview/`**: Contains subdirectories for the stages of the interview process:
      * **`create/`**: The setup page where users input a job description and upload their resume.
      * **`session/`**: The mockup interview interface. The AI asks questions sequentially, and the user submits their answers.
      * **`coding/`**: The technical coding round page featuring an integrated, syntax-highlighted code editor.
      * **`feedback/`**: The results dashboard that renders the AI's final evaluation (scores, strengths, weaknesses, hiring recommendation).
      * **`history/`**: A dashboard listing the user's past interviews and past performance.
* **`components/`**: Reusable UI elements (Buttons, Cards, Modals, Forms) built mainly with Tailwind CSS.

---

## The Complete User Journey Flow

Here is how data physically moves through the system during a mock interview session:

**1. Authentication:**
- A user arrives at the landing page (`frontend/app/(root)/page.tsx`) and clicks "Sign Up".
- They submit the registration form (`(auth)/sign-up`). The frontend makes a `POST /auth/register` HTTP request.
- `backend/index.js` routes this to `authService.js`, which saves the user to PostgreSQL via Prisma and returns a secure JWT token.

**2. Starting a New Interview:**
- The logged-in user navigates to `interview/create`. They upload their PDF resume (stored on ImageKit) or enter the role details manually, and can paste a job description.
- The frontend sends this via `POST /interviews`. The backend checks the user's interview limit (`GET /interviews/quota` shows it), extracts the resume text once with `pdfService.js`, and stores it with the new interview.
- The browser keeps only the interview id (`frontend/lib/currentInterview.ts`); everything else lives in the database.

**3. The Live Interview:**
- `interview/session` opens a Socket.IO connection (JWT required) and sends `interview:join`. The reply is the full interview state: transcript, time left, answers used.
- The opening greeting is fixed text. Each candidate answer is sent as `interview:answer`; `sessionService.js` stores it, makes exactly one model call against the stored transcript, stores the reply and returns the new state.
- The server owns the transcript and the clock, so a page refresh or reconnect re-joins and resumes where the candidate left off, at no model cost.
- The interview ends when the interviewer concludes, when the answer or time limit in `services/limits.js` is reached, or when the candidate hangs up (`interview:end`).

**4. The Coding Round (Optional):**
- `interview/coding` calls `POST /interviews/:id/coding/challenge`, which generates one challenge per interview and returns the stored one on every later call.
- `POST /interviews/:id/coding/run` evaluates the code with the model (a capped number of runs; unchanged code returns the stored result), `.../coding/submit` saves the final code, and `.../coding/skip` skips the round.

**5. Generating Final Feedback:**
- `interview/feedback` calls `POST /interviews/:id/feedback`. The backend builds the report from the stored transcript and coding round, saves it, and returns the saved report on every later call.

**AI provider:**
- All model calls go through `backend/services/llm/`, which picks the provider from `AI_API_KEY` / `AI_MODEL` (Anthropic through its SDK, everything else through the OpenAI-compatible API) and records token usage per interview and on `/monitor`.

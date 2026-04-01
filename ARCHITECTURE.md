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
- The logged-in user navigates to `interview/create`. They paste a target Job Description and upload their PDF Resume (managed via ImageKit, which gives back a direct URL).
- The frontend sends this data via a `POST /interviews` request to the backend.
- The `pdfService.js` fetches the PDF from the URL and extracts its raw text.
- The `aiService.js` sends the resume text and job description to the LLM with a strict prompt to generate role-specific interview questions.
- `interviewService.js` saves these questions to the database as a new interview record, and returns the ID to the frontend.

**3. The Q&A Session:**
- The user is redirected to the `interview/session` page, viewing the first generated question.
- As the user types their answers and proceeds, the frontend hits `PUT /interviews/:id/answers`. The backend's `interviewService.js` continuously records these answers in the database.

**4. The Coding Round (If Applicable):**
- Upon reaching the technical portion, the frontend loads `interview/coding`.
- It triggers `POST /generate-coding-question`. The AI generates a customized data-structures/algorithms problem based on the user's primary programming language.
- The user writes and submits code. The frontend calls `POST /evaluate-code`. The AI acts as a code evaluator to check correctness, time complexity, and edge cases.
- The code and the AI's technical evaluation result are saved to the database (`PUT /interviews/:id/coding`).

**5. Generating Final Feedback:**
- The user completes the interview. The frontend calls `PUT /interviews/:id/feedback`.
- The backend packages all the user's Q&A answers and coding results, sending them to `aiService.generateFeedback()`.
- The AI responds with a comprehensive review scorecard (strengths, actionable weaknesses, quantitative scores, and a hire/no-hire verdict).
- The user is routed to `interview/feedback` where the application beautifully renders their final results and statistics.

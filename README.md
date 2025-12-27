# AeroPrep - AI Interview Coach

<div align="center">
  <img src="frontend/public/ap.png" alt="AeroPrep Logo" width="120" />
  <br/>
  <h1>AeroPrep</h1>
  <p><strong>Master Your Technical Interviews with AI-Powered Precision</strong></p>
  
  <p>
    <a href="#key-features">Key Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#contributing">Contributing</a>
  </p>
</div>

<br/>

## 🚀 Overview

**AeroPrep** is a next-generation interview preparation platform designed to help software engineers, data scientists, and product managers ace their technical interviews. By leveraging advanced AI, AeroPrep simulates real-world interview scenarios and delivers detailed, actionable feedback on your performance.

Unlike generic question banks, AeroPrep creates a **personalized interview experience** based on your resume and target job role, acting as a dedicated 24/7 career mentor.

---

## ✨ Key Features

- **🤖 AI-Driven Simulations**: Adaptive interview scenarios tailored to your role.
- **📄 Resume Analysis**: Upload your PDF resume to generate tailored questions that match your actual experience.
- **💻 Coding Challenges**: Integrated code editor with live execution and AI evaluation for technical rounds.
- **📊 Detailed Feedback**: Comprehensive performance reports including:
  - communication clarity scores
  - technical accuracy
  - strengths & weaknesses analysis
  - "hire/no-hire" probablity

- **📱 Responsive Design**: Fully optimized experience across desktop and mobile devices.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS, Framer Motion (Animations), Lucide React (Icons)
- **State Management**: React Hooks & Context
- **Utilities**: `pdf-parse` (client-side text extraction)

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **AI Integration**: Google Gemini / OpenAI (configurable)
- **Storage**: PostgreSQL (via Prisma ORM) or local storage for demo mode
- **Security**: JWT Authentication

---

## 🚀 Getting Started

Follow these steps to set up the project locally.

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- PostgreSQL database (optional, for full persistence)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/aeroprep.git
   cd aeroprep
   ```

2. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   # Create .env.local file
   cp .env.example .env.local
   npm run dev
   ```

3. **Backend Setup**
   Open a new terminal:
   ```bash
   cd backend
   npm install
   # Create .env file with your API keys
   npm start
   ```

4. **Access the App**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---


## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---



<div align="center">
  <p>built with ❤️ by the AeroPrep Team</p>
  <p>© 2025 AeroPrep Inc. All rights reserved.</p>
</div>

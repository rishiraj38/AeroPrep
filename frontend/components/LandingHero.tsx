import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, Bot, CheckCircle2, Code2, FileText, Mic, MessagesSquare,
  PhoneOff, RotateCcw, ScrollText, Video, AlertCircle,
} from "lucide-react";
import { Footer } from "@/components/Footer";

const STEPS = [
  {
    icon: FileText,
    title: "Tell it who you are",
    body: "Upload your resume as a PDF, or type in the role and tech stack you are aiming for.",
  },
  {
    icon: Mic,
    title: "Talk to Alex",
    body: "A 15-minute spoken interview. Answer out loud or type. Vague answers get a follow-up, like in a real one.",
  },
  {
    icon: Code2,
    title: "Solve one problem",
    body: "An optional coding challenge in your main language, reviewed by the AI when you run it.",
  },
  {
    icon: ScrollText,
    title: "Read your report",
    body: "A score, a hire or no-hire call, and the specific answers that helped or hurt you.",
  },
];

const FEATURES = [
  {
    icon: FileText,
    title: "Questions from your own resume",
    body: "Alex asks about the projects and tools you actually listed, not a generic question bank.",
  },
  {
    icon: MessagesSquare,
    title: "Follow-ups, not a quiz",
    body: "Give a shallow answer and you get asked to go deeper. Give a solid one and the interview moves on.",
  },
  {
    icon: RotateCcw,
    title: "Nothing lost on a refresh",
    body: "Close the tab or lose your connection mid-interview and you pick up at the same question.",
  },
  {
    icon: ScrollText,
    title: "Every interview kept",
    body: "Your transcript, code and report stay in your history so you can see what changed between attempts.",
  },
];

// A still of the interview room, drawn in markup so the page ships no video
function InterviewPreview() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#202124] shadow-2xl shadow-primary-200/10 overflow-hidden">
      <div className="grid sm:grid-cols-[1fr_1.1fr]">
        <div className="relative flex flex-col items-center justify-center gap-3 bg-[#2d2e30] px-6 py-10">
          <span className="absolute left-4 top-4 font-mono text-sm font-bold text-gray-300">12:41</span>
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary-200 opacity-40 blur-2xl" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary-200 bg-[#1e293b]">
              <Bot className="h-9 w-9 text-primary-100" />
            </div>
          </div>
          <div className="flex items-end gap-1">
            {[10, 18, 10].map((height, i) => (
              <span key={i} className="w-1 rounded-full bg-primary-200" style={{ height }} />
            ))}
            <span className="ml-2 text-xs text-gray-400">Alex is speaking</span>
          </div>
        </div>

        <div className="space-y-3 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Live transcript</p>
          <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-white/10 bg-[#3C4043] px-3 py-2 text-sm leading-relaxed text-gray-100">
            You moved fraud scoring to an async consumer. What happens to a payment that was accepted and then flagged?
          </div>
          <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-sm bg-primary-300 px-3 py-2 text-sm leading-relaxed text-white">
            We hold the payout, write a compensating ledger entry, and notify the merchant.
          </div>
          <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-white/10 bg-[#3C4043] px-3 py-2 text-sm leading-relaxed text-gray-100">
            Good. How do you keep that reversal from running twice?
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-white/5 py-3">
        {[Mic, Video].map((Icon, i) => (
          <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3C4043] text-white">
            <Icon className="h-4 w-4" />
          </span>
        ))}
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white">
          <PhoneOff className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function ReportPreview() {
  return (
    <div className="rounded-2xl border border-white/10 bg-dark-200/70 p-6 sm:p-8">
      <div className="flex flex-wrap items-end gap-6 border-b border-white/5 pb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-light-400">Overall score</p>
          <p className="text-5xl font-bold text-white">72<span className="text-xl text-light-600">/100</span></p>
        </div>
        <span className="rounded-lg border border-primary-200/30 bg-primary-200/15 px-3 py-1.5 text-sm font-semibold text-primary-100">Hire</span>
        <div className="ml-auto flex gap-6 text-sm">
          <div><p className="text-light-400">Interview</p><p className="font-semibold text-white">78%</p></div>
          <div><p className="text-light-400">Coding</p><p className="font-semibold text-white">58%</p></div>
        </div>
      </div>
      <div className="grid gap-6 pt-6 sm:grid-cols-2">
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <CheckCircle2 className="h-4 w-4 text-success-100" /> Strengths
          </p>
          <p className="text-sm leading-relaxed text-light-400">
            Explained the idempotent webhook design clearly: advisory lock on the event id, ledger entry and outbox row in one transaction.
          </p>
        </div>
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <AlertCircle className="h-4 w-4 text-destructive-100" /> To improve
          </p>
          <p className="text-sm leading-relaxed text-light-400">
            Could not say what happens to a payment flagged after it was accepted. Prepare the failure path for every optimisation you claim.
          </p>
        </div>
      </div>
    </div>
  );
}

export function LandingHero() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-dark-100 font-sans text-white antialiased selection:bg-primary-200/30">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-300/25 via-dark-100 to-dark-100" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/ap.png" alt="" width={36} height={36} className="object-contain" priority />
          <span className="text-xl font-bold">AeroPrep</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          <Link href="/resources" className="hidden px-3 py-2 text-sm font-medium text-light-400 transition-colors hover:text-white sm:block">
            Prep library
          </Link>
          <Link href="/sign-in" className="px-3 py-2 text-sm font-medium text-light-400 transition-colors hover:text-white">
            Sign in
          </Link>
          <Link href="/sign-up" className="btn-primary">
            Get started
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1fr_1.05fr] lg:pt-16">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-light-400">
              <span className="h-1.5 w-1.5 rounded-full bg-success-100" /> 3 interviews free, no card needed
            </p>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Practise the interview
              <span className="block text-primary-200">before the interview.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-light-400">
              A spoken mock interview with an AI interviewer that has read your resume. Answer out loud, get real follow-up questions, and finish with a scored report.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/sign-up" className="btn-primary h-12 px-7 text-base">
                Start a free interview <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/sign-in" className="btn-secondary h-12 px-7 text-base">
                I have an account
              </Link>
            </div>
          </div>
          <InterviewPreview />
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How a session goes</h2>
          <p className="mt-3 max-w-2xl text-light-400">About twenty minutes from start to report.</p>
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-white/10 bg-dark-200/60 p-6">
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-200/15 text-primary-200">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-sm text-light-600">0{i + 1}</span>
                </div>
                <h3 className="mb-2 font-semibold text-white">{step.title}</h3>
                <p className="text-sm leading-relaxed text-light-400">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Report */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Feedback that quotes you</h2>
            <p className="mt-4 leading-relaxed text-light-400">
              The report is written from your own transcript. It points at the answer that earned the score and the one that cost you, so you know exactly what to prepare next time.
            </p>
          </div>
          <ReportPreview />
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Built to feel like the real thing</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex gap-4 rounded-2xl border border-white/10 bg-dark-200/60 p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-200/15 text-primary-200">
                  <feature.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="mb-1.5 font-semibold text-white">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-light-400">{feature.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-6 pb-24 pt-10">
          <div className="card-cta flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">Your first three interviews are free.</h2>
              <p className="mt-2 text-light-100/80">Create an account and be in the interview room in under a minute.</p>
            </div>
            <Link href="/sign-up" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-white px-7 text-base font-semibold text-primary-300 transition-colors hover:bg-primary-100">
              Start a free interview <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

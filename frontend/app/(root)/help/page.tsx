"use client";

import React from 'react';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { Mail, HelpCircle, Hammer, Ticket } from 'lucide-react';
import { SUPPORT_EMAIL, supportMailto } from '@/lib/contact';

// What we would like to build next. Listed so anyone who wants to help knows where to start.
const IDEAS = [
  { title: 'Run code for real', body: 'The coding round is judged by the AI. Running solutions against test cases in a sandbox would make the result exact.' },
  { title: 'A more human voice', body: 'Alex speaks with the browser\'s built-in voice. A proper text-to-speech voice would make the interview feel far more real.' },
  { title: 'Faster replies', body: 'Streaming Alex\'s answer as it is written, and speaking it sentence by sentence, would cut the pause after each answer.' },
  { title: 'More kinds of interview', body: 'System design rounds, behavioural-only rounds, and tracks for data, product and DevOps roles.' },
  { title: 'Company-style interviews', body: 'Question styles modelled on how specific companies interview, such as leadership-principle rounds.' },
  { title: 'Progress over time', body: 'Charts of your scores across interviews and the weaknesses that keep coming up.' },
  { title: 'Email verification', body: 'Confirming email addresses at sign-up, plus password reset.' },
  { title: 'Tests', body: 'An automated test suite so changes can ship with confidence.' },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen p-8 pt-20">
      <div className="max-w-4xl mx-auto space-y-12">

        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
            Help & Support
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Questions, problems, or out of interviews? Write to us and a person will answer.
          </p>
        </div>

        {/* Contact */}
        <div className="grid md:grid-cols-2 gap-6">
          <a href={supportMailto('AeroPrep support')} className="p-6 rounded-xl bg-card border hover:border-primary/50 transition-colors group">
            <Mail className="h-8 w-8 text-primary mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold mb-2">Email Support</h3>
            <p className="text-sm text-muted-foreground mb-4">Something not working, or a question about your account.</p>
            <span className="text-primary text-sm font-medium group-hover:underline break-all">{SUPPORT_EMAIL}</span>
          </a>

          <a href={supportMailto('More AeroPrep interviews')} className="p-6 rounded-xl bg-card border hover:border-primary/50 transition-colors group">
            <Ticket className="h-8 w-8 text-purple-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold mb-2">Need more interviews?</h3>
            <p className="text-sm text-muted-foreground mb-4">Used your free interviews? Email us from your account&apos;s address and ask for more.</p>
            <span className="text-purple-400 text-sm font-medium group-hover:underline break-all">{SUPPORT_EMAIL}</span>
          </a>
        </div>

        {/* FAQ Section */}
        <div className="bg-card/50 border rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <HelpCircle className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-semibold">Frequently Asked Questions</h2>
          </div>

          <Accordion className="space-y-1">
            <AccordionItem title="How many interviews do I get?">
              Every account can start 3 interviews for free. An interview is counted when you give your first answer, so opening one and leaving does not use it up. If you need more, email {SUPPORT_EMAIL}.
            </AccordionItem>

            <AccordionItem title="What happens if I refresh or lose my connection?">
              Nothing is lost. Your interview is stored on our server as you go. Open the page again and you can resume at the question you were on; the clock keeps running while you are away.
            </AccordionItem>

            <AccordionItem title="How does the scoring work?">
              When the interview ends, an AI model reads the full transcript and your coding round and writes the report: scores, strengths, weaknesses and a hire or no-hire call. It is a practice tool, so treat the score as a guide rather than a verdict.
            </AccordionItem>

            <AccordionItem title="How is my code checked?">
              Your solution is reviewed by the AI, which reasons about whether it handles the test cases. It is not executed, so an occasional wrong call is possible. You get 5 checks per challenge.
            </AccordionItem>

            <AccordionItem title="What happens to my resume?">
              Your PDF is stored with our file host, and its text is sent to our AI provider so the interviewer can ask about your experience. We use it only to run your interviews.
            </AccordionItem>

            <AccordionItem title="Voice input is not working. What can I do?">
              Voice input needs Chrome or Edge and microphone permission. In any browser you can type your answers instead; the interview works the same way.
            </AccordionItem>
          </Accordion>
        </div>

        {/* Help build */}
        <div className="bg-card/50 border rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-2">
            <Hammer className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-semibold">Help build AeroPrep</h2>
          </div>
          <p className="text-muted-foreground mb-6">
            AeroPrep is an independent project and there is a lot we still want to do. If you can help with any of these, or have a better idea, we would love to hear from you.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {IDEAS.map((idea) => (
              <div key={idea.title} className="rounded-xl border border-border/60 bg-background/40 p-4">
                <h3 className="font-medium mb-1">{idea.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{idea.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
            <a href={supportMailto('Helping build AeroPrep')} className="btn-primary">
              <Mail className="h-4 w-4" /> Get in touch
            </a>
            <span className="text-muted-foreground break-all">{SUPPORT_EMAIL}</span>
          </div>
        </div>

      </div>
    </div>
  );
}

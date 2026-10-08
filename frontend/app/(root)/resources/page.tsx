import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Building2, BookOpen, MessagesSquare, Network, Play } from 'lucide-react';

// Each link was checked when this page was written. They point at the companies' own
// hiring pages and at long-standing community material.
const SECTIONS = [
  {
    icon: Building2,
    title: 'Straight from the companies',
    blurb: 'How the big names say they interview, in their own words. Read the one for the company you are targeting first.',
    links: [
      { name: 'Google — How we hire', href: 'https://www.google.com/about/careers/applications/how-we-hire/', note: 'The stages of Google\'s process and what each one looks for.' },
      { name: 'Google — Interview tips', href: 'https://www.google.com/about/careers/applications/interview-tips/', note: 'Google\'s own advice for coding and behavioural rounds.' },
      { name: 'Google Tech Dev Guide', href: 'https://techdevguide.withgoogle.com/', note: 'Google\'s free learning paths, including past interview questions with worked solutions.' },
      { name: 'Amazon — The interview loop', href: 'https://www.amazon.jobs/content/en/how-we-hire/interview-loop', note: 'What happens in an Amazon loop and how to prepare for it.' },
      { name: 'Amazon — Leadership Principles', href: 'https://www.amazon.jobs/content/en/our-workplace/leadership-principles', note: 'Amazon\'s behavioural questions are built around these. Have a story for each.' },
      { name: 'Microsoft — Interview tips', href: 'https://careers.microsoft.com/v2/global/en/hiring-tips/interview-tips.html', note: 'Microsoft\'s guidance on preparing and on the day itself.' },
    ],
  },
  {
    icon: Play,
    title: 'Watch a real one',
    blurb: 'Seeing someone else think out loud is the fastest way to learn the format.',
    links: [
      { name: 'Google — Example coding interview', href: 'https://www.youtube.com/watch?v=XKu_SEDAykw', note: 'Two Google engineers run a full mock coding interview and explain what the interviewer is looking for.' },
      { name: 'interviewing.io — Mock interview recordings', href: 'https://interviewing.io/mocks', note: 'Recorded mock interviews with engineers from large tech companies, with their feedback.' },
    ],
  },
  {
    icon: MessagesSquare,
    title: 'What candidates say it was like',
    blurb: 'First-hand accounts of recent interviews: the questions asked, the rounds, and what happened.',
    links: [
      { name: 'LeetCode — Interview experiences', href: 'https://leetcode.com/discuss/interview-experience', note: 'Candidates post their rounds and questions, tagged by company.' },
      { name: 'GeeksforGeeks — Company interview corner', href: 'https://www.geeksforgeeks.org/company-interview-corner/', note: 'A large archive of interview experiences organised by company.' },
      { name: 'interviewing.io — Hiring process guides', href: 'https://interviewing.io/guides/hiring-process', note: 'Company-by-company guides to the process at the largest tech employers.' },
      { name: 'Levels.fyi', href: 'https://www.levels.fyi/', note: 'Compensation and level data, useful once you reach the offer stage.' },
    ],
  },
  {
    icon: BookOpen,
    title: 'Coding practice',
    blurb: 'Structured problem lists beat random grinding.',
    links: [
      { name: 'Tech Interview Handbook', href: 'https://www.techinterviewhandbook.org/', note: 'A free, well-organised guide to the whole process, from resume to negotiation.' },
      { name: 'NeetCode roadmap', href: 'https://neetcode.io/roadmap', note: 'Problems grouped by pattern, in a sensible order, with video explanations.' },
      { name: 'LeetCode — Top Interview 150', href: 'https://leetcode.com/studyplan/top-interview-150/', note: 'LeetCode\'s own list of the most commonly asked problems.' },
      { name: 'Coding Interview University', href: 'https://github.com/jwasham/coding-interview-university', note: 'A complete self-study plan for the computer science behind the questions.' },
    ],
  },
  {
    icon: Network,
    title: 'System design and behavioural',
    blurb: 'The rounds that decide level, and the ones people prepare least for.',
    links: [
      { name: 'The System Design Primer', href: 'https://github.com/donnemartin/system-design-primer', note: 'The standard free reference for designing large systems, with worked examples.' },
      { name: 'Hello Interview — System design in a hurry', href: 'https://www.hellointerview.com/learn/system-design/in-a-hurry/introduction', note: 'A compact framework for structuring a system design answer.' },
      { name: 'Tech Interview Handbook — Behavioural interviews', href: 'https://www.techinterviewhandbook.org/behavioral-interview/', note: 'How to prepare stories and answer the common behavioural questions.' },
    ],
  },
];

export default function ResourcesPage() {
  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-white">Interview prep library</h1>
        <p className="mt-3 text-light-400 max-w-2xl">
          The best free material we know of for interviews at Google, Amazon, Microsoft and other large tech companies. Read up here, then{' '}
          <Link href="/interview/create" className="text-primary-200 hover:underline">practise it out loud</Link>.
        </p>

        <div className="mt-10 space-y-12">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <div className="flex items-center gap-3 mb-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-200/15 text-primary-200">
                  <section.icon className="h-5 w-5" />
                </span>
                <h2 className="text-xl font-semibold text-white">{section.title}</h2>
              </div>
              <p className="text-sm text-light-400 mb-5">{section.blurb}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {section.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-xl border border-white/10 bg-dark-200/60 p-5 transition-colors hover:border-primary-200/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium text-white group-hover:text-primary-200 transition-colors">{link.name}</h3>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-light-600 group-hover:text-primary-200 transition-colors" />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-light-400">{link.note}</p>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-12 text-xs text-light-600">
          These are independent websites. AeroPrep is not affiliated with any of them or with the companies named.
        </p>
      </div>
    </div>
  );
}

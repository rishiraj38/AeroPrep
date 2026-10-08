import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Github, Linkedin, Mail } from "lucide-react";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/contact";

const LINKS = [
  { label: "Prep library", href: "/resources" },
  { label: "Help & support", href: "/help" },
  { label: "Sign in", href: "/sign-in" },
  { label: "Create an account", href: "/sign-up" },
];

export const Footer = () => {
  return (
    <footer className="relative z-10 border-t border-white/5 bg-black/60 backdrop-blur-md py-12">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Logo size="sm" />
              <span className="text-2xl font-bold text-white">AeroPrep</span>
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              Spoken mock interviews with an AI interviewer that has read your resume. An independent project, free to try.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://github.com/rishiraj38/AeroPrep" target="_blank" rel="noopener noreferrer" aria-label="AeroPrep on GitHub" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                <Github className="w-4 h-4" />
              </a>
              <a href="https://www.linkedin.com/in/rishi-raj-3488432ab/" target="_blank" rel="noopener noreferrer" aria-label="The author on LinkedIn" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                <Linkedin className="w-4 h-4" />
              </a>
              <a href={supportMailto("AeroPrep")} aria-label={`Email ${SUPPORT_EMAIL}`} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          <nav aria-label="Footer">
            <ul className="space-y-3 text-sm text-gray-400">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-primary-200 transition-colors">{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="mt-10 pt-8 border-t border-white/5 text-sm text-gray-500">
          © {new Date().getFullYear()} AeroPrep. Open source on GitHub.
        </p>
      </div>
    </footer>
  );
};

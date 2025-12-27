import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Github, Twitter, Linkedin } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="relative z-10 border-t border-white/5 bg-black/60 backdrop-blur-md pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand Column */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Logo size="sm" />
              <span className="text-2xl font-bold text-white">AeroPrep</span>
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              The advanced flight simulator for your technical interview preparation. Master algorithms, system design, and behavioral rounds with AI.
            </p>
            <div className="flex items-center gap-4">
              <Link href="#" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                <Twitter className="w-4 h-4" />
              </Link>
              <Link href="https://github.com/rishiraj38" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                <Github className="w-4 h-4" />
              </Link>
              <Link href="https://www.linkedin.com/in/rishi-raj-3488432ab/" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                <Linkedin className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Links Column 1 */}
          <div>
            <h4 className="text-white font-semibold mb-6">Product</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li><Link href="#" className="hover:text-primary-200 transition-colors">Features</Link></li>
              <li><Link href="#" className="hover:text-primary-200 transition-colors">Pricing</Link></li>
              <li><Link href="#" className="hover:text-primary-200 transition-colors">Interview Questions</Link></li>
              <li><Link href="#" className="hover:text-primary-200 transition-colors">Success Stories</Link></li>
            </ul>
          </div>

          {/* Links Column 2 */}
          <div>
            <h4 className="text-white font-semibold mb-6">Resources</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li><Link href="#" className="hover:text-primary-200 transition-colors">Blog</Link></li>
              <li><Link href="#" className="hover:text-primary-200 transition-colors">Community</Link></li>
              <li><Link href="#" className="hover:text-primary-200 transition-colors">Cheatsheets</Link></li>
              <li><Link href="#" className="hover:text-primary-200 transition-colors">Help Center</Link></li>
            </ul>
          </div>

          {/* Links Column 3 */}
          <div>
            <h4 className="text-white font-semibold mb-6">Company</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li><Link href="#" className="hover:text-primary-200 transition-colors">About Us</Link></li>
              <li><Link href="#" className="hover:text-primary-200 transition-colors">Careers</Link></li>
              <li><Link href="#" className="hover:text-primary-200 transition-colors">Privacy Policy</Link></li>
              <li><Link href="#" className="hover:text-primary-200 transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} AeroPrep Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="w-2 h-2 rounded-full bg-primary-200 animate-pulse"></span>
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  );
};

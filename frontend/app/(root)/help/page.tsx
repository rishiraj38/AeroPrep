"use client";

import React from 'react';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { Mail, MessageSquare, Shield, HelpCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

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
            Have questions? We're here to help. Explore our FAQs or reach out to our support team directly.
          </p>
        </div>

        {/* Quick Links */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl bg-card border hover:border-primary/50 transition-colors group cursor-pointer">
            <Mail className="h-8 w-8 text-primary mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold mb-2">Email Support</h3>
            <p className="text-sm text-muted-foreground mb-4">Get in touch with our team for personalized assistance.</p>
            <Link href="mailto:support@aeroprep.com" className="text-primary text-sm font-medium hover:underline">
              rishiraj438gt@gmail.com
            </Link>
          </div>
          
          <div className="p-6 rounded-xl bg-card border hover:border-primary/50 transition-colors group cursor-pointer">
            <MessageSquare className="h-8 w-8 text-purple-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold mb-2">Feedback</h3>
            <p className="text-sm text-muted-foreground mb-4">Share your thoughts on how we can improve AeroPrep.</p>
            <Button variant="link" className="p-0 h-auto text-purple-500 hover:text-purple-400">
              Submit Feedback
            </Button>
          </div>

          <div className="p-6 rounded-xl bg-card border hover:border-primary/50 transition-colors group cursor-pointer">
            <Shield className="h-8 w-8 text-green-500 mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold mb-2">Privacy & Terms</h3>
            <p className="text-sm text-muted-foreground mb-4">Read about how we protect your data and usage policies.</p>
            <div className="flex gap-4 text-sm">
                <Link href="#" className="text-muted-foreground hover:text-foreground">Privacy</Link>
                <Link href="#" className="text-muted-foreground hover:text-foreground">Terms</Link>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="bg-card/50 border rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <HelpCircle className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-semibold">Frequently Asked Questions</h2>
          </div>
          
          <Accordion className="space-y-1">
            <AccordionItem title="How does the AI grading work?">
              Our AI analyzes your responses based on several key metrics: clarity, technical accuracy, relevance, and completeness. It compares your answers against industry-standard best practices and generates a score along with detailed feedback to help you improve.
            </AccordionItem>
            
            <AccordionItem title="Is my resume data secure?">
              Yes, absolutely. Your resume is processed solely for the purpose of generating relevant interview questions. We do not share your personal data with third parties, and all uploaded files are handled with strict security protocols.
            </AccordionItem>
            
            <AccordionItem title="Can I retry an interview?">
              Currently, each interview session is unique. However, you can start a new interview at any time with the same or different settings. We are working on a feature to allow "rematches" for specific questions!
            </AccordionItem>
            
            <AccordionItem title="What programming languages are supported?">
              For the coding round, we support most major languages including JavaScript, Python, Java, C++, and TypeScript. You can select your preferred language before starting the challenge.
            </AccordionItem>

            <AccordionItem title="Is AeroPrep free to use?">
                AeroPrep offers both free and premium tiers. The free tier allows for a limited number of practice interviews per month. Upgrading to Premium unlocks unlimited interviews, advanced analytics, and priority support.
            </AccordionItem>
          </Accordion>
        </div>

        {/* Contact Footer */}
        <div className="text-center pt-8 border-t border-border/50">
            <p className="text-muted-foreground">
                Still can't find what you're looking for? <Link href="mailto:support@aeroprep.com" className="text-foreground font-medium underline">Contact us</Link>
            </p>
        </div>

      </div>
    </div>
  );
}

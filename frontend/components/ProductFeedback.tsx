"use client";

import React, { useState } from 'react';
import { Star, Loader2, CheckCircle } from 'lucide-react';
import { sendProductFeedback } from '@/lib/api';

// Shown under the interview report: a rating and an optional note about AeroPrep itself
export default function ProductFeedback({ interviewId }: { interviewId: number | null }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!rating || status === 'sending') return;
    setStatus('sending');
    setError('');
    try {
      await sendProductFeedback(rating, message, interviewId);
      setStatus('sent');
    } catch (err: any) {
      setError(err.message || 'Could not send your feedback. Please try again.');
      setStatus('idle');
    }
  };

  if (status === 'sent') {
    return (
      <div className="card p-8 flex items-center gap-3 text-light-100">
        <CheckCircle className="h-5 w-5 text-success-100 shrink-0" />
        Thank you. Your feedback goes straight to the people building AeroPrep.
      </div>
    );
  }

  return (
    <div className="card p-8">
      <h3 className="font-bold text-white mb-1">How was this interview?</h3>
      <p className="text-sm text-light-400 mb-5">Tell us what felt right and what did not. It takes ten seconds and we read every one.</p>

      <div className="flex gap-1 mb-5" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} out of 5`}
            onClick={() => setRating(value)}
            onMouseEnter={() => setHovered(value)}
            onMouseLeave={() => setHovered(0)}
            className="p-1 cursor-pointer"
          >
            <Star className={`h-7 w-7 transition-colors ${value <= (hovered || rating) ? 'fill-yellow-400 text-yellow-400' : 'text-light-600'}`} />
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={2000}
        placeholder="Anything we should fix or add? (optional)"
        className="w-full min-h-[90px] rounded-lg border border-white/10 bg-dark-300/30 p-3 text-sm text-white placeholder:text-light-600 focus:border-primary-200 focus:outline-none"
      />

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button onClick={submit} disabled={!rating || status === 'sending'} className="btn-primary mt-4 cursor-pointer">
        {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
        Send feedback
      </button>
    </div>
  );
}

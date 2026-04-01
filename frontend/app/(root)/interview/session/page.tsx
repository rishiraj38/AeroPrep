"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getToken, getUser } from '@/lib/auth';
import { io, Socket } from 'socket.io-client';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Loader2, Code2, CheckCircle, SkipForward, Play
} from 'lucide-react';

// ─── Config ──────────────────────────────────────────────────────────────────
const SOCKET_URL           = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
const INTERVIEW_SECS       = 5 * 60;   // 5-minute interview
const WARN_AT_SECS         = 30;       // block mic + ask AI to wrap up

// ─── Types ───────────────────────────────────────────────────────────────────
interface Msg { speaker: 'ai' | 'user'; text: string; }

// ─── Component ───────────────────────────────────────────────────────────────
export default function InterviewSessionPage() {
  const router = useRouter();

  // meta
  const [meetingCode,  setMeetingCode]  = useState('');
  const [interviewId,  setInterviewId]  = useState<number | null>(null);
  const [userName,     setUserName]     = useState('there');

  // phase: joining → active → finished
  const [phase, setPhase] = useState<'loading'|'joining'|'active'|'finished'>('loading');

  // chat
  const [transcript,   setTranscript]   = useState<Msg[]>([]);
  const [userAnswer,   setUserAnswer]   = useState('');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isThinking,   setIsThinking]   = useState(false);
  const [isListening,  setIsListening]  = useState(false);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [canEndCall,   setCanEndCall]   = useState(false);

  // timer
  const [secsLeft,     setSecsLeft]     = useState(INTERVIEW_SECS);
  const [timerActive,  setTimerActive]  = useState(false);
  const warnFiredRef   = useRef(false);
  const timerRef       = useRef<NodeJS.Timeout | null>(null);

  // hardware
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const micEnabledRef = useRef(true);

  // post-interview
  const [showCodingChoice, setShowCodingChoice] = useState(false);
  const [isNavigating,     setIsNavigating]     = useState(false);
  const [isSaving,         setIsSaving]         = useState(false);

  // refs
  const videoRef        = useRef<HTMLVideoElement>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const recognitionRef  = useRef<any>(null);
  const synthRef        = useRef<SpeechSynthesis | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const socketRef       = useRef<Socket | null>(null);
  const transcriptRef   = useRef<Msg[]>([]);
  const questionsRef    = useRef(0);
  const submittingRef   = useRef(false);
  const finishedRef     = useRef(false);
  const finalTranscriptRef = useRef(''); // persists STT finalised text across rec restarts

  // keep refs synced
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { questionsRef.current = questionsAsked; }, [questionsAsked]);

  // auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, isThinking]);

  // Speech helpers 
  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch (_) {}
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || !micEnabledRef.current) return;
    try { recognitionRef.current.start(); setIsListening(true); } catch (_) {}
  }, []);

  const speak = useCallback((text: string, onDone?: () => void) => {
    if (!synthRef.current) { onDone?.(); return; }
    synthRef.current.cancel();
    setTimeout(() => {
      if (!synthRef.current) { onDone?.(); return; }
      const utt = new SpeechSynthesisUtterance(text);
      const v = synthRef.current.getVoices();
      const voice = v.find(x => x.lang.startsWith('en-US') && x.name.includes('Google'))
        || v.find(x => x.lang.startsWith('en'));
      if (voice) utt.voice = voice;
      utt.onstart = () => { setIsAiSpeaking(true); stopListening(); };
      utt.onend   = () => {
        setIsAiSpeaking(false);
        if (micEnabledRef.current) startListening();
        onDone?.();
      };
      synthRef.current!.speak(utt);
    }, 80);
  }, [stopListening, startListening]);

  // Add message 
  const addMsg = useCallback((speaker: 'ai'|'user', text: string) => {
    setTranscript(prev => {
      const next = [...prev, { speaker, text }];
      transcriptRef.current = next;
      return next;
    });
  }, []);

  // Emit message to backend via socket 
  const callAI = useCallback((timeExpiring = false) => {
    const sock = socketRef.current;
    if (!sock?.connected) return;
    const id          = localStorage.getItem('interviewId') || '';
    const resumeText  = localStorage.getItem('resumeText')  || '';
    const jobDesc     = localStorage.getItem('jobDescription') || '';
    sock.emit('interview:message', {
      interviewId:         id ? Number(id) : null,
      conversationHistory: transcriptRef.current,
      questionsAsked:      questionsRef.current,
      timeExpiring,
      resumeText,
      jobDescription:      jobDesc,
    });
  }, []);

  // Finish interview 
  const finishInterview = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase('finished');
    setIsSaving(true);
    stopListening();
    synthRef.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());

    // ALWAYS save transcript to localStorage (feedback page needs this)
    localStorage.setItem('interviewTranscript', JSON.stringify(transcriptRef.current));
    // Clear stale cached feedback so fresh analysis always runs
    localStorage.removeItem('generatedFeedback');

    // Also save to DB via socket if authenticated
    const idStr = localStorage.getItem('interviewId') || '';
    const tok   = getToken();
    if (isAuthenticated() && idStr && tok && socketRef.current?.connected) {
      socketRef.current.emit('interview:save', {
        interviewId: Number(idStr),
        transcript:  transcriptRef.current,
      });
      // Give it 2s then proceed regardless
      await new Promise(r => setTimeout(r, 2000));
    }

    socketRef.current?.disconnect();
    setIsSaving(false);
    setShowCodingChoice(true);
  }, [stopListening]);

  // Countdown timer 
  useEffect(() => {
    if (!timerActive) return;
    timerRef.current = setInterval(() => {
      setSecsLeft(prev => {
        const next = prev - 1;

        // 30s remaining: block mic + ask AI to wrap up
        if (next === WARN_AT_SECS && !warnFiredRef.current) {
          warnFiredRef.current = true;
          micEnabledRef.current = false;
          setMicEnabled(false);
          stopListening();
          setTimeout(() => callAI(true), 500);
        }

        // 5s remaining: guaranteed farewell even if AI didn't wrap up in time
        if (next === 5 && !canEndCall) {
          synthRef.current?.cancel();
          speak('Thank you so much for joining today. It was great speaking with you. Hope you have a wonderful day ahead. Goodbye!');
          setCanEndCall(true);
        }

        if (next <= 0) {
          clearInterval(timerRef.current!);
          finishInterview();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive]);

  // Submit user answer 
  const ABUSE_WORDS = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'damn you', 'idiot', 'stupid', 'moron', 'screw you', 'hate you', 'kill', 'abuse'];

  const submitAnswer = useCallback(() => {
    const ans = userAnswer.trim();
    if (!ans || submittingRef.current || isAiSpeaking || isThinking) return;

    // Abuse detection — client-side fast path
    const isAbusive = ABUSE_WORDS.some(w => ans.toLowerCase().includes(w));
    if (isAbusive) {
      addMsg('user', ans);
      setUserAnswer('');
      const terminationMsg = "I cannot move forward with this behaviour. I will be reporting this session and ending the call now.";
      addMsg('ai', terminationMsg);
      speak(terminationMsg, () => setTimeout(() => finishInterview(), 3000));
      return;
    }

    submittingRef.current = true;
    stopListening();
    synthRef.current?.cancel();
    addMsg('user', ans);
    setUserAnswer('');
    finalTranscriptRef.current = ''; // reset STT buffer for the next answer
    setTimeout(() => {
      submittingRef.current = false;
      callAI(false);
    }, 200);
  }, [userAnswer, isAiSpeaking, isThinking, stopListening, addMsg, callAI]);

  // Speech recognition 
  useEffect(() => {
    if (typeof window === 'undefined') return;
    synthRef.current = window.speechSynthesis;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    let finalTranscript = '';  // local copy
    let silT: NodeJS.Timeout;
    let restartLock = false;

    const createRec = () => {
      const rec = new SR();
      rec.continuous    = true;
      rec.interimResults = true;
      rec.lang          = 'en-US';
      rec.maxAlternatives = 1;

      rec.onresult = (e: any) => {
        if (!micEnabledRef.current) return;
        let interimTranscript = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            finalTranscript += t + ' ';
            finalTranscriptRef.current = finalTranscript; // keep ref in sync
          } else {
            interimTranscript += t;
          }
        }

        const combined = (finalTranscript + interimTranscript).trim();
        if (combined) {
          setUserAnswer(combined);
          clearTimeout(silT);
          silT = setTimeout(() => {
            // Only auto-submit after 8s of silence AND at least 5 words spoken
            if (finalTranscript.trim().split(/\s+/).length >= 5) {
              document.getElementById('hs')?.click();
            }
          }, 8000);
        }
      };

      rec.onerror = (e: any) => {
        // 'no-speech' and 'aborted' are normal — just restart silently
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        console.warn('[STT] Error:', e.error);
      };

      rec.onend = () => {
        if (!micEnabledRef.current || restartLock) return;
        restartLock = true;
        setTimeout(() => {
          restartLock = false;
          if (!micEnabledRef.current) return;
          try {
            // Carry over accumulated text across restart
            finalTranscript = finalTranscriptRef.current;
            const newRec = createRec();
            recognitionRef.current = newRec;
            newRec.start();
          } catch (_) {}
        }, 200);
      };

      return rec;
    };

    const rec = createRec();
    recognitionRef.current = rec;
  }, []);


  // Cleanup on unmount 
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      try { recognitionRef.current?.stop(); } catch (_) {}
      synthRef.current?.cancel();
      if (timerRef.current) clearInterval(timerRef.current);
      socketRef.current?.disconnect();
    };
  }, []);

  // Boot: connect socket, join session   
  useEffect(() => {
    const token   = getToken();           // ← uses 'auth_token' key from auth.ts
    const idStr   = localStorage.getItem('interviewId');
    const resume  = localStorage.getItem('resumeText') || '';
    const job     = localStorage.getItem('jobDescription') || '';

    // Redirect if no interview data at all
    if (!idStr && !resume && !job) { router.push('/interview/create'); return; }
    if (idStr) setInterviewId(Number(idStr));
    setMeetingCode(`INT-${(idStr || '0000').padStart(4, '0')}`);

    const user = getUser();
    if (user?.name) setUserName(user.name.split(' ')[0]);

    if (!token) { router.push('/sign-in'); return; }

    setPhase('joining');

    // Connect socket with correct token
    const sock = io(SOCKET_URL, {
      auth:        { token },
      transports:  ['websocket', 'polling'],
    });
    socketRef.current = sock;

    // AI thinking indicator
    sock.on('interview:thinking', (val: boolean) => {
      setIsThinking(val);
    });

    // AI reply received
    sock.on('interview:reply', ({ text }: { text: string }) => {
      // Detect abuse termination signal from AI
      if (text.includes('[INTERVIEW_TERMINATED]')) {
        const cleanText = text.replace('[INTERVIEW_TERMINATED]', '').trim();
        addMsg('ai', cleanText);
        speak(cleanText, () => setTimeout(() => finishInterview(), 3000));
        return;
      }

      addMsg('ai', text);

      // Count as a main question if it contains a question mark
      if (text.includes('?')) setQuestionsAsked(q => q + 1);

      // Detect wrap-up signal → show green hint and auto-end after speaking
      const wrapKw = ['red end-call button', 'end the call', 'end-call button', 'red button', 'thank you so much for your time', 'pleasure speaking', 'concludes our', 'click the red'];
      if (wrapKw.some(k => text.toLowerCase().includes(k))) {
        setCanEndCall(true);
        speak(text, () => setTimeout(() => finishInterview(), 8000));
      } else {
        speak(text);
      }
    });

    sock.on('interview:saved', () => {
      console.log('[Socket] answers saved');
    });

    sock.on('interview:error', (msg: string) => {
      console.error('[Socket] error:', msg);
      setIsThinking(false);
    });

    // Everything boots AFTER socket confirms connection
    sock.on('connect', async () => {
      console.log('[Socket] connected', sock.id);

      // Start camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch { setCamEnabled(false); }

      setPhase('active');

      // Fire greeting — empty history; AI greets and asks first question
      // Using a short delay just so the avatar fade transition finishes
      setTimeout(() => {
        sock.emit('interview:message', {
          interviewId:         idStr ? Number(idStr) : null,
          conversationHistory: [],
          questionsAsked:      0,
          timeExpiring:        false,
          resumeText:          resume,
          jobDescription:      job,
        });
        
        // Start countdown 8s later (covers greeting TTS playback)
        setTimeout(() => setTimerActive(true), 8000);
      }, 500);
    });

    sock.on('connect_error', (err) => {
      console.error('[Socket] connection error', err.message);
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hardware toggles 
  const toggleMic = () => {
    const next = !micEnabled;
    setMicEnabled(next);
    micEnabledRef.current = next;
    if (next) startListening(); else stopListening();
  };

  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !camEnabled; });
    setCamEnabled(c => !c);
  };

  // Timer display 
  const mins = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const secs = String(secsLeft % 60).padStart(2, '0');
  const isWarning = secsLeft <= WARN_AT_SECS && timerActive;

  // Post-interview screen 
  if (showCodingChoice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950">
        <div className="max-w-xl w-full bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <Code2 className="h-16 w-16 text-primary mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-4 text-white">Interview Complete! 🎉</h2>
          <p className="text-gray-400 mb-8">Great job! Would you like to proceed to the coding challenge?</p>
          <div className="flex flex-col gap-4">
            <Button onClick={() => { setIsNavigating(true); router.push('/interview/coding'); }}
              size="lg" disabled={isNavigating}
              className="w-full py-6 text-lg bg-green-600 hover:bg-green-700 cursor-pointer text-white">
              {isNavigating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-5 w-5" />}
              Yes, Take Coding Round
            </Button>
            <Button onClick={() => {
              setIsNavigating(true);
              localStorage.setItem('codingResult', JSON.stringify({ passed: false, feedback: 'Skipped', skipped: true }));
              localStorage.setItem('codingChallenge', JSON.stringify({ title: 'Skipped' }));
              localStorage.setItem('codingCode', '// Skipped');
              router.push('/interview/feedback');
            }} variant="outline" size="lg" disabled={isNavigating}
              className="w-full py-6 text-lg cursor-pointer border-gray-700 text-gray-300 hover:bg-gray-800">
              {isNavigating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SkipForward className="mr-2 h-5 w-5" />}
              Skip &amp; View Feedback
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'loading') return null;

  // Main UI 
  return (
    <div className="fixed inset-0 z-50 bg-[#202124] text-white flex flex-col font-sans overflow-hidden select-none">

      {/* Main canvas */}
      <div className="flex-1 flex p-3 gap-3 pb-0 min-h-0">

        {/* Center stage */}
        <div className="flex-1 flex items-center justify-center bg-[#2d2e30] rounded-xl relative overflow-hidden border border-white/5 shadow-2xl">

          {phase === 'joining' ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
              <p className="text-gray-300 text-lg">Interviewer is joining…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {/* Avatar */}
              <div className="relative">
                <div className={`absolute inset-0 rounded-full blur-2xl transition-all duration-500 bg-blue-500 ${isAiSpeaking ? 'opacity-50 scale-150' : 'opacity-10 scale-100'}`} />
                <div className={`relative w-36 h-36 rounded-full border-4 overflow-hidden shadow-2xl z-10 transition-all duration-300 ${isAiSpeaking ? 'border-blue-400 shadow-blue-500/40' : 'border-white/10'}`}>
                  <img src="https://api.dicebear.com/7.x/bottts/svg?seed=AeroPrep&backgroundColor=1e293b"
                    alt="AI" className={`w-full h-full object-cover transition-transform duration-500 ${isAiSpeaking ? 'scale-110' : 'scale-100'}`} />
                </div>
              </div>

              {/* Status row */}
              <div className="flex items-center gap-2 h-6">
                {isThinking && <><Loader2 className="w-4 h-4 text-blue-400 animate-spin" /><span className="text-sm text-gray-400">Alex is thinking…</span></>}
                {isAiSpeaking && !isThinking && (
                  <div className="flex gap-1 items-end">
                    {[12, 20, 12].map((h, i) => (
                      <span key={i} className="w-1 bg-blue-400 rounded-full animate-bounce"
                        style={{ height: `${h}px`, animationDelay: `${i * 150}ms` }} />
                    ))}
                    <span className="ml-2 text-sm text-gray-400">Alex is speaking</span>
                  </div>
                )}
                {!isThinking && !isAiSpeaking && (
                  <span className="text-sm text-gray-500">Alex — AI Interviewer</span>
                )}
              </div>

              {/* Can-end hint */}
              {canEndCall && (
                <div className="px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm text-center max-w-xs animate-pulse">
                  Interview complete! Click the 🔴 button below to end the call.
                </div>
              )}
            </div>
          )}

          {/* Webcam PiP */}
          <div className="absolute bottom-4 right-4 w-52 aspect-video rounded-xl overflow-hidden border border-white/20 shadow-xl bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
            {!camEnabled && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#3C4043]">
                <VideoOff className="w-8 h-8 text-gray-400" />
              </div>
            )}
            <div className="absolute bottom-1 left-2 z-20 text-[10px] text-white/70 bg-black/50 px-1 rounded">You</div>
          </div>

          {/* Timer badge — top left */}
          {timerActive && (
            <div className="absolute top-4 left-4 flex flex-col gap-1.5">
              <span className={`font-mono text-lg font-bold tabular-nums leading-none ${isWarning ? 'text-red-400 animate-pulse' : 'text-gray-300'}`}>
                {mins}:{secs}
              </span>
              <div className="w-20 h-1 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-1000 ${isWarning ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${(secsLeft / INTERVIEW_SECS) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Transcript sidebar */}
        <div className="hidden lg:flex flex-col w-[340px] bg-[#2d2e30] rounded-xl p-4 border border-white/5 shadow-lg min-h-0">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3 shrink-0">Live Transcript</h3>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
            {transcript.length === 0 && !isThinking && (
              <p className="text-gray-600 text-sm italic">Interview will begin shortly…</p>
            )}
            {transcript.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.speaker === 'user' ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-gray-500 mb-0.5">{m.speaker === 'user' ? 'You' : 'Alex'}</span>
                <div className={`px-3 py-2 rounded-2xl text-sm max-w-[92%] leading-relaxed ${
                  m.speaker === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-[#3C4043] text-gray-100 border border-white/8 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}

            {/* Thinking dots */}
            {isThinking && (
              <div className="flex items-start">
                <div className="bg-[#3C4043] border border-white/8 px-3 py-2.5 rounded-2xl rounded-bl-sm flex gap-1 items-center">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Input */}
          {phase === 'active' && !isAiSpeaking && !isThinking && !canEndCall && micEnabledRef.current && (
            <div className="mt-3 pt-3 border-t border-white/10 shrink-0">
              <p className="text-xs mb-2 flex items-center gap-1.5">
                {isListening
                  ? <><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /><span className="text-red-400">Listening…</span></>
                  : <span className="text-gray-500">Your turn — speak or type</span>}
              </p>
              {/* Scrollable, auto-growing textarea — max 180px then scrolls */}
              <textarea
                className="w-full bg-[#202124] border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 text-white placeholder:text-gray-600"
                style={{ minHeight: '72px', maxHeight: '180px', overflowY: 'auto', resize: 'none', scrollbarWidth: 'thin' }}
                placeholder="Type or just speak… (auto-submits after 8s of silence)"
                value={userAnswer}
                onChange={e => {
                  setUserAnswer(e.target.value);
                  // Auto-grow: reset height, then set to scrollHeight
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
                }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAnswer(); } }}
              />
              <p className="text-xs text-gray-600 mt-1 mb-2">Press Enter to submit · Shift+Enter for new line · or wait 8s after speaking</p>
              <Button onClick={submitAnswer} disabled={!userAnswer.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 cursor-pointer text-white font-medium">
                Send Reply <Play className="ml-2 w-4 h-4" />
              </Button>
              <button id="hs" className="hidden" onClick={submitAnswer} />
            </div>
          )}

          {/* Warning banner */}
          {isWarning && (
            <div className="mt-3 pt-2 border-t border-red-500/20 text-xs text-red-400 text-center animate-pulse shrink-0">
              ⏱ Time almost up — wrapping up…
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="h-20 shrink-0 flex items-center justify-between px-8 bg-[#202124] border-t border-white/5">
        <div className="text-gray-600 text-[11px] font-mono tracking-widest uppercase">{meetingCode}</div>

        <div className="flex items-center gap-3">
          <button onClick={toggleMic}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer ${micEnabled ? 'bg-[#3C4043] hover:bg-[#4d5155]' : 'bg-red-600'}`}>
            {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button onClick={toggleCam}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer ${camEnabled ? 'bg-[#3C4043] hover:bg-[#4d5155]' : 'bg-red-600'}`}>
            {camEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
          <button onClick={submitAnswer} disabled={!userAnswer.trim() || isAiSpeaking || isThinking}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-[#3C4043] hover:bg-[#4d5155] disabled:opacity-40 transition-all cursor-pointer">
            <CheckCircle className={`w-5 h-5 ${userAnswer.trim() ? 'text-green-400' : ''}`} />
          </button>
          <button onClick={finishInterview}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-700 transition-all cursor-pointer shadow-lg ml-2">
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>

        <div className={`font-mono text-sm font-bold tabular-nums ${isWarning ? 'text-red-400 animate-pulse' : 'text-gray-500'}`}>
          {timerActive ? `${mins}:${secs}` : '--:--'}
        </div>
      </div>
    </div>
  );
}

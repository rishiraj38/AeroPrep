"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { getToken, removeToken } from '@/lib/auth';
import { skipCoding } from '@/lib/api';
import { getCurrentInterviewId, clearCurrentInterview } from '@/lib/currentInterview';
import { io, Socket } from 'socket.io-client';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Loader2, Code2, CheckCircle, SkipForward, Play
} from 'lucide-react';

// ─── Config ──────────────────────────────────────────────────────────────────
const SOCKET_URL        = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
const SILENCE_SUBMIT_MS = 8000;       // a spoken answer is sent after this much silence
const IDLE_END_MS       = 60 * 1000;  // once time is up, the call ends after this long with no activity
const OUT_OF_TIME_MSG   = 'We are out of time, so we will stop here. Thank you so much for joining today. Goodbye!';

// ─── Interviewer voice ───────────────────────────────────────────────────────
// Alex speaks with the browser's built-in speech synthesis, so the voices on offer depend on
// the browser and operating system. Best-sounding first; the first one installed wins.
const VOICE_PREFERENCES: RegExp[] = [
  /natural/i,                                  // Edge's neural voices
  /^Google US English$/,                       // Chrome
  /^Google UK English Female$/,
  /(premium|enhanced)/i,                       // macOS / iOS downloaded high-quality voices
  /^(Samantha|Ava|Allison|Susan|Karen|Daniel)\b/, // good macOS / iOS defaults
  /^Microsoft (Aria|Jenny|Zira)/,              // Windows
];

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter(v => v.lang.replace('_', '-').startsWith('en'));
  for (const preference of VOICE_PREFERENCES) {
    const match = english.find(v => preference.test(v.name));
    if (match) return match;
  }
  return english.find(v => v.lang.replace('_', '-') === 'en-US') || english[0] || null;
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Msg { speaker: 'ai' | 'user'; text: string; }

// The interview as stored on the server. Every socket event is answered with it, so the
// page can always be redrawn from the server's copy — including after a refresh.
interface SessionState {
  interviewId: number;
  status: 'active' | 'ended';
  transcript: Msg[];
  durationSecs: number;
  secondsLeft: number | null;   // null until the first answer starts the clock
  answersUsed: number;
  maxAnswers: number;
  maxAnswerChars: number;
  hasFeedback: boolean;
}

interface Ack { ok: boolean; state?: SessionState; error?: string; code?: string; }

// ─── Component ───────────────────────────────────────────────────────────────
export default function InterviewSessionPage() {
  const router = useRouter();

  // meta
  const [meetingCode, setMeetingCode] = useState('');
  const [session,     setSession]     = useState<SessionState | null>(null);

  // phase: loading → lobby (join / resume) → active → finished
  const [phase, setPhase] = useState<'loading'|'lobby'|'active'|'finished'>('loading');
  const phaseRef = useRef(phase);

  // chat
  const [transcript,   setTranscript]   = useState<Msg[]>([]);
  const [userAnswer,   setUserAnswer]   = useState('');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isThinking,   setIsThinking]   = useState(false);
  const [isListening,  setIsListening]  = useState(false);
  const [notice,       setNotice]       = useState('');
  const [sttSupported, setSttSupported] = useState(true);

  // timer
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  const deadlineRef     = useRef<number | null>(null);   // when the interview runs out of time
  const lastActivityRef = useRef(Date.now());

  // hardware
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const micEnabledRef = useRef(true);

  // post-interview
  const [isNavigating, setIsNavigating] = useState(false);
  const [isSaving,     setIsSaving]     = useState(false);

  // refs
  const videoRef         = useRef<HTMLVideoElement>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const recognitionRef   = useRef<any>(null);
  const synthRef         = useRef<SpeechSynthesis | null>(null);
  const voiceRef         = useRef<SpeechSynthesisVoice | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const socketRef        = useRef<Socket | null>(null);
  const interviewIdRef   = useRef<number | null>(null);
  const answerRef        = useRef('');     // mirrors userAnswer for callbacks
  const thinkingRef      = useRef(false);
  const speakingRef      = useRef(false);
  const speakTokenRef    = useRef(0);      // identifies the utterance currently being spoken
  const endedRef         = useRef(false);  // the server has closed the interview
  const finishedRef      = useRef(false);  // this page has left the call
  const presentedRef     = useRef(0);      // transcript messages already shown and spoken
  const wantListenRef    = useRef(false);  // true only while it is the candidate's turn
  const sttFinalRef      = useRef('');     // finalised speech for the current answer
  const answersUsedRef   = useRef(0);      // answers the server has recorded
  const silenceTimerRef  = useRef<NodeJS.Timeout | null>(null);
  const submitRef        = useRef<() => void>(() => {});
  const pendingAnswerRef = useRef<{ text: string; answersBefore: number } | null>(null); // sent, not yet acknowledged

  const setAnswer = useCallback((text: string) => {
    answerRef.current = text;
    setUserAnswer(text);
  }, []);

  const setThinking = useCallback((value: boolean) => {
    thinkingRef.current = value;
    setIsThinking(value);
  }, []);

  const goToPhase = useCallback((next: 'loading'|'lobby'|'active'|'finished') => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, isThinking]);

  // Speech helpers
  const stopListening = useCallback(() => {
    wantListenRef.current = false;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    try { recognitionRef.current?.stop(); } catch (_) {}
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || !micEnabledRef.current || endedRef.current || finishedRef.current) return;
    wantListenRef.current = true;
    // start() throws if the recogniser is still winding down; its onend handler restarts it
    try { recognitionRef.current.start(); } catch (_) {}
    setIsListening(true);
  }, []);

  // Speaks `text`, then calls onDone. The mic is off for as long as Alex is talking,
  // so the interviewer's own voice is never transcribed as the candidate's answer.
  const speak = useCallback((text: string, onDone: () => void) => {
    const token = ++speakTokenRef.current;
    stopListening();

    let finished = false;
    const finish = () => {
      if (finished || token !== speakTokenRef.current) return;
      finished = true;
      speakingRef.current = false;
      setIsAiSpeaking(false);
      lastActivityRef.current = Date.now();
      onDone();
    };

    const synth = synthRef.current;
    if (!synth) { finish(); return; }

    synth.cancel();
    speakingRef.current = true;
    setIsAiSpeaking(true);

    const utt = new SpeechSynthesisUtterance(text);
    const voice = voiceRef.current || pickVoice(synth.getVoices());
    if (voice) {
      utt.voice = voice;
      utt.lang = voice.lang;
    }

    let started = false;
    utt.onstart = () => { started = true; };
    utt.onend   = finish;
    utt.onerror = finish;
    synth.speak(utt);
    // If the browser refuses to speak, carry on with the text alone instead of hanging
    setTimeout(() => {
      if (started) return;
      synth.cancel();
      finish();
    }, 3000);
  }, [stopListening]);

  // Leave the call
  const showFinished = useCallback(() => {
    finishedRef.current = true;
    stopListening();
    speakTokenRef.current++;
    synthRef.current?.cancel();
    streamRef.current?.getTracks().forEach(t => t.stop());
    socketRef.current?.disconnect();
    setIsSaving(false);
    goToPhase('finished');
  }, [stopListening, goToPhase]);

  // End the interview: tell the server (unless it already closed it), then leave
  const endCall = useCallback((farewell = '') => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    stopListening();
    setIsSaving(true);

    const sock = socketRef.current;
    const closed = new Promise<void>(resolve => {
      if (endedRef.current || !sock?.connected) { resolve(); return; }
      sock.emit('interview:end', { interviewId: interviewIdRef.current }, () => resolve());
      setTimeout(resolve, 5000);
    });
    const spoken = new Promise<void>(resolve => {
      if (farewell) speak(farewell, resolve); else resolve();
    });
    Promise.all([closed, spoken]).then(showFinished);
  }, [stopListening, speak, showFinished]);

  // Redraw from the server's copy of the interview
  const applyState = useCallback((state: SessionState) => {
    setSession(state);
    setTranscript(state.transcript);
    endedRef.current = state.status === 'ended';
    answersUsedRef.current = state.answersUsed;
    deadlineRef.current = state.secondsLeft === null ? null : Date.now() + state.secondsLeft * 1000;
    setSecsLeft(state.secondsLeft);

    if (phaseRef.current === 'loading') {
      // First load, or a refresh: nothing has been spoken in this tab yet
      if (endedRef.current) showFinished(); else goToPhase('lobby');
      return;
    }
    if (phaseRef.current !== 'active' || finishedRef.current) return;

    const latest = state.transcript[state.transcript.length - 1];
    const isNew = state.transcript.length > presentedRef.current;
    presentedRef.current = state.transcript.length;

    if (isNew && latest?.speaker === 'ai') {
      speak(latest.text, () => {
        if (endedRef.current) setTimeout(() => endCall(), 1200);
        else startListening();
      });
    } else if (endedRef.current) {
      endCall();
    }
  }, [speak, startListening, endCall, showFinished, goToPhase]);

  // Ask the server for the interview as it stands (on connect and on every reconnect)
  const syncWithServer = useCallback(() => {
    socketRef.current?.emit('interview:join', { interviewId: interviewIdRef.current }, (res: Ack) => {
      setThinking(false);
      if (res.ok && res.state) {
        // The connection dropped before this answer reached the server: give it back to the candidate
        const pending = pendingAnswerRef.current;
        pendingAnswerRef.current = null;
        if (pending && res.state.status === 'active' && res.state.answersUsed <= pending.answersBefore) {
          setAnswer(pending.text);
          sttFinalRef.current = pending.text + ' ';
          setNotice('Your last answer was not sent. Please send it again.');
        }
        applyState(res.state);
        return;
      }
      if (res.code === 'NOT_FOUND') {
        clearCurrentInterview();
        router.push('/interview/create');
        return;
      }
      setNotice(res.error || 'Could not load the interview.');
    });
  }, [applyState, setThinking, setAnswer, router]);

  // Submit user answer
  const submitAnswer = useCallback(() => {
    const ans = answerRef.current.trim();
    if (!ans || thinkingRef.current || speakingRef.current || endedRef.current || finishedRef.current) return;

    const sock = socketRef.current;
    if (!sock?.connected) { setNotice('Reconnecting… your answer is still here, send it again in a moment.'); return; }

    stopListening();
    setNotice('');
    setAnswer('');
    sttFinalRef.current = '';
    lastActivityRef.current = Date.now();
    // Show the answer straight away; the server's copy replaces it when the reply arrives
    setTranscript(prev => [...prev, { speaker: 'user', text: ans }]);
    presentedRef.current += 1;
    pendingAnswerRef.current = { text: ans, answersBefore: answersUsedRef.current };
    setThinking(true);

    sock.emit('interview:answer', { interviewId: interviewIdRef.current, text: ans }, (res: Ack) => {
      pendingAnswerRef.current = null;
      setThinking(false);
      if (res.ok && res.state) { applyState(res.state); return; }

      // Not accepted: put the answer back in the box and redraw from the server
      if (res.code !== 'INTERVIEW_ENDED') {
        setAnswer(ans);
        sttFinalRef.current = ans + ' ';
        setNotice(res.error || 'Your answer was not sent. Please try again.');
      }
      syncWithServer();
    });
  }, [stopListening, setAnswer, setThinking, applyState, syncWithServer]);

  useEffect(() => { submitRef.current = submitAnswer; }, [submitAnswer]);

  // Countdown. The clock is the server's; this only displays it, and hangs up
  // if the candidate has gone quiet after time ran out.
  useEffect(() => {
    if (phase !== 'active') return;
    const timer = setInterval(() => {
      if (deadlineRef.current === null) return;
      const left = Math.round((deadlineRef.current - Date.now()) / 1000);
      setSecsLeft(left);

      const idle = Date.now() - lastActivityRef.current > IDLE_END_MS;
      if (left <= 0 && idle && !thinkingRef.current && !speakingRef.current && !endedRef.current) {
        endCall(OUT_OF_TIME_MSG);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, endCall]);

  // Speech recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    synthRef.current = synth;

    // Browsers load their voice list late; until it arrives the first sentences would be
    // spoken in the system's default (often robotic) voice
    const loadVoice = () => { voiceRef.current = pickVoice(synth.getVoices()); };
    loadVoice();
    synth.addEventListener('voiceschanged', loadVoice);
    const removeVoiceListener = () => synth.removeEventListener('voiceschanged', loadVoice);

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSttSupported(false); return removeVoiceListener; }

    let restartTimer: NodeJS.Timeout;

    const createRec = () => {
      const rec = new SR();
      rec.continuous    = true;
      rec.interimResults = true;
      rec.lang          = 'en-US';
      rec.maxAlternatives = 1;

      rec.onresult = (e: any) => {
        // Anything heard while it is not the candidate's turn is Alex's voice or noise
        if (!wantListenRef.current) return;
        let interimTranscript = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) sttFinalRef.current += t + ' ';
          else interimTranscript += t;
        }

        const combined = (sttFinalRef.current + interimTranscript).trim();
        if (!combined) return;
        lastActivityRef.current = Date.now();
        setAnswer(combined);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          // Only auto-submit after 8s of silence AND at least 5 words spoken
          if (wantListenRef.current && sttFinalRef.current.trim().split(/\s+/).length >= 5) {
            submitRef.current();
          }
        }, SILENCE_SUBMIT_MS);
      };

      rec.onerror = (e: any) => {
        // 'no-speech' and 'aborted' are normal — onend restarts the recogniser
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        // Anything else (blocked mic, no speech service, offline) will fail again on restart,
        // so stop listening instead of retrying forever; typing still works
        console.warn('[STT] Error:', e.error);
        micEnabledRef.current = false;
        wantListenRef.current = false;
        setMicEnabled(false);
        setIsListening(false);
        setNotice(e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Microphone access is blocked. You can still type your answers.'
          : 'Voice input is not available right now. You can still type your answers.');
      };

      rec.onend = () => {
        if (!wantListenRef.current) return;
        restartTimer = setTimeout(() => {
          if (!wantListenRef.current) return;
          try {
            const newRec = createRec();
            recognitionRef.current = newRec;
            newRec.start();
          } catch (_) {}
        }, 250);
      };

      return rec;
    };

    recognitionRef.current = createRec();
    return () => {
      clearTimeout(restartTimer);
      removeVoiceListener();
    };
  }, [setAnswer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      finishedRef.current = true;
      wantListenRef.current = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      try { recognitionRef.current?.stop(); } catch (_) {}
      synthRef.current?.cancel();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      socketRef.current?.disconnect();
    };
  }, []);

  // Boot: connect socket and load the interview from the server
  useEffect(() => {
    finishedRef.current = false;

    const token = getToken();
    if (!token) { router.push('/sign-in'); return; }

    const id = getCurrentInterviewId();
    if (!id) { router.push('/interview/create'); return; }
    interviewIdRef.current = id;
    setMeetingCode(`INT-${String(id).padStart(4, '0')}`);

    const sock = io(SOCKET_URL, {
      auth:        { token },
      transports:  ['websocket', 'polling'],
    });
    socketRef.current = sock;

    // Fires on the first connection and again after every reconnect
    sock.on('connect', () => {
      setNotice('');
      syncWithServer();
    });

    sock.on('disconnect', () => {
      if (!finishedRef.current) setNotice('Connection lost. Reconnecting…');
    });

    sock.on('connect_error', (err) => {
      console.error('[Socket] connection error', err.message);
      if (err.message === 'unauthorized') {
        removeToken();
        router.push('/sign-in');
      }
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enter the room. Runs from a click, which is what lets the browser speak and listen.
  const enterCall = async () => {
    const latest = transcript[transcript.length - 1];
    // Alex speaks first, so the answer box stays hidden while the camera starts
    if (latest?.speaker === 'ai') {
      speakingRef.current = true;
      setIsAiSpeaking(true);
    }
    goToPhase('active');
    lastActivityRef.current = Date.now();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch { setCamEnabled(false); }

    // Alex opens with the greeting, or repeats the question the candidate was on
    presentedRef.current = transcript.length;
    if (latest?.speaker === 'ai') speak(latest.text, startListening);
    else startListening();
  };

  // Hardware toggles
  const toggleMic = () => {
    const next = !micEnabled;
    setMicEnabled(next);
    micEnabledRef.current = next;
    if (next && !speakingRef.current && !thinkingRef.current) startListening();
    else if (!next) stopListening();
  };

  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !camEnabled; });
    setCamEnabled(c => !c);
  };

  // An interview that already has its report goes straight to it
  const alreadyHasFeedback = phase === 'finished' && !!session?.hasFeedback;
  useEffect(() => {
    if (alreadyHasFeedback) router.replace('/interview/feedback');
  }, [alreadyHasFeedback, router]);

  // Timer display
  const totalSecs = session?.durationSecs ?? 0;
  const shownSecs = Math.max(0, secsLeft ?? totalSecs);
  const mins = String(Math.floor(shownSecs / 60)).padStart(2, '0');
  const secs = String(shownSecs % 60).padStart(2, '0');
  const timeUp    = secsLeft !== null && secsLeft <= 0;
  const isWarning = secsLeft !== null && secsLeft <= 60;
  const canAnswer = phase === 'active' && !isAiSpeaking && !isThinking && !isSaving && session?.status === 'active';

  // Post-interview screen
  if (phase === 'finished') {
    const id = interviewIdRef.current;
    if (alreadyHasFeedback) return null;
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
            <Button onClick={async () => {
              setIsNavigating(true);
              // The feedback page reports any problem, so a failed skip does not block it
              if (id) await skipCoding(id).catch(() => {});
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

  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 z-50 bg-[#202124] text-white flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
        <p className="text-gray-400 text-sm">{notice || 'Loading your interview…'}</p>
      </div>
    );
  }

  // Lobby: join a new interview, or come back to one after a refresh
  if (phase === 'lobby' && session) {
    const resuming = session.transcript.length > 1;
    return (
      <div className="fixed inset-0 z-50 bg-[#202124] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#2d2e30] border border-white/10 rounded-xl p-8 text-center shadow-2xl">
          <div className="w-20 h-20 rounded-full border-2 border-white/10 overflow-hidden mx-auto mb-5">
            <img src="https://api.dicebear.com/7.x/bottts/svg?seed=AeroPrep&backgroundColor=1e293b" alt="AI" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-2xl font-bold mb-3">
            {resuming ? 'Your interview is still in progress' : 'Ready to join?'}
          </h2>
          <p className="text-gray-400 text-sm mb-6 leading-relaxed">
            {resuming
              ? `Nothing was lost. You have given ${session.answersUsed} of up to ${session.maxAnswers} answers, and Alex will repeat the question you were on.`
              : `Alex will greet you, then ask about your experience. Speak or type your answers. The interview runs for up to ${Math.round(totalSecs / 60)} minutes, and the clock starts with your first answer.`}
          </p>
          {resuming && secsLeft !== null && (
            <p className={`font-mono text-sm mb-6 ${isWarning ? 'text-red-400' : 'text-gray-300'}`}>
              {timeUp ? 'Time is up — one last answer.' : `${mins}:${secs} left`}
            </p>
          )}
          <Button onClick={enterCall} size="lg"
            className="w-full py-6 text-lg bg-blue-600 hover:bg-blue-700 cursor-pointer text-white">
            <Play className="mr-2 h-5 w-5" /> {resuming ? 'Resume interview' : 'Join interview'}
          </Button>
        </div>
      </div>
    );
  }

  // Main UI
  return (
    <div className="fixed inset-0 z-50 bg-[#202124] text-white flex flex-col font-sans overflow-hidden select-none">

      {/* Main canvas */}
      <div className="flex-1 flex flex-col lg:flex-row p-3 gap-3 pb-0 min-h-0">

        {/* Center stage */}
        <div className="flex-1 min-h-0 flex items-center justify-center bg-[#2d2e30] rounded-xl relative overflow-hidden border border-white/5 shadow-2xl">

          <div className="flex flex-col items-center gap-4">
            {/* Avatar */}
            <div className="relative">
              <div className={`absolute inset-0 rounded-full blur-2xl transition-all duration-500 bg-blue-500 ${isAiSpeaking ? 'opacity-50 scale-150' : 'opacity-10 scale-100'}`} />
              <div className={`relative w-24 h-24 lg:w-36 lg:h-36 rounded-full border-4 overflow-hidden shadow-2xl z-10 transition-all duration-300 ${isAiSpeaking ? 'border-blue-400 shadow-blue-500/40' : 'border-white/10'}`}>
                <img src="https://api.dicebear.com/7.x/bottts/svg?seed=AeroPrep&backgroundColor=1e293b"
                  alt="AI" className={`w-full h-full object-cover transition-transform duration-500 ${isAiSpeaking ? 'scale-110' : 'scale-100'}`} />
              </div>
            </div>

            {/* Status row */}
            <div className="flex items-center gap-2 h-6">
              {isSaving && <><Loader2 className="w-4 h-4 text-blue-400 animate-spin" /><span className="text-sm text-gray-400">Ending the call…</span></>}
              {isThinking && !isSaving && <><Loader2 className="w-4 h-4 text-blue-400 animate-spin" /><span className="text-sm text-gray-400">Alex is thinking…</span></>}
              {isAiSpeaking && !isThinking && !isSaving && (
                <div className="flex gap-1 items-end">
                  {[12, 20, 12].map((h, i) => (
                    <span key={i} className="w-1 bg-blue-400 rounded-full animate-bounce"
                      style={{ height: `${h}px`, animationDelay: `${i * 150}ms` }} />
                  ))}
                  <span className="ml-2 text-sm text-gray-400">Alex is speaking</span>
                </div>
              )}
              {!isThinking && !isAiSpeaking && !isSaving && (
                <span className="text-sm text-gray-500">Alex — AI Interviewer</span>
              )}
            </div>
          </div>

          {/* Webcam PiP */}
          <div className="absolute bottom-4 right-4 w-28 lg:w-52 aspect-video rounded-xl overflow-hidden border border-white/20 shadow-xl bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
            {!camEnabled && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#3C4043]">
                <VideoOff className="w-8 h-8 text-gray-400" />
              </div>
            )}
            <div className="absolute bottom-1 left-2 z-20 text-[10px] text-white/70 bg-black/50 px-1 rounded">You</div>
          </div>

          {/* Timer badge — top left */}
          <div className="absolute top-4 left-4 flex flex-col gap-1.5">
            <span className={`font-mono text-lg font-bold tabular-nums leading-none ${isWarning ? 'text-red-400' : 'text-gray-300'}`}>
              {mins}:{secs}
            </span>
            <div className="w-20 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ${isWarning ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${totalSecs ? (shownSecs / totalSecs) * 100 : 100}%` }} />
            </div>
          </div>
        </div>

        {/* Transcript sidebar (below the stage on small screens) */}
        <div className="flex flex-col w-full lg:w-[340px] h-[55%] lg:h-auto bg-[#2d2e30] rounded-xl p-4 border border-white/5 shadow-lg min-h-0 select-text">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3 shrink-0">Live Transcript</h3>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
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

          {/* Notices: connection, rejected answers, blocked mic */}
          {notice && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs shrink-0">
              {notice}
            </div>
          )}

          {/* Input */}
          {canAnswer && (
            <div className="mt-3 pt-3 border-t border-white/10 shrink-0">
              <p className="text-xs mb-2 flex items-center gap-1.5">
                {isListening
                  ? <><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /><span className="text-red-400">Listening…</span></>
                  : <span className="text-gray-500">{sttSupported ? 'Your turn — speak or type' : 'Your turn — type your answer (voice input is not supported in this browser)'}</span>}
              </p>
              {/* Scrollable, auto-growing textarea — max 180px then scrolls */}
              <textarea
                className="w-full bg-[#202124] border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 text-white placeholder:text-gray-600"
                style={{ minHeight: '72px', maxHeight: '180px', overflowY: 'auto', resize: 'none', scrollbarWidth: 'thin' }}
                placeholder="Type or just speak… (auto-submits after 8s of silence)"
                value={userAnswer}
                maxLength={session?.maxAnswerChars}
                onChange={e => {
                  // Typing takes over from the mic: later speech is added after the edited text
                  setAnswer(e.target.value);
                  sttFinalRef.current = e.target.value ? e.target.value + ' ' : '';
                  lastActivityRef.current = Date.now();
                  if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
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
            </div>
          )}

          {/* Time-up banner: the candidate may finish their answer; Alex then wraps up */}
          {timeUp && session?.status === 'active' && (
            <div className="mt-3 pt-2 border-t border-red-500/20 text-xs text-red-400 text-center shrink-0">
              ⏱ Time is up — finish your answer and send it, and Alex will wrap up.
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="h-20 shrink-0 flex items-center justify-between px-4 lg:px-8 bg-[#202124] border-t border-white/5">
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
          <button onClick={submitAnswer} disabled={!userAnswer.trim() || !canAnswer}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-[#3C4043] hover:bg-[#4d5155] disabled:opacity-40 transition-all cursor-pointer">
            <CheckCircle className={`w-5 h-5 ${userAnswer.trim() ? 'text-green-400' : ''}`} />
          </button>
          <button onClick={() => endCall()} disabled={isSaving}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-all cursor-pointer shadow-lg ml-2">
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>

        <div className={`font-mono text-sm font-bold tabular-nums ${isWarning ? 'text-red-400' : 'text-gray-500'}`}>
          {mins}:{secs}
        </div>
      </div>
    </div>
  );
}

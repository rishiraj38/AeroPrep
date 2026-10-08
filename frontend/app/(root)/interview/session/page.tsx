"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '@/lib/auth';
import { skipCoding, endInterview, expireSession } from '@/lib/api';
import { getCurrentInterviewId, clearCurrentInterview } from '@/lib/currentInterview';
import { useAttentionMonitor } from '@/lib/useAttentionMonitor';
import { io, Socket } from 'socket.io-client';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Loader2, Code2, CheckCircle, SkipForward, Play, Eye, RotateCcw, Bot
} from 'lucide-react';

// ─── Config ──────────────────────────────────────────────────────────────────
const SOCKET_URL        = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
const AUTO_SEND_CHOICES  = [3, 5, 8, 0];  // seconds of silence before a spoken answer is sent; 0 = never
const AUTO_SEND_DEFAULT  = 5;
const AUTO_SEND_WARNING  = 4;             // show the countdown for this many seconds before sending
const AUTO_SEND_KEY      = 'aeroprep:autoSendSecs';
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

// "One. Two? Three" -> ["One.", "Two?", "Three"]. Splits where the server does: only after
// punctuation that ends a sentence, so "Node.js" and "3.5" are not chopped into pieces.
function splitSentences(text: string): string[] {
  const parts: string[] = [];
  const sentenceEnd = /[.!?]["')]*(?:\s+|$)/g;
  let from = 0;
  for (let match = sentenceEnd.exec(text); match && from < text.length; match = sentenceEnd.exec(text)) {
    const end = match.index + match[0].length;
    parts.push(text.slice(from, end).trim());
    from = end;
  }
  if (from < text.length) parts.push(text.slice(from).trim());
  return parts.filter(Boolean);
}

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter(v => v.lang.replace('_', '-').startsWith('en'));
  for (const preference of VOICE_PREFERENCES) {
    const match = english.find(v => preference.test(v.name));
    if (match) return match;
  }
  return english.find(v => v.lang.replace('_', '-') === 'en-US') || english[0] || null;
}

// Alex's face. Drawn here rather than fetched from an avatar service, so it always appears
// and nothing about the candidate's visit is sent to a third party.
function AlexAvatar({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex items-center justify-center bg-gradient-to-br from-slate-600 to-slate-900 ${className}`}>
      <Bot className="w-1/2 h-1/2 text-blue-200" />
    </div>
  );
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

// One spoken turn by Alex. Its text can arrive in pieces while the reply is still being written;
// the turn is over when every piece has been spoken and no more are coming.
interface SpeakingTurn {
  utterances: SpeechSynthesisUtterance[];  // kept so the browser cannot discard one mid-speech
  pending: number;     // pieces queued with the browser and not yet finished
  closed: boolean;     // no more text will be added
  silenced: boolean;   // interrupted, or the browser will not speak: show the text only
  onDone: () => void;
}

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
  const [slowConnect,  setSlowConnect]  = useState(false);  // the server is taking a while to answer

  // timer
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  const deadlineRef     = useRef<number | null>(null);   // when the interview runs out of time
  const lastActivityRef = useRef(0);   // set when the candidate enters the call

  // hardware
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [camPromptDismissed, setCamPromptDismissed] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);     // a camera picture is actually showing
  const [confirmEnd, setConfirmEnd] = useState(false);     // "end the interview?" is being asked
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typedRef    = useRef(false);                       // the candidate is answering by keyboard
  const cameraPendingRef = useRef(false);                  // a camera request is waiting on the browser
  const [endError, setEndError] = useState('');            // the server could not be told the interview is over
  const [micPausedToType, setMicPausedToType] = useState(false);
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
  const turnRef          = useRef<SpeakingTurn | null>(null);  // Alex's turn in progress
  const streamedRef      = useRef('');     // what has arrived so far of the reply being written
  const [streamingReply, setStreamingReply] = useState('');
  const chunkHandlerRef  = useRef<(chunk: { interviewId: number; text: string }) => void>(() => {});
  const endedRef         = useRef(false);  // the server has closed the interview
  const finishedRef      = useRef(false);  // this page has left the call
  const presentedRef     = useRef(0);      // transcript messages already shown and spoken
  const wantListenRef    = useRef(false);  // true only while it is the candidate's turn
  const typingPausedRef  = useRef(false);  // the candidate is typing this answer, so the mic stays off
  const sttFinalRef      = useRef('');     // finalised speech for the current answer
  const answersUsedRef   = useRef(0);      // answers the server has recorded
  const silenceTimerRef  = useRef<NodeJS.Timeout | null>(null);
  const autoSendAtRef    = useRef<number | null>(null);  // when a spoken answer will send itself
  const [autoSendIn, setAutoSendIn] = useState<number | null>(null);
  const [autoSendSecs, setAutoSendSecs] = useState(AUTO_SEND_DEFAULT);
  const autoSendSecsRef  = useRef(AUTO_SEND_DEFAULT);
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
  }, [transcript, isThinking, streamingReply]);

  // The candidate's own choice of pause length, remembered between interviews
  useEffect(() => {
    const saved = Number(localStorage.getItem(AUTO_SEND_KEY));
    if (localStorage.getItem(AUTO_SEND_KEY) !== null && AUTO_SEND_CHOICES.includes(saved)) {
      autoSendSecsRef.current = saved;
      setAutoSendSecs(saved);
    }
  }, []);

  // Speech helpers
  const cancelAutoSend = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    autoSendAtRef.current = null;
    setAutoSendIn(null);
  }, []);

  const stopListening = useCallback(() => {
    wantListenRef.current = false;
    cancelAutoSend();
    try { recognitionRef.current?.stop(); } catch (_) {}
    setIsListening(false);
  }, [cancelAutoSend]);

  // The candidate started typing: stop the recogniser and throw away whatever it had not finished
  const pauseListeningToType = useCallback(() => {
    wantListenRef.current = false;
    typingPausedRef.current = true;
    try { recognitionRef.current?.abort(); } catch (_) {}
    setIsListening(false);
    setMicPausedToType(true);
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || !micEnabledRef.current || endedRef.current || finishedRef.current) return;
    wantListenRef.current = true;
    // start() throws if the recogniser is still winding down; its onend handler restarts it
    try { recognitionRef.current.start(); } catch (_) {}
    setIsListening(true);
    typingPausedRef.current = false;
    setMicPausedToType(false);
  }, []);

  const finishTurnIfDone = useCallback(() => {
    const turn = turnRef.current;
    if (!turn || !turn.closed || turn.pending > 0) return;
    turnRef.current = null;
    speakingRef.current = false;
    setIsAiSpeaking(false);
    lastActivityRef.current = Date.now();
    turn.onDone();
  }, []);

  // Stop speaking this turn's text (it stays on screen). The turn still ends normally.
  const silenceTurn = useCallback((turn: SpeakingTurn) => {
    turn.silenced = true;
    turn.pending = 0;
    synthRef.current?.cancel();
    finishTurnIfDone();
  }, [finishTurnIfDone]);

  // Alex starts talking. The mic stays off until the turn is over, so the interviewer's
  // own voice is never transcribed as the candidate's answer.
  const beginTurn = useCallback((onDone: () => void) => {
    stopListening();
    synthRef.current?.cancel();
    turnRef.current = { utterances: [], pending: 0, closed: false, silenced: !synthRef.current, onDone };
    speakingRef.current = true;
    setIsAiSpeaking(true);
  }, [stopListening]);

  // Queue one piece of the current turn's text to be spoken
  const sayInTurn = useCallback((text: string) => {
    const turn = turnRef.current;
    const synth = synthRef.current;
    if (!turn || turn.silenced || !synth || !text.trim()) return;

    const utt = new SpeechSynthesisUtterance(text);
    const voice = voiceRef.current || pickVoice(synth.getVoices());
    if (voice) {
      utt.voice = voice;
      utt.lang = voice.lang;
    }

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      // A turn that was silenced or replaced has already accounted for this piece
      if (turnRef.current !== turn || turn.silenced) return;
      turn.pending--;
      finishTurnIfDone();
    };

    const firstPiece = turn.pending === 0;
    let started = false;
    utt.onstart = () => {
      started = true;
      // Browsers occasionally stall mid-speech and never report the end
      setTimeout(() => { if (!settled && turnRef.current === turn) silenceTurn(turn); }, 4000 + text.length * 120);
    };
    utt.onend   = settle;
    utt.onerror = settle;
    turn.utterances.push(utt);
    turn.pending++;
    synth.speak(utt);

    // If the browser refuses to speak at all, carry on with the text alone instead of hanging
    if (firstPiece) {
      setTimeout(() => { if (!started && !settled && turnRef.current === turn) silenceTurn(turn); }, 3000);
    }
  }, [finishTurnIfDone, silenceTurn]);

  // No more text is coming for the current turn
  const closeTurn = useCallback(() => {
    if (!turnRef.current) return;
    turnRef.current.closed = true;
    finishTurnIfDone();
  }, [finishTurnIfDone]);

  // Speaks a complete message, then calls onDone. It goes to the browser a sentence at a time:
  // some voices cut out, without ever reporting it, on anything longer than about 15 seconds.
  const speak = useCallback((text: string, onDone: () => void) => {
    beginTurn(onDone);
    for (const sentence of splitSentences(text)) sayInTurn(sentence);
    closeTurn();
  }, [beginTurn, sayInTurn, closeTurn]);

  // Drop whatever Alex was saying without running its callback
  const abandonTurn = useCallback(() => {
    turnRef.current = null;
    streamedRef.current = '';
    setStreamingReply('');
    synthRef.current?.cancel();
    speakingRef.current = false;
    setIsAiSpeaking(false);
  }, []);

  // Leave the call
  const showFinished = useCallback(() => {
    finishedRef.current = true;
    stopListening();
    abandonTurn();
    streamRef.current?.getTracks().forEach(t => t.stop());
    socketRef.current?.disconnect();
    setIsSaving(false);
    goToPhase('finished');
  }, [stopListening, abandonTurn, goToPhase]);

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

  // What happens once Alex has finished a reply
  const afterReply = useCallback(() => {
    if (endedRef.current) setTimeout(() => endCall(), 1200);
    else startListening();
  }, [endCall, startListening]);

  // Redraw from the server's copy of the interview
  const applyState = useCallback((state: SessionState) => {
    setSession(state);
    setTranscript(state.transcript);
    endedRef.current = state.status === 'ended';
    answersUsedRef.current = state.answersUsed;
    deadlineRef.current = state.secondsLeft === null ? null : Date.now() + state.secondsLeft * 1000;
    setSecsLeft(state.secondsLeft);

    if (phaseRef.current === 'loading' || phaseRef.current === 'lobby') {
      // First load, a refresh, or a reconnect before joining: nothing has been spoken in this tab yet
      if (endedRef.current) showFinished(); else goToPhase('lobby');
      return;
    }
    if (phaseRef.current !== 'active' || finishedRef.current) return;

    const latest = state.transcript[state.transcript.length - 1];
    const isNew = state.transcript.length > presentedRef.current;
    presentedRef.current = state.transcript.length;

    // What was already spoken of this reply while it was being written
    const streamed = streamedRef.current;
    streamedRef.current = '';
    setStreamingReply('');

    if (isNew && latest?.speaker === 'ai') {
      if (streamed && turnRef.current) {
        // Say only what did not arrive in pieces (normally nothing), then let the turn finish
        const rest = latest.text.startsWith(streamed) ? latest.text.slice(streamed.length).trim() : '';
        for (const sentence of splitSentences(rest)) sayInTurn(sentence);
        closeTurn();
      } else {
        speak(latest.text, afterReply);
      }
      return;
    }

    // Nothing new from Alex. A reply that was being spoken but never completed is dropped,
    // and unless the interview is over it is the candidate's turn, so the mic comes back on.
    if (turnRef.current && !turnRef.current.closed) abandonTurn();
    if (endedRef.current) endCall();
    // (not while an answer is being typed: a reconnect must not switch the mic back on under it)
    else if (!speakingRef.current && !typingPausedRef.current) startListening();
  }, [speak, sayInTurn, closeTurn, abandonTurn, afterReply, startListening, endCall, showFinished, goToPhase]);

  // A sentence of the reply, sent by the server as soon as it is written
  const handleReplyChunk = useCallback(({ interviewId, text }: { interviewId: number; text: string }) => {
    if (interviewId !== interviewIdRef.current || finishedRef.current || phaseRef.current !== 'active') return;
    if (!pendingAnswerRef.current || !text) return;   // not waiting for a reply: a stray piece

    if (!streamedRef.current) {
      setThinking(false);
      beginTurn(afterReply);
    }
    streamedRef.current = streamedRef.current ? `${streamedRef.current} ${text}` : text;
    setStreamingReply(streamedRef.current);
    sayInTurn(text);
  }, [beginTurn, sayInTurn, afterReply, setThinking]);

  useEffect(() => { chunkHandlerRef.current = handleReplyChunk; }, [handleReplyChunk]);

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

      // Not accepted: stop anything half-said, put the answer back in the box and redraw from the server
      abandonTurn();
      if (res.code !== 'INTERVIEW_ENDED') {
        setAnswer(ans);
        sttFinalRef.current = ans + ' ';
        setNotice(res.error || 'Your answer was not sent. Please try again.');
      }
      syncWithServer();
    });
  }, [stopListening, abandonTurn, setAnswer, setThinking, applyState, syncWithServer]);

  useEffect(() => { submitRef.current = submitAnswer; }, [submitAnswer]);

  // Countdown. The clock is the server's; this only displays it, and hangs up
  // if the candidate has gone quiet after time ran out.
  useEffect(() => {
    if (phase !== 'active') return;
    const timer = setInterval(() => {
      setAutoSendIn(autoSendAtRef.current === null ? null : Math.max(0, Math.ceil((autoSendAtRef.current - Date.now()) / 1000)));
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
    // Some browsers (in-app web views, for one) have no speech synthesis at all
    const synth: SpeechSynthesis | null = window.speechSynthesis ?? null;
    synthRef.current = synth;

    // Browsers load their voice list late; until it arrives the first sentences would be
    // spoken in the system's default (often robotic) voice
    const loadVoice = () => { if (synth) voiceRef.current = pickVoice(synth.getVoices()); };
    loadVoice();
    synth?.addEventListener('voiceschanged', loadVoice);
    const removeVoiceListener = () => synth?.removeEventListener('voiceschanged', loadVoice);

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
        typedRef.current = false;
        lastActivityRef.current = Date.now();
        setAnswer(combined);

        // Every new word pushes the auto-send back; a pause of the chosen length sends what is
        // in the box, including words the recogniser never marked as final
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        const pauseMs = autoSendSecsRef.current * 1000;
        if (!pauseMs) return;
        autoSendAtRef.current = Date.now() + pauseMs;
        silenceTimerRef.current = setTimeout(() => {
          autoSendAtRef.current = null;
          setAutoSendIn(null);
          if (wantListenRef.current && answerRef.current.trim()) submitRef.current();
        }, pauseMs);
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
      turnRef.current = null;
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
      tryAllTransports: true,   // without this a blocked WebSocket never falls back to polling
    });
    socketRef.current = sock;
    // The backend sleeps when idle; say so instead of showing a bare spinner for a minute
    const slowTimer = setTimeout(() => setSlowConnect(true), 5000);

    // Fires on the first connection and again after every reconnect
    sock.on('connect', () => {
      clearTimeout(slowTimer);
      setSlowConnect(false);
      setNotice('');
      syncWithServer();
    });

    sock.on('interview:reply-chunk', (chunk) => chunkHandlerRef.current(chunk));

    sock.on('disconnect', () => {
      if (!finishedRef.current) setNotice('Connection lost. Reconnecting…');
    });

    sock.on('connect_error', (err) => {
      console.error('[Socket] connection error', err.message);
      // The login is no longer accepted: sign out and say why on the sign-in page
      if (err.message === 'unauthorized') expireSession();
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Turn the camera on. It is optional: the interview carries on without it
  const startCamera = async (askedByUser = false) => {
    if (cameraPendingRef.current) return;   // the browser is already asking
    cameraPendingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // The candidate may have left the call while the browser was asking
      if (finishedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamEnabled(true);
      setCameraLive(true);
      setCamPromptDismissed(true);
    } catch {
      setCamEnabled(false);
      setCameraLive(false);
      if (askedByUser) setNotice("The camera is blocked. Allow it in your browser's site settings, then try again.");
    } finally {
      cameraPendingRef.current = false;
    }
  };

  // Enter the room. Runs from a click, which is what lets the browser speak and listen.
  const enterCall = () => {
    const latest = transcript[transcript.length - 1];
    goToPhase('active');
    lastActivityRef.current = Date.now();

    // The browser's camera question must not hold the interview up: Alex starts straight away
    startCamera();

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
    // Off means off: the camera is released (its light goes out), and asked for again to turn it back on
    if (!streamRef.current) { startCamera(true); return; }
    streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamEnabled(false);
    setCameraLive(false);
    setCamPromptDismissed(true);
  };

  // Stop Alex mid-sentence and go straight to answering, as you could with a person
  const interruptAlex = () => { if (turnRef.current) silenceTurn(turnRef.current); };

  const chooseAutoSend = (seconds: number) => {
    autoSendSecsRef.current = seconds;
    setAutoSendSecs(seconds);
    localStorage.setItem(AUTO_SEND_KEY, String(seconds));
    cancelAutoSend();
  };

  // Hear the last thing Alex said again; costs nothing, it is the stored text
  const repeatQuestion = () => {
    const latest = transcript[transcript.length - 1];
    if (latest?.speaker === 'ai' && !speakingRef.current && !thinkingRef.current) {
      speak(latest.text, startListening);
    }
  };

  // Hanging up cannot be undone, so the red button asks first
  const requestEnd = () => {
    if (endedRef.current) endCall();
    else setConfirmEnd(true);
  };

  // Notices what a human interviewer would: looking away, leaving the frame or the tab.
  // The face tracking only loads once there is a camera picture to look at.
  const attentionNudge = useAttentionMonitor(videoRef, phase === 'active', cameraLive);
  const latestAiText = streamingReply || [...transcript].reverse().find(m => m.speaker === 'ai')?.text || '';

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
  const sendingSoon = autoSendIn !== null && autoSendIn <= AUTO_SEND_WARNING;

  // Someone answering by keyboard should not have to click the box again before every answer
  useEffect(() => {
    if (canAnswer && (typedRef.current || !sttSupported || !micEnabled)) textareaRef.current?.focus();
  }, [canAnswer, sttSupported, micEnabled]);

  // The camera picture may arrive before the room has been drawn
  useEffect(() => {
    if (cameraLive && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraLive, phase]);

  // Escape closes the "end the interview?" question
  useEffect(() => {
    if (!confirmEnd) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmEnd(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmEnd]);

  // Leaving the finished screen. The hang-up normally reaches the server over the socket, but
  // that connection may have been down at the time, so it is confirmed here over plain HTTP
  // (ending twice is harmless); otherwise the next page would find the interview still open.
  const leaveFor = async (path: string, skipTheCodingRound: boolean) => {
    const id = interviewIdRef.current;
    if (!id) { router.push('/interview/create'); return; }
    setIsNavigating(true);
    setEndError('');
    try {
      await endInterview(id);
      if (skipTheCodingRound) await skipCoding(id);
      router.push(path);
    } catch (err: any) {
      setEndError(err.message || 'Could not reach the server. Check your connection and try again.');
      setIsNavigating(false);
    }
  };

  // Post-interview screen
  if (phase === 'finished') {
    // The first answer is only the reply to the greeting; a report needs an interview question answered
    const answered = (session?.answersUsed ?? 0) >= 2;
    if (alreadyHasFeedback) return null;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950">
        <div className="max-w-xl w-full bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <Code2 className="h-16 w-16 text-primary-200 mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-4 text-white">{answered ? 'Interview Complete! 🎉' : 'Interview Ended'}</h2>
          <p className="text-gray-400 mb-8">
            {answered
              ? 'Would you like to do the coding challenge before you see your report? It is optional.'
              : 'The interview ended before an interview question was answered, so there is no coding round for it.'}
          </p>
          <div className="flex flex-col gap-4">
            {endError && (
              <p role="alert" className="text-sm text-amber-300">{endError}</p>
            )}
            {answered && (
              <Button onClick={() => leaveFor('/interview/coding', false)}
                size="lg" disabled={isNavigating}
                className="w-full py-6 text-lg bg-green-600 hover:bg-green-700 cursor-pointer text-white">
                {isNavigating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-5 w-5" />}
                Yes, Take Coding Round
              </Button>
            )}
            <Button onClick={() => leaveFor('/interview/feedback', true)} variant="outline" size="lg" disabled={isNavigating}
              className="w-full py-6 text-lg cursor-pointer border-gray-700 text-gray-300 hover:bg-gray-800">
              {isNavigating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SkipForward className="mr-2 h-5 w-5" />}
              {answered ? <>Skip &amp; View Feedback</> : 'View Feedback'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 z-50 bg-[#202124] text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        {!notice && <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />}
        <p role="status" className={notice ? 'text-amber-300 text-sm' : 'text-gray-300 text-sm'}>
          {notice || (slowConnect
            ? 'Waking up the server. After a quiet spell this can take up to a minute. Please keep this page open.'
            : 'Loading your interview…')}
        </p>
        <Link href="/" className="text-sm text-gray-400 underline underline-offset-4 hover:text-white">Back to dashboard</Link>
      </div>
    );
  }

  // Lobby: join a new interview, or come back to one after a refresh
  if (phase === 'lobby' && session) {
    const resuming = session.transcript.length > 1;
    return (
      <div className="fixed inset-0 z-50 bg-[#202124] text-white flex items-center justify-center p-4 overflow-y-auto">
        <div className="max-w-md w-full bg-[#2d2e30] border border-white/10 rounded-xl p-6 sm:p-8 shadow-2xl my-auto">
          <div className="w-16 h-16 rounded-full border-2 border-white/10 overflow-hidden mx-auto mb-4">
            <AlexAvatar className="w-full h-full" />
          </div>
          <h2 className="text-2xl font-bold mb-3 text-center">
            {resuming ? 'Your interview is still in progress' : 'Ready to join?'}
          </h2>
          <p className="text-gray-300 text-sm mb-4 leading-relaxed text-center">
            {resuming
              ? `Nothing was lost. You have given ${session.answersUsed} of up to ${session.maxAnswers} answers, and Alex will repeat the question you were on.`
              : 'Alex, your AI interviewer, will greet you and then ask about your experience.'}
          </p>

          <ul className="text-sm text-gray-300 space-y-2 mb-6 list-none">
            <li><strong className="text-white">Sound on.</strong> Alex speaks out loud.</li>
            <li>
              <strong className="text-white">Answering.</strong>{' '}
              {sttSupported
                ? 'Your browser will ask to use the microphone. Speak, or type if you prefer. What you say is sent after a short pause, which you can change or turn off in the room.'
                : 'This browser cannot take voice input, so you will type your answers.'}
            </li>
            <li><strong className="text-white">Camera, optional.</strong> It is used only inside your browser, to remind you to stay in view. Nothing is recorded or sent anywhere.</li>
            <li><strong className="text-white">Length.</strong> Up to {Math.round(totalSecs / 60)} minutes and {session.maxAnswers} answers. The clock starts with your first answer.</li>
            <li><strong className="text-white">Ending.</strong> The red button ends the interview for good.</li>
          </ul>

          {resuming && secsLeft !== null && (
            <p className={`font-mono text-sm mb-4 text-center ${isWarning ? 'text-red-400' : 'text-gray-300'}`}>
              {timeUp ? 'Time is up — one last answer.' : `${mins}:${secs} left`}
            </p>
          )}
          <Button onClick={enterCall} size="lg" autoFocus
            className="w-full py-6 text-lg bg-blue-600 hover:bg-blue-700 cursor-pointer text-white">
            <Play className="mr-2 h-5 w-5" /> {resuming ? 'Resume interview' : 'Join interview'}
          </Button>
          <Link href="/" className="block mt-4 text-center text-sm text-gray-400 underline underline-offset-4 hover:text-white">
            Not now, back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Main UI
  return (
    <div className="fixed inset-0 z-50 bg-[#202124] text-white flex flex-col font-sans overflow-hidden select-none">

      {/* Main canvas */}
      <div className="flex-1 flex flex-col lg:flex-row p-3 gap-3 pb-0 min-h-0">

        {/* Stage: a short strip on small screens so the transcript and answer box get the room */}
        <div className="h-36 shrink-0 lg:h-auto lg:shrink lg:flex-1 min-h-0 flex items-center justify-center bg-[#2d2e30] rounded-xl relative overflow-hidden border border-white/5 shadow-2xl">

          <div className="flex flex-col items-center gap-2 lg:gap-4">
            {/* Avatar */}
            <div className="relative">
              <div className={`absolute inset-0 rounded-full blur-2xl transition-all duration-500 bg-blue-500 ${isAiSpeaking ? 'opacity-50 scale-150' : 'opacity-10 scale-100'}`} />
              <div className={`relative w-16 h-16 lg:w-36 lg:h-36 rounded-full border-4 overflow-hidden shadow-2xl z-10 transition-all duration-300 ${isAiSpeaking ? 'border-blue-400 shadow-blue-500/40' : 'border-white/10'}`}>
                <AlexAvatar className={`w-full h-full transition-transform duration-500 ${isAiSpeaking ? 'scale-110' : 'scale-100'}`} />
              </div>
            </div>

            {/* Status row */}
            <div role="status" className="flex items-center gap-2 min-h-6">
              {isSaving && <><Loader2 className="w-4 h-4 text-blue-400 animate-spin" /><span className="text-sm text-gray-300">Ending the call…</span></>}
              {isThinking && !isSaving && <><Loader2 className="w-4 h-4 text-blue-400 animate-spin" /><span className="text-sm text-gray-300">Alex is thinking…</span></>}
              {isAiSpeaking && !isThinking && !isSaving && (
                <div className="flex gap-1 items-center">
                  <span aria-hidden="true" className="flex gap-1 items-end">
                    {[12, 20, 12].map((h, i) => (
                      <span key={i} className="w-1 bg-blue-400 rounded-full animate-bounce"
                        style={{ height: `${h}px`, animationDelay: `${i * 150}ms` }} />
                    ))}
                  </span>
                  <span className="ml-2 text-sm text-gray-300">Alex is speaking</span>
                  <button onClick={interruptAlex}
                    className="ml-2 px-3 py-1.5 rounded-md text-sm text-blue-300 hover:text-white hover:bg-white/10 underline underline-offset-2 cursor-pointer">
                    Answer now
                  </button>
                </div>
              )}
              {!isThinking && !isAiSpeaking && !isSaving && (
                <span className="text-sm text-gray-400">Alex — AI Interviewer</span>
              )}
            </div>

            {/* Live caption of what Alex is saying (the transcript carries it on small screens) */}
            {isAiSpeaking && !isSaving && latestAiText && (
              <p aria-hidden="true" className="hidden lg:block max-w-xl px-6 text-center text-lg leading-relaxed text-gray-200">
                {latestAiText}
              </p>
            )}
          </div>

          {/* Attention nudge */}
          {attentionNudge && !isSaving && (
            <div role="status" className="absolute top-2 lg:top-4 left-1/2 -translate-x-1/2 z-20 flex items-start gap-2 w-max max-w-[92%] lg:max-w-md px-3 py-2 lg:px-4 lg:py-2.5 rounded-lg bg-amber-950/95 border border-amber-500/50 text-amber-200 text-xs lg:text-sm shadow-lg">
              <Eye className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{attentionNudge}</span>
            </div>
          )}

          {/* Camera is off: ask once, and take no for an answer */}
          {!camEnabled && !camPromptDismissed && !isSaving && (
            <div className="absolute bottom-2 left-2 lg:bottom-4 lg:left-4 z-20 max-w-[62%] lg:max-w-xs p-3 rounded-lg bg-[#202124]/95 border border-white/15 text-xs lg:text-sm shadow-xl">
              <p className="text-gray-200 mb-2">Your camera is off. Turning it on makes this feel like a real interview.</p>
              <div className="flex gap-2">
                <button onClick={() => startCamera(true)} className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer">Turn on camera</button>
                <button onClick={() => setCamPromptDismissed(true)} className="px-3 py-1.5 rounded-md bg-[#3C4043] hover:bg-[#4d5155] text-gray-200 text-xs cursor-pointer">No thanks</button>
              </div>
            </div>
          )}

          {/* Webcam PiP */}
          <div className="absolute bottom-2 right-2 lg:bottom-4 lg:right-4 w-24 lg:w-52 aspect-video rounded-xl overflow-hidden border border-white/20 shadow-xl bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
            {!camEnabled && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#3C4043]">
                <VideoOff className="w-6 h-6 lg:w-8 lg:h-8 text-gray-300" />
              </div>
            )}
            <div className="absolute bottom-1 left-2 z-20 text-xs text-white/80 bg-black/50 px-1 rounded">You</div>
          </div>

          {/* Timer badge — top left */}
          <div className="absolute top-2 left-3 lg:top-4 lg:left-4 flex flex-col gap-1.5">
            <span className={`font-mono text-lg font-bold tabular-nums leading-none ${isWarning ? 'text-red-400' : 'text-gray-300'}`}>
              {mins}:{secs}
            </span>
            <div className="w-20 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ${isWarning ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${totalSecs ? (shownSecs / totalSecs) * 100 : 100}%` }} />
            </div>
          </div>
        </div>

        {/* Transcript and answer panel (below the stage on small screens) */}
        <div className="flex flex-col w-full lg:w-[340px] flex-1 lg:flex-none bg-[#2d2e30] rounded-xl p-3 lg:p-4 border border-white/5 shadow-lg min-h-0 select-text">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 lg:mb-3 shrink-0">Live Transcript</h3>

          {/* Messages */}
          <div role="log" aria-label="Transcript" className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
            {transcript.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.speaker === 'user' ? 'items-end' : 'items-start'}`}>
                <span className="text-xs text-gray-400 mb-0.5">{m.speaker === 'user' ? 'You' : 'Alex'}</span>
                <div className={`px-3 py-2 rounded-2xl text-sm max-w-[92%] leading-relaxed ${
                  m.speaker === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-[#3C4043] text-gray-100 border border-white/8 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}

            {/* The reply as it is being written */}
            {streamingReply && (
              <div className="flex flex-col items-start">
                <span className="text-xs text-gray-400 mb-0.5">Alex</span>
                <div className="px-3 py-2 rounded-2xl text-sm max-w-[92%] leading-relaxed bg-[#3C4043] text-gray-100 border border-white/8 rounded-bl-sm">
                  {streamingReply}
                </div>
              </div>
            )}

            {/* Thinking dots */}
            {isThinking && (
              <div aria-hidden="true" className="flex items-start">
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

          {/* Notices: connection, rejected answers, blocked mic or camera */}
          {notice && (
            <div role="alert" className="mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm shrink-0">
              {notice}
            </div>
          )}

          {/* Input */}
          {canAnswer && (
            <div className="mt-2 pt-2 lg:mt-3 lg:pt-3 border-t border-white/10 shrink-0">
              <p className="text-xs mb-2 flex items-center gap-1.5">
                {isListening
                  ? <><span aria-hidden="true" className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /><span className="text-red-300">Listening…</span></>
                  : <span className="text-gray-400">{!sttSupported
                      ? 'Your turn — type your answer (voice input is not supported in this browser)'
                      : micPausedToType ? 'Typing — the mic is paused until your next turn' : 'Your turn — speak or type'}</span>}
                <button onClick={repeatQuestion} className="ml-auto flex items-center gap-1 px-2 py-1.5 -my-1.5 rounded text-gray-300 hover:text-white hover:bg-white/10 cursor-pointer">
                  <RotateCcw className="w-3 h-3" /> Repeat question
                </button>
              </p>
              {/* Scrollable, auto-growing textarea — max 180px then scrolls */}
              <textarea
                ref={textareaRef}
                aria-label="Your answer"
                className="w-full bg-[#202124] border border-white/20 rounded-lg p-3 text-base lg:text-sm focus:border-blue-400 text-white placeholder:text-gray-400"
                style={{ minHeight: '64px', maxHeight: '180px', overflowY: 'auto', resize: 'none', scrollbarWidth: 'thin' }}
                placeholder="Type, or just speak"
                value={userAnswer}
                maxLength={session?.maxAnswerChars}
                onChange={e => {
                  // Typing takes over from the mic for the rest of this turn. The recogniser is
                  // stopped outright: left running, it would add the phrase it was still working
                  // on a second time and start the auto-send clock again on a half-edited answer.
                  typedRef.current = true;
                  if (wantListenRef.current) pauseListeningToType();
                  setAnswer(e.target.value);
                  sttFinalRef.current = e.target.value ? e.target.value + ' ' : '';
                  lastActivityRef.current = Date.now();
                  cancelAutoSend();
                  // Auto-grow: reset height, then set to scrollHeight
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
                }}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || e.shiftKey) return;
                  // Enter that confirms an input-method composition, or the return key of a
                  // touch keyboard (which has no Shift+Enter), is not "send"
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  if (window.matchMedia('(pointer: coarse)').matches) return;
                  e.preventDefault();
                  submitAnswer();
                }}
              />

              {/* About to send a spoken answer: say so plainly, with a way to stop it */}
              {sendingSoon ? (
                <div role="status" className="mt-1 mb-2 flex items-center justify-between gap-2 rounded-lg bg-amber-500/15 border border-amber-500/40 px-3 py-1.5 text-sm text-amber-200">
                  <span>Sending in {autoSendIn}s…</span>
                  <button onClick={cancelAutoSend} className="px-3 py-1 rounded-md bg-amber-500/25 hover:bg-amber-500/40 text-amber-100 font-medium cursor-pointer">
                    Not yet
                  </button>
                </div>
              ) : (
                <p className="hidden lg:block text-xs text-gray-400 mt-1 mb-2">Press Enter to send · Shift+Enter for a new line</p>
              )}

              {sttSupported && (
                <label className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mt-1 mb-2">
                  Send what I say after a pause of
                  <select
                    value={autoSendSecs}
                    onChange={e => chooseAutoSend(Number(e.target.value))}
                    className="bg-[#202124] border border-white/20 rounded px-1.5 py-1 text-gray-200 cursor-pointer"
                  >
                    {AUTO_SEND_CHOICES.map(seconds => (
                      <option key={seconds} value={seconds}>{seconds ? `${seconds} seconds` : 'never (I will press Send)'}</option>
                    ))}
                  </select>
                </label>
              )}
              <Button onClick={submitAnswer} disabled={!userAnswer.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 cursor-pointer text-white font-medium">
                Send Reply <Play className="ml-2 w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Time-up banner: the candidate may finish their answer; Alex then wraps up */}
          {timeUp && session?.status === 'active' && (
            <div role="status" className="mt-3 pt-2 border-t border-red-500/20 text-sm text-red-300 text-center shrink-0">
              ⏱ Time is up — finish your answer and send it, and Alex will wrap up.
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="h-16 lg:h-20 shrink-0 flex items-center justify-between px-4 lg:px-8 bg-[#202124] border-t border-white/5">
        <div className="hidden sm:block text-gray-400 text-xs font-mono tracking-widest uppercase">{meetingCode}</div>

        <div className="flex items-center gap-3 mx-auto sm:mx-0">
          <button onClick={toggleMic} aria-pressed={micEnabled}
            aria-label={micEnabled ? 'Turn microphone off' : 'Turn microphone on'} title={micEnabled ? 'Turn microphone off' : 'Turn microphone on'}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer ${micEnabled ? 'bg-[#3C4043] hover:bg-[#4d5155]' : 'bg-red-600'}`}>
            {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button onClick={toggleCam} aria-pressed={camEnabled}
            aria-label={camEnabled ? 'Turn camera off' : 'Turn camera on'} title={camEnabled ? 'Turn camera off' : 'Turn camera on'}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer ${camEnabled ? 'bg-[#3C4043] hover:bg-[#4d5155]' : 'bg-red-600'}`}>
            {camEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
          <button onClick={submitAnswer} disabled={!userAnswer.trim() || !canAnswer}
            aria-label="Send answer" title="Send answer"
            className="w-12 h-12 rounded-full flex items-center justify-center bg-[#3C4043] hover:bg-[#4d5155] disabled:opacity-40 transition-all cursor-pointer">
            <CheckCircle className={`w-5 h-5 ${userAnswer.trim() ? 'text-green-400' : ''}`} />
          </button>
          <button onClick={requestEnd} disabled={isSaving}
            aria-label="End interview" title="End interview"
            className="w-12 h-12 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-all cursor-pointer shadow-lg ml-6">
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>

        <div className={`hidden sm:block font-mono text-sm font-bold tabular-nums ${isWarning ? 'text-red-400' : 'text-gray-400'}`}>
          {mins}:{secs}
        </div>
      </div>

      {/* Hanging up is final, so it is confirmed */}
      {confirmEnd && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setConfirmEnd(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="end-title" aria-describedby="end-text"
            onClick={e => e.stopPropagation()}
            className="max-w-sm w-full bg-[#2d2e30] border border-white/15 rounded-xl p-6 shadow-2xl select-text">
            <h2 id="end-title" className="text-xl font-bold mb-2">End the interview now?</h2>
            <p id="end-text" className="text-sm text-gray-300 mb-6">
              You cannot come back to it once it has ended.
              {(session?.answersUsed ?? 0) >= 2
                ? ' You will go on to the optional coding round and your report.'
                : (session?.answersUsed ?? 0) === 1
                  ? ' It already counts as one of your interviews, and with no interview question answered yet there will be nothing to score.'
                  : ' You have not answered anything yet, so it will not count as one of your interviews.'}
            </p>
            <div className="flex gap-3">
              <Button autoFocus onClick={() => setConfirmEnd(false)} variant="outline"
                className="flex-1 cursor-pointer border-gray-600 text-gray-100 hover:bg-white/10">
                Keep going
              </Button>
              <Button onClick={() => { setConfirmEnd(false); endCall(); }}
                className="flex-1 cursor-pointer bg-red-600 hover:bg-red-700 text-white">
                End interview
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

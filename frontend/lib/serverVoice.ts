// The interviewer's natural voice. Each sentence is turned into audio by the API (which calls a
// speech service) and played here in order, so every visitor hears the same voice with nothing
// to install or download. When the API has no speech service, or it stops answering, the page
// uses the browser's built-in voice instead.
import { getToken } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
// After this a sentence is skipped rather than waited for
const SENTENCE_TIMEOUT_MS = 12000;
// One failed sentence should not cost the whole interview its voice; this many in a row does
const MAX_FAILURES = 4;

export class ServerVoice {
  /** True while the API is supplying the voice */
  available = false;
  private interviewId = 0;
  private context: AudioContext | null = null;
  private epoch = 0;                                  // bumped by cancel(): anything older is dropped
  private playing: AudioBufferSourceNode | null = null;
  private tail: Promise<void> = Promise.resolve();    // sentences play one after another
  private cache = new Map<string, AudioBuffer>();     // short lines said often, ready at once
  private lastText = '';                              // the sentence before, sent along so the tone carries over
  private started = false;
  private failures = 0;                               // in a row

  /** Call from a click (browsers only start audio after one). `warmUp` lines are fetched ahead. */
  start(interviewId: number, warmUp: string[] = []) {
    if (typeof AudioContext === 'undefined') return;
    this.interviewId = interviewId;
    this.context = this.context || new AudioContext();
    this.context.resume().catch(() => {});
    this.started = true;
    this.available = true;
    // The short lines are fetched one at a time, after the greeting has had its turn
    setTimeout(async () => {
      for (const line of warmUp) {
        const buffer = await this.fetchAudio(line, '', true);
        if (buffer) this.cache.set(line, buffer);
      }
    }, 4000);
  }

  /** A new reply is starting: give the voice another go if it only stumbled earlier. */
  retry() {
    if (this.started && this.context && this.failures < MAX_FAILURES) this.available = true;
  }

  /** Say one sentence after anything already queued. Resolves true once it has been heard. */
  speak(text: string): Promise<boolean> {
    const epoch = this.epoch;
    const cached = this.cache.get(text);
    const audio = cached ? Promise.resolve<AudioBuffer | null>(cached) : this.fetchAudio(text, this.lastText);
    this.lastText = text;
    const played = this.tail.then(async () => {
      const buffer = await audio;
      if (!buffer || epoch !== this.epoch || !this.context) return false;
      await this.play(buffer, epoch);
      return epoch === this.epoch;
    });
    this.tail = played.then(() => {}, () => {});
    return played;
  }

  /** Stop talking and forget everything queued. */
  cancel() {
    this.epoch++;
    try { this.playing?.stop(); } catch { /* already stopped */ }
    this.playing = null;
    this.tail = Promise.resolve();
    this.lastText = '';
  }

  destroy() {
    this.cancel();
    this.available = false;
    this.context?.close().catch(() => {});
    this.context = null;
  }

  private async fetchAudio(text: string, previous = '', quiet = false): Promise<AudioBuffer | null> {
    if (!this.started || !this.context || (!this.available && !quiet)) return null;
    // `quiet` requests (the ready-made short lines) never switch the voice off when they fail
    const failed = () => {
      if (!quiet) { this.failures++; this.available = false; }
      return null;
    };
    try {
      const response = await fetch(`${API_BASE_URL}/interviews/${this.interviewId}/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
        body: JSON.stringify({ text, previous }),
        signal: AbortSignal.timeout(SENTENCE_TIMEOUT_MS),
      });
      // Switched off, over its limit or broken: the built-in voice takes over for this reply
      if (!response.ok) return failed();
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      if (!quiet) this.failures = 0;
      return buffer;
    } catch {
      return failed();
    }
  }

  private play(buffer: AudioBuffer, epoch: number): Promise<void> {
    return new Promise(resolve => {
      if (!this.context || epoch !== this.epoch) { resolve(); return; }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      source.onended = () => { if (this.playing === source) this.playing = null; resolve(); };
      this.playing = source;
      source.start();
    });
  }
}

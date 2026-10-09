// A natural-sounding voice for the interviewer, generated in the visitor's own browser
// (see public/voice-worker.js). It needs WebGPU and a one-time download of about 330 MB, so it
// is offered, never forced: without it the interview uses the browser's built-in voice.

export type NeuralVoiceState = 'unsupported' | 'off' | 'loading' | 'ready' | 'failed';

const CHOICE_KEY = 'aeroprep:naturalVoice';
// Longer than any sentence should take; after this a sentence is skipped rather than waited for
const SENTENCE_TIMEOUT_MS = 20000;

export function neuralVoiceSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const touchOnly = window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(pointer: fine)').matches;
  return 'gpu' in navigator && typeof Worker !== 'undefined' && typeof AudioContext !== 'undefined' && !touchOnly;
}

export function neuralVoiceChosen(): boolean {
  try { return localStorage.getItem(CHOICE_KEY) === '1'; } catch { return false; }
}

export class NeuralVoice {
  state: NeuralVoiceState = 'off';
  private worker: Worker | null = null;
  private context: AudioContext | null = null;
  private nextId = 1;
  private epoch = 0;                       // bumped by cancel(): anything older is dropped
  private waiting = new Map<number, (audio: AudioBuffer | null) => void>();
  private playing: AudioBufferSourceNode | null = null;
  private tail: Promise<void> = Promise.resolve();   // sentences play one after another
  private cache = new Map<string, AudioBuffer>();    // short lines said often, ready at once

  constructor(private onChange: (state: NeuralVoiceState, percent: number) => void) {
    if (!neuralVoiceSupported()) this.state = 'unsupported';
  }

  /** Start downloading (or loading from the browser's cache). Call from a click. */
  enable(warmUp: string[] = []) {
    if (this.state !== 'off' && this.state !== 'failed') return;
    try { localStorage.setItem(CHOICE_KEY, '1'); } catch { /* still works for this visit */ }
    this.context = this.context || new AudioContext();
    this.set('loading', 0);
    const worker = new Worker('/voice-worker.js', { type: 'module' });
    this.worker = worker;
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') this.set('loading', data.percent);
      else if (data.type === 'ready') {
        this.set('ready', 100);
        for (const line of warmUp) this.generate(line).then(buffer => { if (buffer) this.cache.set(line, buffer); });
      } else if (data.type === 'failed') this.fail();
      else if (data.type === 'audio' || data.type === 'error') {
        const deliver = this.waiting.get(data.id);
        this.waiting.delete(data.id);
        if (!deliver) return;
        if (data.type === 'error' || !this.context) { deliver(null); return; }
        const buffer = this.context.createBuffer(1, data.samples.length, data.rate);
        buffer.copyToChannel(data.samples, 0);
        deliver(buffer);
      }
    };
    worker.onerror = () => this.fail();
    worker.postMessage({ type: 'load' });
  }

  disable() {
    try { localStorage.removeItem(CHOICE_KEY); } catch { /* nothing to forget */ }
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
    if (this.state !== 'unsupported') this.set('off', 0);
  }

  /** The browser only lets audio start after a click; call from one. */
  resume() { this.context?.resume().catch(() => {}); }

  /** Say one sentence after anything already queued. Resolves true once it has been heard. */
  speak(text: string): Promise<boolean> {
    const epoch = this.epoch;
    const cached = this.cache.get(text);
    const audio = cached ? Promise.resolve<AudioBuffer | null>(cached) : this.generate(text);
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
    for (const deliver of this.waiting.values()) deliver(null);
    this.waiting.clear();
    this.tail = Promise.resolve();
  }

  destroy() {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
    this.context?.close().catch(() => {});
    this.context = null;
  }

  private generate(text: string): Promise<AudioBuffer | null> {
    if (this.state !== 'ready' || !this.worker) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.waiting.delete(id); resolve(null); }, SENTENCE_TIMEOUT_MS);
      this.waiting.set(id, buffer => { clearTimeout(timer); resolve(buffer); });
      this.worker!.postMessage({ type: 'speak', id, text });
    });
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

  private fail() {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
    this.set('failed', 0);
  }

  private set(state: NeuralVoiceState, percent: number) {
    this.state = state;
    this.onChange(state, percent);
  }
}

// The natural voice. Runs the Kokoro speech model in the visitor's browser, off the page's
// main thread, so nothing they say or hear is sent to a speech service.
// Messages in:  { type: 'load' }  |  { type: 'speak', id, text }
// Messages out: { type: 'progress', percent } | { type: 'ready' } | { type: 'failed', reason }
//               { type: 'audio', id, samples, rate } | { type: 'error', id }
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = 'am_michael';

let tts = null;
let queue = Promise.resolve(); // one sentence at a time, in the order asked for

self.onmessage = ({ data }) => {
  if (data.type === 'load') {
    queue = queue.then(async () => {
      try {
        const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
        tts = await KokoroTTS.from_pretrained(MODEL, {
          dtype: 'fp32',
          device: 'webgpu',
          progress_callback: (event) => {
            // Only the model file is big enough to be worth reporting
            if (event.status === 'progress' && event.total > 50 * 1024 * 1024) {
              self.postMessage({ type: 'progress', percent: Math.round((event.loaded / event.total) * 100) });
            }
          },
        });
        await tts.generate('Okay.', { voice: VOICE }); // the first run is slow; get it out of the way
        self.postMessage({ type: 'ready' });
      } catch (error) {
        tts = null;
        self.postMessage({ type: 'failed', reason: String(error && error.message ? error.message : error).slice(0, 200) });
      }
    });
    return;
  }

  if (data.type === 'speak') {
    queue = queue.then(async () => {
      try {
        if (!tts) throw new Error('not loaded');
        const audio = await tts.generate(data.text, { voice: VOICE });
        self.postMessage({ type: 'audio', id: data.id, samples: audio.audio, rate: audio.sampling_rate }, [audio.audio.buffer]);
      } catch {
        self.postMessage({ type: 'error', id: data.id });
      }
    });
  }
};

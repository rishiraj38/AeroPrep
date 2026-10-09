// A stand-in for the Anthropic Messages API, for tests. Understands plain and streamed requests.
//
// Words in the newest message make it misbehave the way a real provider sometimes does:
//   FAIL_PLEASE         the request is turned down with a 500 (not charged for)
//   ONLY_MARKER_PLEASE  the reply is nothing but the end marker
//   REFUSE_PLEASE       the model declines (stop_reason "refusal", no text)
//   CUT_OFF_PLEASE      the reply breaks off after its first sentence
//   STALL_PLEASE        the reply starts and then never arrives
//   BAD_JSON_PLEASE     a JSON answer that is not JSON
//   NUL_PLEASE          a JSON answer carrying a character PostgreSQL cannot store
const http = require('http');

// The newest thing the caller said
function newest(body) {
  const last = body.messages[body.messages.length - 1];
  return typeof last.content === 'string' ? last.content : last.content.map((block) => block.text).join('\n');
}

function replyFor(body, count) {
  const flat = JSON.stringify(body);
  const latest = newest(body);
  if (flat.includes('You are Alex')) {
    if (latest.includes('ONLY_MARKER_PLEASE')) return '[END_INTERVIEW]';
    if (latest.includes('CUT_OFF_PLEASE')) return 'First part is here. Second part never finishes';
    return flat.includes('This is your final message')
      ? 'Thank you, that was great. Goodbye! [END_INTERVIEW]'
      : `Interesting. Question after call ${count}?`;
  }
  if (latest.includes('BAD_JSON_PLEASE')) return 'I would rather chat than write JSON.';
  if (flat.includes('-difficulty coding challenge')) {
    if (latest.includes('NUL_PLEASE')) {
      return JSON.stringify({ language: 'javascript', title: 'Echo\u0000 It', description: 'Return\u0000 the input', problemStatement: 'Print what you read.', constraints: 'none', starterCode: '// go', testCases: [{ input: 'a\u0000b', expectedOutput: 'ab' }] });
    }
    return '```json\n' + JSON.stringify({ language: 'Python', title: 'Two Sum', description: 'Find two numbers', problemStatement: 'Given nums and target...', constraints: ['n <= 1e4', 'O(n)'], starterCode: 'def solve(nums, target):\n    pass', testCases: [{ input: [2, 7, 11], expectedOutput: [0, 1] }, { input: { nums: [3, 3] }, expectedOutput: 6 }] }) + '\n```';
  }
  if (flat.includes('You are a code evaluator')) {
    return JSON.stringify({ passed: flat.includes('return correct'), feedback: 'Looks fine.', testResults: [{ input: [1], expected: 2, actual: 2, passed: true }] });
  }
  if (flat.includes('scoring a mock interview')) {
    return 'Here you go:\n' + JSON.stringify({ totalScore: 71.6, interviewScore: '80', codingScore: 52.2, strengths: ['Clear'], weaknesses: ['Depth'], detailedFeedback: 'Solid.', hiringRecommendation: 'Hire',
      answers: [{ exchange: 2, note: 'Good detail on the queue; say how retries were bounded.' }, { exchange: '3', note: 'Too brief.' }, { exchange: 99, note: 'no such exchange' }, { exchange: 'x', note: 'bad' }] });
  }
  return 'unknown prompt';
}

/**
 * @param {object} [options]
 * @param {number} [options.delayMs]      wait before a plain reply
 * @param {number} [options.pieceDelayMs] wait between streamed pieces
 */
function createFakeAnthropic({ delayMs = 0, pieceDelayMs = 0 } = {}) {
  const state = { calls: [], count: 0, spoken: [], voiceRequests: [] };
  const usage = { input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 50, output_tokens: 40 };

  const server = http.createServer((req, res) => {
    if (req.method === 'GET') { res.end(String(state.count)); return; }
    // Also stands in for a speech service: any request for speech gets a third of a second of silence
    if (req.url.includes('/cognitiveservices/') || req.url.includes('/audio/speech') || req.url.includes('/text-to-speech/')) {
      state.voiceRequests.push({ url: req.url, key: req.headers['xi-api-key'] });
      let ssml = ''; req.on('data', (c) => ssml += c); req.on('end', () => {
        state.spoken.push(ssml);
        if (ssml.includes('VOICE_FAIL_PLEASE')) { res.statusCode = 500; return res.end('no voice today'); }
        const samples = 8000; const wav = Buffer.alloc(44 + samples * 2);
        wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
        wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
        res.setHeader('content-type', 'audio/wav'); res.end(wav);
      });
      return;
    }
    let raw = ''; req.on('data', (c) => raw += c); req.on('end', async () => {
      const body = JSON.parse(raw);
      state.count++; state.calls.push(body);
      if (JSON.stringify(body).includes('FAIL_PLEASE')) {
        res.statusCode = 500; res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }));
      }
      const text = replyFor(body, state.count);
      const latest = newest(body);
      const refused = latest.includes('REFUSE_PLEASE');
      const message = { id: 'msg', type: 'message', role: 'assistant', model: body.model, stop_reason: refused ? 'refusal' : 'end_turn', stop_sequence: null };

      if (!body.stream) {
        res.setHeader('content-type', 'application/json');
        return setTimeout(() => res.end(JSON.stringify({ ...message, content: refused ? [] : [{ type: 'text', text }], usage })), delayMs);
      }

      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const send = (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      send({ type: 'message_start', message: { ...message, stop_reason: null, content: [], usage: { ...usage, output_tokens: 1 } } });
      if (latest.includes('STALL_PLEASE')) return; // the connection stays open and silent
      if (refused) {
        send({ type: 'message_delta', delta: { stop_reason: 'refusal', stop_sequence: null }, usage: { output_tokens: usage.output_tokens } });
        send({ type: 'message_stop' });
        return res.end();
      }
      send({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      // Odd-sized pieces, so sentence ends and the control marker get split across them
      for (let i = 0; i < text.length; i += 7) {
        if (pieceDelayMs) await new Promise((r) => setTimeout(r, pieceDelayMs));
        send({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 7) } });
      }
      if (latest.includes('CUT_OFF_PLEASE')) return setTimeout(() => res.destroy(), 50); // the line drops mid-reply
      send({ type: 'content_block_stop', index: 0 });
      send({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usage.output_tokens } });
      send({ type: 'message_stop' });
      res.end();
    });
  });
  return { server, state };
}

module.exports = { createFakeAnthropic };

// Standalone: node fake-anthropic.js <port> [pieceDelayMs]
if (require.main === module) {
  const { server } = createFakeAnthropic({ delayMs: 1500, pieceDelayMs: Number(process.argv[3] || 60) });
  server.listen(Number(process.argv[2]), () => console.log('FAKE_LLM_READY'));
}

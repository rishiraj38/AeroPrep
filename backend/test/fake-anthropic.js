// A stand-in for the Anthropic Messages API, for tests. Understands plain and streamed requests.
const http = require('http');

function replyFor(body, count) {
  const flat = JSON.stringify(body);
  if (flat.includes('You are Alex')) {
    return flat.includes('This is your final message')
      ? 'Thank you, that was great. Goodbye! [END_INTERVIEW]'
      : `Interesting. Question after call ${count}?`;
  }
  if (flat.includes('-difficulty coding challenge')) {
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
  const state = { calls: [], count: 0 };
  const usage = { input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 50, output_tokens: 40 };

  const server = http.createServer((req, res) => {
    if (req.method === 'GET') { res.end(String(state.count)); return; }
    let raw = ''; req.on('data', (c) => raw += c); req.on('end', async () => {
      const body = JSON.parse(raw);
      state.count++; state.calls.push(body);
      if (JSON.stringify(body).includes('FAIL_PLEASE')) {
        res.statusCode = 500; res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }));
      }
      const text = replyFor(body, state.count);
      const message = { id: 'msg', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null };

      if (!body.stream) {
        res.setHeader('content-type', 'application/json');
        return setTimeout(() => res.end(JSON.stringify({ ...message, content: [{ type: 'text', text }], usage })), delayMs);
      }

      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const send = (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      send({ type: 'message_start', message: { ...message, stop_reason: null, content: [], usage: { ...usage, output_tokens: 1 } } });
      send({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      // Odd-sized pieces, so sentence ends and the control marker get split across them
      for (let i = 0; i < text.length; i += 7) {
        if (pieceDelayMs) await new Promise((r) => setTimeout(r, pieceDelayMs));
        send({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 7) } });
      }
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

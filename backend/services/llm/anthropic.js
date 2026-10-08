const Anthropic = require('@anthropic-ai/sdk');

// One retry at most: every attempt is held inside the interview's lock while the candidate waits,
// and a retried call that was merely slow is paid for twice
const MAX_RETRIES = 1;
const EPHEMERAL = { type: 'ephemeral' };

// With `cache`, the system prompt and the conversation so far are marked as a reusable prefix,
// so each turn of an interview re-reads the earlier turns at the cached rate.
function buildMessages(messages, turnNote, cache) {
  if (!turnNote && !cache) return messages;
  const last = messages[messages.length - 1];
  const content = [{ type: 'text', text: last.content, ...(cache ? { cache_control: EPHEMERAL } : {}) }];
  if (turnNote) content.push({ type: 'text', text: turnNote });
  return [...messages.slice(0, -1), { role: last.role, content }];
}

// Marks a failure the provider did not charge for: it turned the request down, or was never reached.
// Every other failure (a timeout, a reply that broke off) may have been paid for.
function unbilled(error) {
  error.billed = false;
  return error;
}

function toUsage(usage = {}) {
  const cachedTokens = usage.cache_read_input_tokens || 0;
  return {
    inputTokens: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + cachedTokens,
    outputTokens: usage.output_tokens || 0,
    cachedTokens,
  };
}

function createAnthropicProvider({ apiKey, baseURL, effort }) {
  const client = new Anthropic({
    ...(apiKey ? { apiKey } : {}),
    ...(baseURL ? { baseURL } : {}),
    maxRetries: MAX_RETRIES,
  });

  return async function complete({ model, system, messages, turnNote, cache, maxTokens, onText, timeoutMs }) {
    const params = { model, max_tokens: maxTokens, messages: buildMessages(messages, turnNote, cache) };
    if (system) {
      params.system = cache ? [{ type: 'text', text: system, cache_control: EPHEMERAL }] : system;
    }
    if (effort) params.output_config = { effort };

    let response;
    let timedOut = false;
    let started = false; // part of the reply has arrived
    try {
      if (onText) {
        // Streamed: text reaches the caller sentence by sentence instead of all at the end
        const stream = client.messages.stream(params, { timeout: timeoutMs });
        // The SDK's own timeout only covers the wait for the reply to begin. This one covers the
        // whole reply, so a connection that goes quiet half way cannot hold the caller for ever.
        const deadline = setTimeout(() => {
          timedOut = true;
          stream.abort();
        }, timeoutMs);
        stream.on('text', (delta) => {
          started = true;
          try { onText(delta); } catch (error) { console.error('onText handler failed:', error.message); }
        });
        try {
          response = await stream.finalMessage();
        } finally {
          clearTimeout(deadline);
        }
      } else {
        response = await client.messages.create(params, { timeout: timeoutMs });
      }
    } catch (error) {
      if (timedOut || error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new Error('Anthropic took too long to reply.');
      }
      if (error instanceof Anthropic.AuthenticationError) {
        throw unbilled(new Error('Anthropic rejected the API key. Check AI_API_KEY.'));
      }
      if (error instanceof Anthropic.NotFoundError) {
        throw unbilled(new Error(`Anthropic does not recognise the model "${model}". Check AI_MODEL.`));
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw unbilled(new Error('Anthropic rate limit reached. Try again shortly.'));
      }
      if (error instanceof Anthropic.APIConnectionError) {
        const failure = new Error(`Could not reach Anthropic: ${error.message}`);
        throw started ? failure : unbilled(failure);
      }
      if (error instanceof Anthropic.APIError) {
        const failure = new Error(`Anthropic API error ${error.status ?? ''}: ${error.message}`);
        // An error status means the request was turned down rather than run
        throw error.status && !started ? unbilled(failure) : failure;
      }
      throw error;
    }

    // From here on the call ran to the end and was paid for, whatever came back. `completed`
    // tells the caller so, and `usage` what it cost.
    const usage = toUsage(response.usage);
    if (response.stop_reason === 'refusal') {
      throw Object.assign(new Error('The model declined to answer this request.'), { usage, completed: true });
    }

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (!text) {
      throw Object.assign(new Error(`Model returned no text (stop_reason: ${response.stop_reason}).`), { usage, completed: true });
    }

    return { text, usage };
  };
}

module.exports = createAnthropicProvider;

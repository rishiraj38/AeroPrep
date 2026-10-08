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
    try {
      if (onText) {
        // Streamed: text reaches the caller sentence by sentence instead of all at the end
        const stream = client.messages.stream(params, { timeout: timeoutMs });
        stream.on('text', (delta) => {
          try { onText(delta); } catch (error) { console.error('onText handler failed:', error.message); }
        });
        response = await stream.finalMessage();
      } else {
        response = await client.messages.create(params, { timeout: timeoutMs });
      }
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new Error('Anthropic rejected the API key. Check AI_API_KEY.');
      }
      if (error instanceof Anthropic.NotFoundError) {
        throw new Error(`Anthropic does not recognise the model "${model}". Check AI_MODEL.`);
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new Error('Anthropic rate limit reached. Try again shortly.');
      }
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Anthropic API error ${error.status ?? ''}: ${error.message}`);
      }
      throw error;
    }

    if (response.stop_reason === 'refusal') {
      throw new Error('The model declined to answer this request.');
    }

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (!text) throw new Error(`Model returned no text (stop_reason: ${response.stop_reason}).`);

    const usage = response.usage || {};
    const cachedTokens = usage.cache_read_input_tokens || 0;
    return {
      text,
      usage: {
        inputTokens: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + cachedTokens,
        outputTokens: usage.output_tokens || 0,
        cachedTokens,
      },
    };
  };
}

module.exports = createAnthropicProvider;

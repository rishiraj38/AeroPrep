// Chat Completions client for OpenAI and every provider that mirrors its API
// (OpenRouter, Gemini, Groq, Ollama, self-hosted gateways).

const TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 3;

function createOpenAICompatibleProvider({ provider, apiKey, model, baseURL }) {
  const url = `${baseURL.replace(/\/+$/, '')}/chat/completions`;
  // OpenAI's newer models reject max_tokens; everyone else still expects it.
  const limitField = provider === 'openai' ? 'max_completion_tokens' : 'max_tokens';

  // These providers cache repeated prefixes on their own, so `cache` needs no markers here.
  return async function complete({ system, messages, turnNote, maxTokens }) {
    const turns = [...messages];
    if (turnNote) {
      const last = turns[turns.length - 1];
      turns[turns.length - 1] = { role: last.role, content: `${last.content}\n\n${turnNote}` };
    }
    const body = JSON.stringify({
      model,
      messages: system ? [{ role: 'system', content: system }, ...turns] : turns,
      [limitField]: maxTokens,
    });

    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body,
        });

        if (!response.ok) {
          const detail = (await response.text()).slice(0, 300);
          const error = new Error(`${provider} API error ${response.status}: ${detail}`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }

        const data = await response.json();
        const text = (data?.choices?.[0]?.message?.content || '').trim();
        if (!text) throw new Error(`Model returned no text (finish_reason: ${data?.choices?.[0]?.finish_reason}).`);
        return {
          text,
          usage: {
            inputTokens: data?.usage?.prompt_tokens || 0,
            outputTokens: data?.usage?.completion_tokens || 0,
            cachedTokens: data?.usage?.prompt_tokens_details?.cached_tokens || 0,
          },
        };
      } catch (error) {
        lastError = error;
        // Network failures and timeouts have no `retryable` flag and are worth retrying.
        if (error.retryable === false || attempt === MAX_ATTEMPTS) break;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw lastError;
  };
}

module.exports = createOpenAICompatibleProvider;

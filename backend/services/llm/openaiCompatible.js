// Chat Completions client for OpenAI and every provider that mirrors its API
// (OpenRouter, Gemini, Groq, Ollama, self-hosted gateways).

// One retry at most: every attempt is held inside the interview's lock while the candidate waits
const MAX_ATTEMPTS = 2;

// Reads a streamed (server-sent events) completion, passing each piece of text to onText
async function readStream(response, onText) {
  const decoder = new TextDecoder();
  let buffered = '';
  let text = '';
  let usage = null;
  let finishReason = null;

  for await (const chunk of response.body) {
    buffered += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffered.indexOf('\n')) !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      let event;
      try { event = JSON.parse(data); } catch { continue; }
      const choice = event.choices?.[0];
      if (choice?.delta?.content) {
        text += choice.delta.content;
        try { onText(choice.delta.content); } catch (error) { console.error('onText handler failed:', error.message); }
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (event.usage) usage = event.usage;
    }
  }
  return { text, usage, finishReason };
}

function toUsage(usage) {
  return {
    inputTokens: usage?.prompt_tokens || 0,
    outputTokens: usage?.completion_tokens || 0,
    cachedTokens: usage?.prompt_tokens_details?.cached_tokens || 0,
  };
}

function createOpenAICompatibleProvider({ provider, apiKey, baseURL }) {
  const url = `${baseURL.replace(/\/+$/, '')}/chat/completions`;
  // OpenAI's newer models reject max_tokens; everyone else still expects it.
  const limitField = provider === 'openai' ? 'max_completion_tokens' : 'max_tokens';
  // Set the first time a provider turns a streamed request down, so later calls skip straight to plain ones
  let streamingRefused = false;

  // These providers cache repeated prefixes on their own, so `cache` needs no markers here.
  return async function complete({ model, system, messages, turnNote, maxTokens, onText, timeoutMs }) {
    const turns = [...messages];
    if (turnNote) {
      const last = turns[turns.length - 1];
      turns[turns.length - 1] = { role: last.role, content: `${last.content}\n\n${turnNote}` };
    }
    const request = {
      model,
      messages: system ? [{ role: 'system', content: system }, ...turns] : turns,
      [limitField]: maxTokens,
    };

    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const streaming = !!onText && !streamingRefused;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      let started = false; // some text has already been handed to the caller
      try {
        const response = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify(streaming
            ? { ...request, stream: true, stream_options: { include_usage: true } }
            : request),
        });

        if (!response.ok) {
          const detail = (await response.text()).slice(0, 300);
          // A provider that does not understand the streaming options: ask again the plain way
          if (streaming && response.status === 400) {
            streamingRefused = true;
            attempt--;
            continue;
          }
          const error = new Error(`${provider} API error ${response.status}: ${detail}`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }

        if (streaming) {
          const streamed = await readStream(response, (delta) => { started = true; onText(delta); });
          const text = streamed.text.trim();
          if (!text) throw new Error(`Model returned no text (finish_reason: ${streamed.finishReason}).`);
          return { text, usage: toUsage(streamed.usage) };
        }

        const data = await response.json();
        const text = (data?.choices?.[0]?.message?.content || '').trim();
        if (!text) throw new Error(`Model returned no text (finish_reason: ${data?.choices?.[0]?.finish_reason}).`);
        if (onText) onText(text);
        return { text, usage: toUsage(data?.usage) };
      } catch (error) {
        lastError = error;
        // Network failures and timeouts have no `retryable` flag and are worth retrying,
        // unless part of the reply was already delivered: repeating it would say it twice.
        if (started || error.retryable === false || attempt === MAX_ATTEMPTS) break;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw lastError;
  };
}

module.exports = createOpenAICompatibleProvider;

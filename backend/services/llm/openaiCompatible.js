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
  // Set once a provider has turned a streamed request down and then taken the same request
  // plain, so later calls skip straight to plain ones
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
    let refusedHere = false; // this request was turned down as a stream and is being sent plain
    // What earlier attempts of this request cost, when they ran to the end but could not be used
    const spent = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    const addSpent = (usage) => {
      for (const key of Object.keys(spent)) spent[key] += usage[key];
      return { ...spent };
    };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const streaming = !!onText && !streamingRefused && !refusedHere;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      let reached = false; // the provider answered at all
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

        reached = true;

        if (!response.ok) {
          const detail = (await response.text()).slice(0, 300);
          // Possibly a provider that does not understand the streaming options: ask again the plain way
          if (streaming && response.status === 400) {
            refusedHere = true;
            attempt--;
            continue;
          }
          const error = new Error(`${provider} API error ${response.status}: ${detail}`);
          error.retryable = response.status === 429 || response.status >= 500;
          error.billed = false; // turned down rather than run
          throw error;
        }

        if (streaming) {
          const streamed = await readStream(response, (delta) => { started = true; onText(delta); });
          const text = streamed.text.trim();
          const usage = addSpent(toUsage(streamed.usage));
          // A call that ran to the end was paid for, whatever came back: `completed` says so
          if (!text) throw Object.assign(new Error(`Model returned no text (finish_reason: ${streamed.finishReason}).`), { usage, completed: true });
          return { text, usage };
        }

        const data = await response.json();
        const text = (data?.choices?.[0]?.message?.content || '').trim();
        const usage = addSpent(toUsage(data?.usage));
        if (!text) throw Object.assign(new Error(`Model returned no text (finish_reason: ${data?.choices?.[0]?.finish_reason}).`), { usage, completed: true });
        // The plain form went through, so it was streaming this provider would not take
        if (refusedHere) streamingRefused = true;
        if (onText) onText(text);
        return { text, usage };
      } catch (error) {
        lastError = error;
        // fetch itself failing (as opposed to timing out) means the provider was never reached
        if (!reached && error.name === 'TypeError') error.billed = false;
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

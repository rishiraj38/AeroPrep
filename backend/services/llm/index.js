// Provider-agnostic LLM entry point.
// Configure with AI_API_KEY + AI_MODEL (and optionally AI_PROVIDER / AI_BASE_URL) — see .env.example.

const PROVIDERS = {
  anthropic:  { keyEnv: 'ANTHROPIC_API_KEY',  defaultModel: 'claude-opus-5-5' },
  openai:     { keyEnv: 'OPENAI_API_KEY',     baseURL: 'https://api.openai.com/v1' },
  openrouter: { keyEnv: 'OPENROUTER_API_KEY', baseURL: 'https://openrouter.ai/api/v1' },
  gemini:     { keyEnv: 'GEMINI_API_KEY',     baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  groq:       { keyEnv: 'GROQ_API_KEY',       baseURL: 'https://api.groq.com/openai/v1' },
  ollama:     { baseURL: 'http://localhost:11434/v1' },
  custom:     {}, // any OpenAI-compatible endpoint, via AI_BASE_URL
};

// Used to pick the provider from the key alone when AI_PROVIDER is not set. Order matters.
const KEY_PREFIXES = [
  ['sk-ant-', 'anthropic'],
  ['sk-or-', 'openrouter'],
  ['gsk_', 'groq'],
  ['AIza', 'gemini'],
  ['sk-', 'openai'],
];

function detectProvider(apiKey) {
  if (apiKey) {
    const match = KEY_PREFIXES.find(([prefix]) => apiKey.startsWith(prefix));
    if (match) return match[1];
  }
  const fromEnv = Object.keys(PROVIDERS).find((name) => PROVIDERS[name].keyEnv && process.env[PROVIDERS[name].keyEnv]);
  if (fromEnv) return fromEnv;
  if (process.env.AI_BASE_URL) return 'custom';
  throw new Error('No AI provider configured. Set AI_API_KEY and AI_MODEL (see backend/.env.example).');
}

function resolveConfig() {
  let apiKey = process.env.AI_API_KEY || '';
  const provider = (process.env.AI_PROVIDER || detectProvider(apiKey)).toLowerCase();
  const preset = PROVIDERS[provider];
  if (!preset) {
    throw new Error(`Unknown AI_PROVIDER "${provider}". Use one of: ${Object.keys(PROVIDERS).join(', ')}.`);
  }

  if (!apiKey && preset.keyEnv) apiKey = process.env[preset.keyEnv] || '';
  const model = process.env.AI_MODEL || preset.defaultModel;
  if (!model) throw new Error(`AI_MODEL is required for provider "${provider}".`);
  const baseURL = process.env.AI_BASE_URL || preset.baseURL;
  if (provider !== 'anthropic' && !baseURL) throw new Error(`AI_BASE_URL is required for provider "${provider}".`);

  return {
    provider,
    apiKey,
    model,
    // Optional cheaper, quicker model for the live interview turns; everything else uses `model`
    fastModel: process.env.AI_MODEL_FAST || model,
    baseURL,
    effort: process.env.AI_EFFORT || ''
  };
}

let active = null;

function getActive() {
  if (!active) {
    const config = resolveConfig();
    const createProvider = config.provider === 'anthropic'
      ? require('./anthropic')
      : require('./openaiCompatible');
    active = { config, complete: createProvider(config) };
  }
  return active;
}

// Process-wide counters, shown on /monitor and /metrics
const stats = { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, latencies: [] };

/**
 * Runs one completion on the configured provider.
 *
 * @param {object} request
 * @param {string} [request.system]
 * @param {Array<{role: 'user'|'assistant', content: string}>} request.messages
 * @param {string} [request.turnNote]  Per-turn instruction appended to the last user message.
 *   It is never part of the stored history, so it sits after the cache breakpoint.
 * @param {boolean} [request.cache]    Mark `system` + `messages` as a reusable prefix (multi-turn chats).
 * @param {boolean} [request.fast]     Use AI_MODEL_FAST when it is set (live interview turns).
 * @param {(delta: string) => void} [request.onText]  Receive the reply as it is generated.
 * @param {number} [request.maxTokens]
 * @param {number} [request.timeoutMs]  How long to wait for the provider before giving up (or retrying once).
 * @returns {Promise<{text: string, usage: {inputTokens: number, outputTokens: number, cachedTokens: number}}>}
 */
async function chat({ system = '', messages, turnNote = '', cache = false, fast = false, onText = null, maxTokens = 16000, timeoutMs = 60000 }) {
  const startedAt = Date.now();
  stats.calls++;
  try {
    const { config, complete } = getActive();
    const model = fast ? config.fastModel : config.model;
    const result = await complete({ model, system, messages, turnNote, cache, maxTokens, onText, timeoutMs });
    stats.inputTokens += result.usage.inputTokens;
    stats.outputTokens += result.usage.outputTokens;
    stats.cachedTokens += result.usage.cachedTokens;
    return result;
  } catch (error) {
    stats.errors++;
    throw error;
  } finally {
    stats.latencies.push(Date.now() - startedAt);
    if (stats.latencies.length > 100) stats.latencies.shift(); // keep last 100
  }
}

// "provider/model" for logs and the monitor page; never throws.
function describeProvider() {
  try {
    const { provider, model, fastModel } = getActive().config;
    return `${provider}/${model}${fastModel !== model ? ` (live turns: ${fastModel})` : ''}`;
  } catch (error) {
    return `not configured (${error.message})`;
  }
}

module.exports = { chat, describeProvider, stats };

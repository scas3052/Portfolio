// Fixed allowlist of OpenAI-compatible providers the relay may call. Only these
// base URLs are ever contacted, so the relay can't be turned into an open proxy.
// Every model can be overridden with `<ID>_MODEL`, e.g. GROQ_MODEL=qwen/qwen3.8-27b.

const reasoning = (pattern, effort = 'high') => (model) => (pattern.test(model) ? { reasoning_effort: effort } : {})

export const PROVIDERS = [
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    model: 'openai/gpt-oss-120b',
    tokenField: 'max_completion_tokens',
    extra: reasoning(/gpt-oss/i),
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    // Routes to whichever free, tool-capable model is available right now.
    model: 'openrouter/free',
    headers: (origin) => ({ 'HTTP-Referer': origin, 'X-Title': 'Gullak' }),
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyEnv: 'CEREBRAS_API_KEY',
    model: 'gpt-oss-120b',
    tokenField: 'max_completion_tokens',
    extra: reasoning(/gpt-oss/i),
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyEnv: 'NVIDIA_API_KEY',
    model: 'meta/llama-3.3-70b-instruct',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    keyEnv: 'MISTRAL_API_KEY',
    model: 'mistral-small-latest',
  },
  {
    id: 'hf',
    label: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    keyEnv: 'HF_TOKEN',
    model: 'openai/gpt-oss-120b',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyEnv: 'GEMINI_API_KEY',
    model: 'gemini-3.8-flash',
  },
  {
    // Any OpenAI-compatible server you run yourself, e.g. Ollama at http://localhost:11434/v1.
    id: 'custom',
    label: 'Custom',
    baseEnv: 'CUSTOM_LLM_BASE_URL',
    keyEnv: 'CUSTOM_LLM_API_KEY',
    keyOptional: true,
    model: 'llama3.1',
  },
]

const clean = (value) => (typeof value === 'string' ? value.trim() : '')

function resolve(def, env) {
  const key = clean(env[def.keyEnv])
  if (!key && !def.keyOptional) return null
  const baseUrl = (def.baseEnv ? clean(env[def.baseEnv]) : def.baseUrl).replace(/\/+$/, '')
  if (!/^https?:\/\/[^/]/i.test(baseUrl)) return null
  const model = clean(env[`${def.id.toUpperCase()}_MODEL`]) || (def.id === 'custom' && clean(env.CUSTOM_LLM_MODEL)) || def.model
  return { ...def, key, baseUrl, model }
}

/** Providers that have the env they need, in `AGENT_PROVIDERS` order when it's set. */
export function configuredProviders(env = {}) {
  const ready = PROVIDERS.map((def) => resolve(def, env)).filter(Boolean)
  const wanted = clean(env.AGENT_PROVIDERS)
    .toLowerCase()
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  if (!wanted.length) return ready
  const byId = new Map(ready.map((p) => [p.id, p]))
  return [...new Set(wanted)].map((id) => byId.get(id)).filter(Boolean)
}

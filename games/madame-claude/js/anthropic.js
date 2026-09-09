// Minimal streaming client for the Anthropic Messages API, called directly
// from the browser with the user's own key.

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_MODEL = 'claude-haiku-4-5';

export const SYSTEM_PROMPT = [
  'You are Madame Claude, a warm, theatrical, slightly mysterious tarot reader.',
  'You interpret the provided cards in their given positions and orientations.',
  "Weave the visitor's own words into the reading where relevant. Be evocative",
  'but kind. Never claim to predict the future with certainty; frame insights',
  'as reflection and possibility. Do not invent cards that were not drawn.',
  'Write in flowing prose, roughly 150–400 words depending on the number of cards,',
  'addressing the visitor directly. Do not use markdown headings or bullet lists.',
].join(' ');

export class AnthropicError extends Error {
  constructor(status, message) {
    super(message || `Anthropic API error (${status})`);
    this.name = 'AnthropicError';
    this.status = status;
  }
}

export function buildUserMessage({ spread, dealt, input, date }) {
  const lines = [];
  const positions = spread.positions.map((p) => p.label).join(' / ');
  lines.push(`Spread: ${spread.name} (${positions})`);
  lines.push('Cards:');
  dealt.forEach((d, i) => {
    const orient = d.reversed ? 'reversed' : 'upright';
    const kws = d.card.keywords[orient].join(', ');
    lines.push(`  ${i + 1}. ${d.position.label} — ${d.card.name} (${orient}); keywords: ${kws}`);
  });
  const words = (input || '').trim();
  lines.push(`Visitor's words: ${words ? JSON.stringify(words) : '(the visitor chose silence)'}`);
  lines.push(`Date: ${date}`);
  return lines.join('\n');
}

export function describeError(err) {
  if (err instanceof AnthropicError) {
    if (err.status === 401 || err.status === 403) return 'The spirits did not recognise that key';
    if (err.status === 429) return 'Too many seekers are calling tonight';
    if (err.status === 404) return 'That model name is unknown to the spirits';
    if (err.status >= 500) return 'The far side of the veil is troubled';
  }
  if (err?.name === 'TypeError') return 'The connection to the spirits was lost';
  return 'The spirits are quiet tonight';
}

/**
 * Streams a reading. Calls onChunk(text) for each text delta and resolves to
 * the full text. Throws AnthropicError / network errors on failure.
 */
export async function streamReading({
  apiKey, model = DEFAULT_MODEL, spread, dealt, input, date, onChunk, signal, maxTokens = 1024,
}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage({ spread, dealt, input, date }) }],
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new AnthropicError(res.status, detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  const handleEvent = (raw) => {
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      let payload;
      try { payload = JSON.parse(json); } catch { continue; }
      if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
        full += payload.delta.text;
        onChunk?.(payload.delta.text);
      } else if (payload.type === 'error') {
        throw new AnthropicError(0, payload.error?.message);
      }
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      handleEvent(event);
    }
  }
  if (buffer.trim()) handleEvent(buffer);
  return full;
}
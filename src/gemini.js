// Google Gemini REST client (no SDK needed, uses Node 18+ global fetch)
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const model = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function key() {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is not set on the server');
  return k;
}

// [{role:'user'|'assistant', content: string | parts[]}] -> Gemini contents
function toContents(messages) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: Array.isArray(m.content) ? m.content : [{ text: String(m.content) }],
  }));
}

function buildBody(messages, system) {
  const body = {
    contents: toContents(messages),
    generationConfig: { maxOutputTokens: parseInt(process.env.MAX_TOKENS) || 4096 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return body;
}

async function failFrom(res) {
  let msg = `Gemini API error (${res.status})`;
  try { msg = (await res.json()).error?.message || msg; } catch {}
  const err = new Error(msg);
  err.status = res.status;
  throw err;
}

function extractText(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || '').join('');
  if (!text && data.promptFeedback?.blockReason) {
    throw new Error(`Blocked by Gemini safety filter: ${data.promptFeedback.blockReason}`);
  }
  return text;
}

// Non-streaming
async function generate({ messages, system }) {
  const res = await fetch(`${BASE}/${model()}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
    body: JSON.stringify(buildBody(messages, system)),
  });
  if (!res.ok) await failFrom(res);
  return extractText(await res.json());
}

// Streaming: calls onText(chunk) for each piece; resolves when finished
async function stream({ messages, system, onText, signal }) {
  const res = await fetch(`${BASE}/${model()}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
    body: JSON.stringify(buildBody(messages, system)),
    signal,
  });
  if (!res.ok) await failFrom(res);

  const decoder = new TextDecoder();
  let buf = '';
  let sent = false;
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (!json || json === '[DONE]') continue;
      try {
        const text = extractText(JSON.parse(json));
        if (text) { sent = true; onText(text); }
      } catch (e) {
        if (e.message.startsWith('Blocked')) throw e;
      }
    }
  }
  if (!sent) throw new Error('Gemini returned an empty response');
}

module.exports = { generate, stream };

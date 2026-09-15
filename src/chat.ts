import { config, llmConfigured } from './config.js';
import type { Evidence } from './db.js';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
const citationOf = (e: Evidence) => ({ id: e.id, path: e.path, lineStart: e.lineStart, lineEnd: e.lineEnd, kind: e.kind });

export async function answer(question: string, evidence: Evidence[], history: ChatMessage[] = []) {
  if (!evidence.length) return { answer: 'اطلاعات کافی برای پاسخ مستند پیدا نکردم. سؤال را با نام صفحه، قابلیت یا عملیات دقیق‌تر بپرس.', unknown: true, mode: 'abstain', citations: [] };
  if (!llmConfigured) return { answer: null, unknown: false, mode: 'evidence-only', evidence, citations: evidence.map(citationOf) };

  const labels = new Map(evidence.map((item, index) => [`E${index + 1}`, item]));
  const packet = [...labels].map(([label, item]) => `[${label}] ${item.path}:${item.lineStart}-${item.lineEnd} (${item.kind})\n${item.content}`).join('\n\n');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.LLM_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.LLM_BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.LLM_API_KEY}` },
      body: JSON.stringify({ model: config.LLM_MODEL, temperature: 0, max_tokens: 900, messages: [
        { role: 'system', content: 'You are an operational assistant grounded only in supplied project evidence. Answer in the user language. Give a short direct answer, then numbered steps. Include access requirements and backend effect only when proven. End every factual step with one or more evidence labels like [E1]. Never cite an unavailable label, never invent UI labels, permissions, states, or effects. If evidence is insufficient, clearly say what is unknown.' },
        ...history.slice(-6),
        { role: 'user', content: `Question: ${question}\n\nProject evidence:\n${packet}` },
      ] }),
    });
    if (!response.ok) throw new Error(`LLM request failed with ${response.status}`);
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('LLM returned an empty answer');
    const used = [...new Set([...text.matchAll(/\[(E\d+)\]/g)].map((match) => match[1]))].filter((label) => labels.has(label));
    if (!used.length) return { answer: 'مدرک کافی پیدا شد، اما پاسخ تولیدشده citation معتبر نداشت؛ برای جلوگیری از حدس نمایش داده نشد.', unknown: true, mode: 'citation-rejected', citations: [] };
    return { answer: text, unknown: false, mode: 'grounded', citations: used.map((label) => citationOf(labels.get(label)!)) };
  } finally { clearTimeout(timer); }
}

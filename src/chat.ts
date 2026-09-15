import { config, llmConfigured } from './config.js';
import { buildSystemPrompt } from './prompt.js';
import type { Evidence } from './db.js';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
const citationOf = (e: Evidence) => ({ id: e.id, path: e.path, lineStart: e.lineStart, lineEnd: e.lineEnd, kind: e.kind });

export async function answer(question: string, evidence: Evidence[], history: ChatMessage[] = []) {
  if (!evidence.length) return { answer: 'برای این سؤال مدرک مرتبطی در نسخه فعلی پروژه پیدا نکردم. اسم صفحه، قابلیت یا کاری که می‌خواهی انجام بدهی را بگو تا دقیق‌تر بررسی کنم.', unknown: true, mode: 'abstain', citations: [] };
  if (!llmConfigured) return { answer: null, unknown: false, mode: 'evidence-only', evidence, citations: evidence.map(citationOf) };

  const labels = new Map(evidence.map((item, index) => [`E${index + 1}`, item]));
  let chars = 0;
  const packet = [...labels].map(([label, item]) => {
    const block = `[${label}] ${item.path}:${item.lineStart}-${item.lineEnd} (${item.kind})\n${item.content}`;
    if (chars + block.length > config.MAX_EVIDENCE_CHARS) return '';
    chars += block.length;
    return block;
  }).filter(Boolean).join('\n\n');
  const safeHistory = history.slice(-config.MAX_HISTORY_MESSAGES).map((message) => ({ ...message, content: message.content.replace(/\[E\d+\]/g, '') }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.LLM_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.LLM_BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.LLM_API_KEY}` },
      body: JSON.stringify({ model: config.LLM_MODEL, temperature: 0.1, max_tokens: config.ANSWER_MAX_TOKENS, messages: [
        { role: 'system', content: buildSystemPrompt() },
        ...safeHistory,
        { role: 'user', content: `سؤال کاربر:\n${question}\n\nمدرک پروژه برای تحلیل:\n${packet}` },
      ] }),
    });
    if (!response.ok) throw new Error(`LLM request failed with ${response.status}`);
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('LLM returned an empty answer');
    const used = [...new Set([...text.matchAll(/\[(E\d+)\]/g)].map((match) => match[1]))].filter((label) => labels.has(label));
    if (!used.length) return { answer: 'مدرک مرتبط پیدا شد، اما پاسخ تولیدشده منبع معتبر نداشت؛ برای جلوگیری از راهنمایی اشتباه نمایش داده نشد.', unknown: true, mode: 'citation-rejected', citations: [] };
    return { answer: text, unknown: false, mode: 'grounded', citations: used.map((label) => citationOf(labels.get(label)!)) };
  } finally { clearTimeout(timer); }
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { config, llmConfigured } from './config.js';
import { db } from './db.js';
import { retrieve } from './retrieve.js';
import { answer, type ChatMessage } from './chat.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const app = Fastify({ logger: true, bodyLimit: 256000 });
await app.register(cors, { origin: false });
app.get('/', async (_, reply) => reply.type('text/html').send(await readFile(path.resolve('public/index.html'), 'utf8')));
app.get('/health/live', async () => ({ ok: true }));
app.get('/health/ready', async (_, reply) => { try { await db.query('SELECT 1'); return { ok: true }; } catch { return reply.code(503).send({ ok: false }); } });
app.get('/api/config', async () => ({ agentName: config.AGENT_NAME, maxQuestionChars: config.MAX_QUESTION_CHARS, maxHistoryMessages: config.MAX_HISTORY_MESSAGES, retrievalLimit: config.RETRIEVAL_LIMIT, llmConfigured }));
app.get('/api/status', async () => {
  const result = await db.query(`SELECT s.revision,s.created_at AS "createdAt",s.files_total AS "filesTotal",s.files_failed AS "filesFailed",count(e.id)::int AS "evidenceTotal" FROM snapshots s LEFT JOIN evidence e ON e.snapshot_id=s.id WHERE s.status='active' GROUP BY s.id LIMIT 1`);
  return { ...(result.rows[0] ?? { revision: null, evidenceTotal: 0 }), llmConfigured };
});
const messageSchema = z.object({ role: z.enum(['user','assistant']), content: z.string().min(1).max(4000) });
app.post('/api/query', async (request, reply) => {
  const parsed = z.object({ question: z.string().min(3).max(config.MAX_QUESTION_CHARS), limit: z.number().int().min(1).max(30).default(config.RETRIEVAL_LIMIT), history: z.array(messageSchema).max(config.MAX_HISTORY_MESSAGES).default([]) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  try { const evidence = await retrieve(parsed.data.question, parsed.data.limit); return await answer(parsed.data.question, evidence, parsed.data.history as ChatMessage[]); }
  catch (error) { request.log.error(error); return reply.code(502).send({ error: error instanceof Error ? error.message : 'Query failed' }); }
});
await app.listen({ host: config.HOST, port: config.PORT });

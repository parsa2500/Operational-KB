import fg from 'fast-glob';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from './db.js';
import { extractTypeScript, type ExtractedEvidence } from './extractors/typescript.js';
import { extractRoslyn } from './extractors/roslyn.js';

const interesting = /(route|path|menu|label|button|form|nav|fetch|axios|http|controller|authorize|permission|role|service|status|state|payment|order|approve|confirm|class=|id=|display:|position:|grid|flex|پرداخت|تایید)/i;
const heuristicKind = (p: string, l: string) => /\.(tsx|jsx|html)$/.test(p) && /(button|menu|route|path|label|form|nav|class=|id=)/i.test(l) ? 'ui' : /\.css$/.test(p) ? 'ui.style' : /(fetch|axios|httpclient|\[Http(Get|Post|Put|Delete|Patch))/i.test(l) ? 'api' : /(authorize|permission|role)/i.test(l) ? 'permission' : /(status|state|approve|confirm|تایید)/i.test(l) ? 'state' : /\.(md|html)$/.test(p) ? 'documentation' : 'code';
const idFor = (revision: string, snapshot: string, e: ExtractedEvidence) => createHash('sha256').update(`${snapshot}:${revision}:${e.path}:${e.lineStart}:${e.kind}:${e.content}`).digest('hex');
const stripNulls = (value: string) => value.replace(/\u0000/g, '');

export async function ingest(root: string) {
  const absoluteRoot = path.resolve(root);
  const files = await fg(['**/*.{ts,tsx,js,jsx,cs,md,json,yaml,yml,html,css}'], { cwd: absoluteRoot, ignore: ['**/.git/**','**/node_modules/**','**/dist/**','**/build/**','**/bin/**','**/obj/**','**/coverage/**','**/*.lock','**/.env*'], onlyFiles: true, followSymbolicLinks: false });
  if (!files.length) throw new Error(`No supported source files found under ${absoluteRoot}`);
  const loaded: Array<{ path: string; content: string }> = [];
  const hash = createHash('sha256'); let failed = 0;
  for (const file of files.sort()) try { const content = stripNulls(await readFile(path.join(absoluteRoot, file), 'utf8')); loaded.push({ path: file.replaceAll('\\','/'), content }); hash.update(file).update(content); } catch { failed++; }
  const revision = hash.digest('hex');
  const existing = await db.query('SELECT id FROM snapshots WHERE revision=$1 AND status=$2 LIMIT 1', [revision, 'active']);
  if (existing.rows[0]) return { snapshot: existing.rows[0].id, revision, filesTotal: files.length, filesFailed: failed, unchanged: true };
  const snapshot = randomUUID(); const client = await db.connect(); const warnings: string[] = [];
  try {
    let semantic: ExtractedEvidence[] = extractTypeScript(absoluteRoot, files);
    if (files.some((file) => file.endsWith('.cs'))) try { semantic.push(...await extractRoslyn(absoluteRoot)); } catch (error) { warnings.push(error instanceof Error ? error.message : String(error)); }
    for (const file of loaded) {
      const lines = file.content.split(/\r?\n/);
      if (/\.(md|html)$/.test(file.path) && file.content.trim()) semantic.push({ source: 'typescript', path: file.path, lineStart: 1, lineEnd: lines.length, kind: 'documentation', title: file.path, content: file.content.slice(0, 8000), metadata: { markup: file.path.endsWith('.html') } });
      for (let i = 0; i < lines.length; i++) { if (!interesting.test(lines[i])) continue; const a = Math.max(0, i - 2), b = Math.min(lines.length, i + 3), text = lines.slice(a, b).join('\n').trim(); if (text) semantic.push({ source: 'typescript', path: file.path, lineStart: a + 1, lineEnd: b, kind: heuristicKind(file.path, lines[i]), title: lines[i].trim().slice(0, 180), content: text, metadata: { fallback: true, fileType: path.extname(file.path).slice(1) } }); }
    }
    await client.query('BEGIN');
    await client.query('INSERT INTO snapshots(id,revision,root_path,status,files_total,files_failed) VALUES($1,$2,$3,$4,$5,$6)', [snapshot, revision, absoluteRoot, 'staging', files.length, failed]);
    const seen = new Set<string>();
    for (const evidence of semantic) {
      const normalized = {
        ...evidence,
        path: stripNulls(evidence.path.replaceAll('\\','/').replace(/^\.\//,'')),
        title: stripNulls(evidence.title),
        content: stripNulls(evidence.content),
      };
      const id = idFor(revision, snapshot, normalized);
      if (seen.has(id)) continue;
      seen.add(id);
      await client.query('INSERT INTO evidence VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING', [id,snapshot,revision,normalized.path,normalized.lineStart,normalized.lineEnd,normalized.kind,normalized.title,normalized.content,{ ...normalized.metadata, analyzerWarning: warnings.length > 0 }]);
    }
    await client.query("UPDATE snapshots SET status='staging' WHERE status='active'"); await client.query("UPDATE snapshots SET status='active' WHERE id=$1", [snapshot]); await client.query('COMMIT');
    return { snapshot, revision, filesTotal: files.length, filesFailed: failed, semanticRecords: seen.size, warnings };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
